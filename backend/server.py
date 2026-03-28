"""
25th Infantry Division API — slim entry point.

All business logic lives in routes/, services/, and middleware/.
This file wires everything together: FastAPI app, routers, CORS,
startup/shutdown lifecycle, and background ingestion.
"""
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import FastAPI, APIRouter
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware

from config import (
    UPLOAD_DIR, FRONTEND_URL,
    VALYU_API_KEY, VALYU_EVENT_REFRESH_MINUTES,
    VALYU_MIN_EVENTS_THRESHOLD, EVENT_PRUNE_DAYS,
    MAX_VALYU_QUERIES_PER_CYCLE,
    OPENAI_INGESTION_INTERVAL_HOURS,
)
from database import db, client

from services.map_service import backfill_map_events
from services.threat_intel import (
    THREAT_QUERIES,
    classify_category, extract_country, extract_keywords_from_text,
    valyu_search, process_search_results, get_start_date,
    _get_cached_response, _set_cached_response,
    _mark_valyu_called, _event_content_hash,
)

# Import all route modules
from routes.auth import router as auth_router
from routes.operations import router as operations_router
from routes.content import router as content_router
from routes.admin import router as admin_router
from routes.roster import router as roster_router
from routes.intel import router as intel_router
from routes.campaigns import router as campaigns_router
from routes.recruitment import router as recruitment_router
from routes.partner import router as partner_router
from routes.map_events import router as map_events_router
from routes.research import router as research_router
from routes.search import router as search_router
from routes.loa import router as loa_router
from routes.pipeline import router as pipeline_router
from routes.shared import router as shared_router
from routes.deployment import router as deployment_router
from routes.adsb import router as adsb_router
from routes.operations_plans import router as operations_plans_router


# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Include all sub-routers into the api_router
api_router.include_router(auth_router)
api_router.include_router(operations_router)
api_router.include_router(content_router)
api_router.include_router(admin_router)
api_router.include_router(roster_router)
api_router.include_router(intel_router)
api_router.include_router(campaigns_router)
api_router.include_router(recruitment_router)
api_router.include_router(partner_router)
api_router.include_router(map_events_router)
api_router.include_router(research_router)
api_router.include_router(search_router)
api_router.include_router(loa_router)
api_router.include_router(pipeline_router)
api_router.include_router(shared_router)
api_router.include_router(deployment_router)
api_router.include_router(adsb_router)
api_router.include_router(operations_plans_router)


@api_router.get("/")
async def root():
    return {"message": "25th Infantry Division API", "status": "operational"}


# Include the api_router in the main app
app.include_router(api_router)

# Serve uploaded files at /api/uploads/
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# CORS configuration
cors_origins_raw = os.environ.get('CORS_ORIGINS', '')
cors_origins = [o.strip().rstrip('/') for o in cors_origins_raw.split(',') if o.strip() and o.strip() != '*']
if FRONTEND_URL and FRONTEND_URL not in cors_origins:
    cors_origins.insert(0, FRONTEND_URL)
if not cors_origins:
    cors_origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ── Error-logging middleware — captures unhandled exceptions ──────────────────

from fastapi.exceptions import RequestValidationError
from starlette.requests import Request
from starlette.responses import JSONResponse
from services.error_log_service import log_error


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log FastAPI/Pydantic request validation errors (422) to error_logs."""
    import json as _json

    body = None
    try:
        body_bytes = await request.body()
        if body_bytes:
            body = _json.loads(body_bytes)
    except Exception:
        pass

    try:
        await log_error(
            source="validation",
            message=f"Request validation error on {request.method} {request.url.path}",
            severity="warning",
            error_type="RequestValidationError",
            request_path=str(request.url.path),
            request_method=request.method,
            request_body=body,
            metadata={"errors": exc.errors()},
        )
    except Exception:
        logger.error("Failed to persist validation error log")

    logger.warning(
        "Validation error on %s %s: %s", request.method, request.url.path, exc.errors()
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions, log to error_logs, and return 500."""
    import traceback as _tb

    body = None
    try:
        body_bytes = await request.body()
        if body_bytes:
            import json as _json
            body = _json.loads(body_bytes)
    except Exception:
        pass

    try:
        await log_error(
            source="unhandled",
            message=str(exc),
            severity="critical",
            error_type=type(exc).__name__,
            stack_trace=_tb.format_exc(),
            request_path=str(request.url.path),
            request_method=request.method,
            request_body=body,
        )
    except Exception:
        logger.error("Failed to persist unhandled exception log")

    logger.error("Unhandled exception on %s %s: %s", request.method,
                 request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ============================================================================
# BACKGROUND INGESTION
# ============================================================================

_background_ingestion_task = None
_loa_expiration_task = None

_OPENAI_THREAT_QUERIES = [
    "Summarize the top 5 active global military conflicts and security threats right now",
    "What are the most urgent geopolitical crises and diplomatic tensions worldwide today",
    "List recent significant terrorist attacks or extremist activity with affected regions",
]


async def _prune_old_events():
    """Delete external_events documents older than EVENT_PRUNE_DAYS days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=EVENT_PRUNE_DAYS)
    result = await db.external_events.delete_many({"ingested_at": {"$lt": cutoff.isoformat()}})
    if result.deleted_count:
        logging.getLogger("valyu").info(
            f"Pruned {result.deleted_count} events older than {EVENT_PRUNE_DAYS} days"
        )


def _ra_result_to_external_event_format(result: dict) -> list:
    """Convert a research-agent result dict into external_events-format dicts."""
    threat_map = {"LOW": "low", "MEDIUM": "medium", "HIGH": "high", "CRITICAL": "critical"}
    threat_level = threat_map.get(
        str(result.get("threat_level", "medium")).upper(), "medium"
    )
    summary = (result.get("summary") or "")[:500]
    regions = result.get("regions") or []
    events = []
    for i, coord in enumerate(result.get("coordinates") or []):
        lat = coord.get("lat")
        lng = coord.get("lng")
        if lat is None or lng is None:
            continue
        region_label = (
            regions[i] if i < len(regions) else (regions[0] if regions else "Unknown Region")
        )
        country, _, _ = extract_country(region_label)
        place_name = region_label or country or "Unknown"
        title = f"{region_label[:60]} – Intelligence Assessment"
        events.append({
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "title": title,
            "summary": summary or title,
            "category": classify_category(summary),
            "threatLevel": threat_level,
            "location": {
                "latitude": float(lat),
                "longitude": float(lng),
                "placeName": place_name,
                "country": country or place_name,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "openai",
            "sourceUrl": "",
            "keywords": extract_keywords_from_text(summary),
            "rawContent": (result.get("full_report") or summary)[:1000],
        })
    return events


async def _run_valyu_ingestion():
    """Fetch Valyu threat events and persist them in external_events."""
    vlog = logging.getLogger("valyu")
    if not VALYU_API_KEY:
        return

    cutoff_dt = datetime.now(timezone.utc) - timedelta(minutes=VALYU_EVENT_REFRESH_MINUTES)
    recent_count = await db.external_events.count_documents(
        {"ingested_at": {"$gte": cutoff_dt.isoformat()}, "provider": "valyu"}
    )
    if recent_count >= VALYU_MIN_EVENTS_THRESHOLD:
        vlog.info(
            f"Valyu ingestion: {recent_count} recent events present, skipping API call"
        )
        return

    vlog.info("Valyu ingestion: fetching fresh events…")
    start_date = get_start_date()
    tasks = [
        valyu_search(q, max_results=10, start_date=start_date)
        for q in THREAT_QUERIES[:MAX_VALYU_QUERIES_PER_CYCLE]
    ]
    results_arrays = await asyncio.gather(*tasks, return_exceptions=True)

    all_results = []
    for r in results_arrays:
        if isinstance(r, list):
            all_results.extend(r)

    events = process_search_results(all_results)

    inserted = 0
    for evt in events:
        content_hash = _event_content_hash(evt)
        evt["content_hash"] = content_hash
        evt["ingested_at"] = datetime.now(timezone.utc).isoformat()
        evt["provider"] = "valyu"
        op = await db.external_events.update_one(
            {"content_hash": content_hash},
            {"$setOnInsert": evt},
            upsert=True,
        )
        if op.upserted_id:
            inserted += 1

    if events:
        await _set_cached_response("threat_events_global", {
            "events": events[:200],
            "count": min(len(events), 200),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    _mark_valyu_called()
    vlog.info(
        f"Valyu ingestion complete: {inserted} new events stored, {len(events)} total processed"
    )


async def _run_openai_ingestion():
    """Run the OpenAI research agent to supplement threat events."""
    vlog = logging.getLogger("valyu")
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if not openai_key:
        return

    ttl_minutes = OPENAI_INGESTION_INTERVAL_HOURS * 60
    if await _get_cached_response("openai_ingestion_last_run", ttl_minutes):
        vlog.info("OpenAI ingestion: within rate window, skipping")
        return

    vlog.info("OpenAI ingestion: starting supplemental threat intelligence pull…")
    try:
        from backend.services.research_agent import run_research_query  # type: ignore
    except (ImportError, RuntimeError) as exc:
        vlog.warning(f"OpenAI ingestion unavailable: {exc}")
        return

    inserted = 0
    for query in _OPENAI_THREAT_QUERIES:
        try:
            result = await run_research_query(query)
            new_events = _ra_result_to_external_event_format(result)
            for evt in new_events:
                content_hash = _event_content_hash(evt)
                evt["content_hash"] = content_hash
                evt["ingested_at"] = datetime.now(timezone.utc).isoformat()
                evt["provider"] = "openai"
                op = await db.external_events.update_one(
                    {"content_hash": content_hash},
                    {"$setOnInsert": evt},
                    upsert=True,
                )
                if op.upserted_id:
                    inserted += 1
        except Exception as exc:
            vlog.error(f"OpenAI ingestion error for query '{query[:60]}': {exc}")

    await _set_cached_response(
        "openai_ingestion_last_run",
        {"ran_at": datetime.now(timezone.utc).isoformat()},
    )
    vlog.info(f"OpenAI ingestion complete: {inserted} new events stored")


async def _restore_uploads_from_mongodb():
    """Recreate uploaded files from MongoDB on container restart."""
    vlog = logging.getLogger(__name__)
    try:
        restored = 0
        async for doc in db.uploads.find({}, {"filename": 1, "data": 1}):
            filename = doc.get("filename")
            data = doc.get("data")
            if not filename or not data:
                continue
            file_path = UPLOAD_DIR / filename
            if not file_path.exists():
                try:
                    with open(file_path, "wb") as fh:
                        fh.write(data)
                    restored += 1
                except Exception as exc:
                    vlog.warning(f"Could not restore upload '{filename}': {exc}")
        if restored:
            vlog.info(f"Restored {restored} uploaded file(s) from MongoDB")
    except Exception as exc:
        vlog.error(f"Upload restore error: {exc}")


async def _valyu_background_ingestion():
    """Periodically fetch threat events from Valyu and OpenAI."""
    vlog = logging.getLogger("valyu")
    vlog.info("Background ingestion service started")
    while True:
        try:
            await _prune_old_events()
            if VALYU_API_KEY:
                await _run_valyu_ingestion()
            if os.environ.get("OPENAI_API_KEY", ""):
                await _run_openai_ingestion()
            await asyncio.sleep(VALYU_EVENT_REFRESH_MINUTES * 60)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            vlog.error(f"Background ingestion error: {exc}")
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break


async def _expire_loa_requests():
    """Mark active LOA requests as expired when their end_date has passed, and clear user loa_status."""
    vlog = logging.getLogger("loa")
    while True:
        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            expired_cursor = db.loa_requests.find(
                {"status": "active", "end_date": {"$lt": today}},
                {"_id": 0}
            )
            expired_loas = await expired_cursor.to_list(500)
            for loa in expired_loas:
                await db.loa_requests.update_one(
                    {"id": loa["id"]},
                    {"$set": {"status": "expired"}}
                )
                await db.users.update_one(
                    {"id": loa["user_id"]},
                    {"$set": {"loa_status": None}}
                )
            if expired_loas:
                vlog.info(f"Expired {len(expired_loas)} LOA request(s)")
            await asyncio.sleep(3600)  # Check every hour
        except asyncio.CancelledError:
            break
        except Exception as exc:
            vlog.error(f"LOA expiration check error: {exc}")
            try:
                await asyncio.sleep(300)
            except asyncio.CancelledError:
                break


# ============================================================================
# LIFECYCLE EVENTS
# ============================================================================

@app.on_event("startup")
async def startup_event():
    global _background_ingestion_task, _loa_expiration_task
    vlog = logging.getLogger("valyu")

    # Backfill map_events from existing entities
    try:
        await backfill_map_events()
    except Exception as e:
        vlog.error(f"Map events backfill error: {e}")

    # Create MongoDB indexes
    try:
        await db.valyu_cache.create_index("key", unique=True)
        await db.external_events.create_index("content_hash", unique=True)
        await db.external_events.create_index("ingested_at")
        await db.map_events.create_index("id", unique=True)
        await db.map_events.create_index("type")
        await db.map_events.create_index("related_entity_id")
        await db.uploads.create_index("filename", unique=True)
        await db.partner_units.create_index("id", unique=True)
        await db.partner_users.create_index("id", unique=True)
        await db.partner_users.create_index("email", unique=True)
        await db.partner_users.create_index("partner_unit_id")
        await db.partner_invites.create_index("code", unique=True)
        await db.partner_applications.create_index("id", unique=True)
        await db.partner_applications.create_index("contact_email")
        await db.tactical_maps.create_index("id", unique=True)
        await db.operations_plans.create_index("id", unique=True)
        await db.operations_plans.create_index("is_published")
        await db.operations_plans.create_index("created_by")
    except Exception as e:
        vlog.warning(f"Index creation note: {e}")

    # Restore any uploaded files lost on container restart
    try:
        await _restore_uploads_from_mongodb()
    except Exception as e:
        vlog.error(f"Upload restore error: {e}")

    # Prune old events on every startup
    try:
        await _prune_old_events()
    except Exception as e:
        vlog.error(f"Event pruning error: {e}")

    # Start background ingestion
    _background_ingestion_task = asyncio.create_task(_valyu_background_ingestion())
    _loa_expiration_task = asyncio.create_task(_expire_loa_requests())
    vlog.info("Startup complete – background ingestion scheduled")


@app.on_event("shutdown")
async def shutdown_db_client():
    if _background_ingestion_task and not _background_ingestion_task.done():
        _background_ingestion_task.cancel()
    if _loa_expiration_task and not _loa_expiration_task.done():
        _loa_expiration_task.cancel()
    client.close()
