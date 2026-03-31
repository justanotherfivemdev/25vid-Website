import uuid
import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from starlette.responses import StreamingResponse

from config import VALYU_COUNTRY_CACHE_HOURS
from database import db
from middleware.auth import get_current_user
from services.threat_intel import (
    VALYU_API_KEY, VALYU_CACHE_TTL_MINUTES,
    THREAT_QUERIES, MILITARY_BASES_DATA,
    classify_category, classify_threat_level,
    extract_country, extract_keywords_from_text,
    valyu_search, valyu_deepsearch,
    process_search_results, get_start_date,
    _get_cached_response, _set_cached_response,
    _rate_limit_ok, _mark_valyu_called,
    _event_content_hash, _deduplicated_request,
)

valyu_logger = logging.getLogger("valyu")
router = APIRouter()


@router.get("/map/overlays")
async def get_map_overlays(current_user: dict = Depends(get_current_user)):
    campaigns = await db.campaigns.find({}, {"_id": 0, "id": 1, "name": 1, "theater": 1, "status": 1, "objectives": 1}).to_list(200)
    operations = await db.operations.find({}, {"_id": 0}).to_list(2000)

    intel_query = {}
    if current_user.get("role") != "admin":
        intel_query["visibility_scope"] = {"$ne": "admin_only"}
    intel_briefings = await db.intel_briefings.find(intel_query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    objective_markers = []
    for campaign in campaigns:
        for obj in campaign.get("objectives", []):
            lat = obj.get("lat")
            lng = obj.get("lng")
            if lat is None or lng is None:
                continue
            objective_markers.append({
                "id": obj.get("id") or str(uuid.uuid4()),
                "source_kind": "objective",
                "campaign_id": campaign.get("id"),
                "campaign_name": campaign.get("name"),
                "theater": campaign.get("theater"),
                "campaign_status": campaign.get("status"),
                "name": obj.get("name"),
                "description": obj.get("description", ""),
                "region_label": obj.get("region_label") or obj.get("grid_ref", ""),
                "grid_ref": obj.get("grid_ref", ""),
                "severity": obj.get("severity", "medium"),
                "status": obj.get("status", "pending"),
                "priority": obj.get("priority", "secondary"),
                "lat": lat,
                "lng": lng,
                "linked_operation_id": obj.get("linked_operation_id"),
                "is_public_recruiting": bool(obj.get("is_public_recruiting", False)),
                "origin_type": obj.get("origin_type", "25id"),
                "origin_unit_name": obj.get("origin_unit_name", "25th Infantry Division"),
            })

    operation_markers = []
    for op in operations:
        lat = op.get("lat")
        lng = op.get("lng")
        if lat is None or lng is None:
            continue
        operation_markers.append({
            "id": op.get("id"),
            "source_kind": "operation",
            "name": op.get("title"),
            "description": op.get("description", ""),
            "severity": op.get("severity", "medium"),
            "status": op.get("activity_state", "planned"),
            "operation_type": op.get("operation_type"),
            "date": op.get("date"),
            "time": op.get("time"),
            "campaign_id": op.get("campaign_id"),
            "objective_id": op.get("objective_id"),
            "theater": op.get("theater"),
            "region_label": op.get("region_label") or op.get("grid_ref", ""),
            "grid_ref": op.get("grid_ref", ""),
            "lat": lat,
            "lng": lng,
            "is_public_recruiting": bool(op.get("is_public_recruiting", False)),
            "origin_type": op.get("origin_type", "25id"),
            "origin_unit_name": op.get("origin_unit_name", "25th Infantry Division"),
        })

    intel_markers = []
    for intel in intel_briefings:
        lat = intel.get("lat")
        lng = intel.get("lng")
        if lat is None or lng is None:
            continue
        intel_markers.append({
            "id": intel.get("id"),
            "source_kind": "intel",
            "name": intel.get("title"),
            "description": intel.get("content", "")[:320],
            "severity": intel.get("severity") or "medium",
            "status": intel.get("classification", "routine"),
            "category": intel.get("category"),
            "classification": intel.get("classification"),
            "visibility_scope": intel.get("visibility_scope", "members"),
            "campaign_id": intel.get("campaign_id"),
            "objective_id": intel.get("objective_id"),
            "operation_id": intel.get("operation_id"),
            "theater": intel.get("theater"),
            "region_label": intel.get("region_label") or intel.get("grid_ref", ""),
            "grid_ref": intel.get("grid_ref", ""),
            "lat": lat,
            "lng": lng,
            "created_at": intel.get("created_at"),
            "origin_type": intel.get("origin_type", "25id"),
            "origin_unit_name": intel.get("origin_unit_name", "25th Infantry Division"),
        })

    return {
        "objectives": objective_markers,
        "operations": operation_markers,
        "intel": intel_markers,
        "events": [],
        "operation_plans": await _get_geo_plans(),
    }


async def _get_geo_plans():
    """Return published operations plans that have geo coordinates set."""
    plans = await db.operations_plans.find(
        {"is_published": True, "geo_lat": {"$ne": None}, "geo_lng": {"$ne": None}},
        {"_id": 0, "id": 1, "title": 1, "description": 1, "geo_lat": 1, "geo_lng": 1,
         "threat_map_link": 1, "is_live_session_active": 1},
    ).to_list(200)
    return [
        {
            "id": p["id"],
            "title": p.get("title", ""),
            "description": (p.get("description") or "")[:200],
            "lat": p["geo_lat"],
            "lng": p["geo_lng"],
            "threat_map_link": p.get("threat_map_link"),
            "is_live": bool(p.get("is_live_session_active")),
        }
        for p in plans
        if p.get("geo_lat") is not None and p.get("geo_lng") is not None
    ]


@router.get("/map/events")
async def get_map_events(event_type: Optional[str] = None):
    query = {}
    if event_type:
        query["type"] = event_type
    events = await db.map_events.find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return {"events": events, "count": len(events)}


@router.get("/external-events")
async def get_external_events():
    events = await db.external_events.find({}, {"_id": 0}).sort("ingested_at", -1).to_list(200)
    return {
        "events": events,
        "count": len(events),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "stored",
    }


@router.get("/public/threat-map")
async def get_public_threat_map():
    campaign_pipeline = [
        {
            "$match": {
                "objectives": {
                    "$elemMatch": {
                        "is_public_recruiting": True,
                        "lat": {"$ne": None},
                        "lng": {"$ne": None},
                    }
                }
            }
        },
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "name": 1,
                "theater": 1,
                "status": 1,
                "objectives": {
                    "$filter": {
                        "input": "$objectives",
                        "as": "obj",
                        "cond": {
                            "$and": [
                                {"$eq": ["$$obj.is_public_recruiting", True]},
                                {"$ne": ["$$obj.lat", None]},
                                {"$ne": ["$$obj.lng", None]},
                            ]
                        },
                    }
                },
            }
        },
    ]
    campaigns = await db.campaigns.aggregate(campaign_pipeline).to_list(200)
    operations = await db.operations.find(
        {"is_public_recruiting": True},
        {"_id": 0, "id": 1, "title": 1, "operation_type": 1, "date": 1, "time": 1}
    ).to_list(500)
    op_map = {o.get("id"): o for o in operations}

    markers = []
    for campaign in campaigns:
        for obj in campaign.get("objectives", []):
            lat = obj.get("lat")
            lng = obj.get("lng")
            if lat is None or lng is None or not obj.get("is_public_recruiting", False):
                continue
            obj_id = obj.get("id")
            if not obj_id:
                continue
            linked_operation_id = obj.get("linked_operation_id")
            markers.append({
                "id": obj_id,
                "campaign_id": campaign.get("id"),
                "campaign_name": campaign.get("name"),
                "theater": campaign.get("theater"),
                "name": obj.get("name"),
                "description": obj.get("description", ""),
                "region_label": obj.get("region_label") or obj.get("grid_ref", ""),
                "severity": obj.get("severity", "medium"),
                "status": obj.get("status", "pending"),
                "lat": lat,
                "lng": lng,
                "linked_operation_id": linked_operation_id,
                "linked_operation": op_map.get(linked_operation_id),
                "is_public_recruiting": True,
            })

    return {"markers": markers}


async def _get_community_events() -> list:
    """Fetch approved & visible community events, normalised to match
    the external-event shape so the frontend can render them uniformly."""
    docs = await db.community_events.find(
        {"visible": True, "approved": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(300)
    for d in docs:
        d.setdefault("source", "community")
        d.setdefault("provider", "community")
    return docs


@router.post("/threat-events")
async def get_threat_events():
    # Always load community events (local, zero API cost)
    community = await _get_community_events()

    cached = await _get_cached_response("threat_events_global", VALYU_CACHE_TTL_MINUTES)
    if cached:
        merged = community + (cached.get("events") or [])
        return {
            "events": merged[:500],
            "count": len(merged[:500]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "hybrid",
            "sources": {"community": len(community), "external": len(cached.get("events") or [])},
        }

    stored_events = await db.external_events.find(
        {}, {"_id": 0}
    ).sort("ingested_at", -1).to_list(200)
    if stored_events:
        merged = community + stored_events[:200]
        result = {
            "events": merged[:500],
            "count": len(merged[:500]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "hybrid",
            "sources": {"community": len(community), "external": len(stored_events[:200])},
        }
        await _set_cached_response("threat_events_global", {
            "events": stored_events[:200],
            "count": len(stored_events[:200]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "stored",
        })
        return result

    if not VALYU_API_KEY:
        return {
            "events": community,
            "count": len(community),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "community_only",
            "sources": {"community": len(community), "external": 0},
        }

    if not _rate_limit_ok():
        return {
            "events": community,
            "count": len(community),
            "source": "rate_limited",
            "sources": {"community": len(community), "external": 0},
        }

    async def _fetch_live():
        valyu_logger.info("Valyu request STARTED: threat-events")
        start_date = get_start_date()
        tasks = [valyu_search(q, max_results=15, start_date=start_date) for q in THREAT_QUERIES[:15]]
        results_arrays = await asyncio.gather(*tasks, return_exceptions=True)
        all_results = []
        for r in results_arrays:
            if isinstance(r, list):
                all_results.extend(r)
        events = process_search_results(all_results)
        _mark_valyu_called()
        valyu_logger.info(f"Valyu request SUCCEEDED: threat-events ({len(events)} events)")
        result = {
            "events": events[:200],
            "count": len(events[:200]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "live",
        }
        await _set_cached_response("threat_events_global", result)
        for evt in events:
            content_hash = _event_content_hash(evt)
            evt["content_hash"] = content_hash
            evt["ingested_at"] = datetime.now(timezone.utc).isoformat()
            evt["provider"] = "valyu"
            try:
                await db.external_events.update_one(
                    {"content_hash": content_hash},
                    {"$set": evt},
                    upsert=True,
                )
            except Exception:
                pass
        return result

    try:
        live_result = await _deduplicated_request("threat_events_global", _fetch_live)
        merged = community + (live_result.get("events") or [])
        return {
            "events": merged[:500],
            "count": len(merged[:500]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "hybrid",
            "sources": {"community": len(community), "external": len(live_result.get("events") or [])},
        }
    except Exception as e:
        valyu_logger.error(f"Valyu request FAILED: threat-events: {e}")
        return {
            "events": community,
            "count": len(community),
            "error": str(e),
            "sources": {"community": len(community), "external": 0},
        }


@router.post("/entity-search")
async def entity_search(request: Request):
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Entity name is required")

    if not VALYU_API_KEY:
        raise HTTPException(status_code=503, detail="VALYU_API_KEY not configured")

    research = await valyu_deepsearch(
        f"intelligence profile analysis of {name}: history, operations, leadership, capabilities, recent activity",
        max_results=15,
    )

    location_results = await valyu_search(f"{name} location headquarters base operations area", max_results=10)
    locations = []
    seen_countries = set()
    for r in location_results:
        text = f"{r.get('title', '')} {r.get('content', r.get('snippet', ''))}"
        country, lat, lng = extract_country(text)
        if country and country not in seen_countries:
            seen_countries.add(country)
            locations.append({
                "latitude": lat,
                "longitude": lng,
                "placeName": country,
                "country": country,
            })

    entity = {
        "id": f"entity_{uuid.uuid4().hex[:8]}",
        "name": name,
        "type": "group",
        "description": research.get("summary", "")[:300],
        "locations": locations[:10],
        "relatedEntities": [],
        "economicData": {},
    }

    return {
        "entity": entity,
        "research": research,
    }


@router.get("/countries/conflicts")
async def get_country_conflicts(country: str, stream: Optional[str] = None):
    if not country:
        raise HTTPException(status_code=400, detail="Country parameter is required")

    cache_key = f"country_conflicts_{country.lower().strip()}"
    ttl_minutes = VALYU_COUNTRY_CACHE_HOURS * 60

    cached = await _get_cached_response(cache_key, ttl_minutes)
    if cached:
        if stream == "true":
            async def generate_cached():
                yield 'data: {"type": "start"}\n\n'.encode()
                yield f'data: {json.dumps({"type": "text", "text": cached.get("current", {}).get("conflicts", "")})}\n\n'.encode()
                yield f'data: {json.dumps({"type": "done", "data": cached})}\n\n'.encode()
            return StreamingResponse(generate_cached(), media_type="text/event-stream")
        return cached

    if not VALYU_API_KEY:
        raise HTTPException(status_code=503, detail="VALYU_API_KEY not configured")

    if stream == "true":
        async def generate():
            try:
                yield 'data: {"type": "start"}\n\n'.encode()
                valyu_logger.info(f"Valyu request STARTED: country-conflicts ({country})")
                current = await valyu_deepsearch(
                    f"current ongoing military conflicts wars tensions in {country} 2024 2025 2026",
                    max_results=10,
                )
                yield f'data: {json.dumps({"type": "text", "text": current.get("summary", "")})}\n\n'.encode()
                result = {
                    "country": country,
                    "current": {"conflicts": current.get("summary", ""), "sources": current.get("sources", [])},
                    "past": {"conflicts": "", "sources": []},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                yield f'data: {json.dumps({"type": "done", "data": result})}\n\n'.encode()
                await _set_cached_response(cache_key, result)
                _mark_valyu_called()
                valyu_logger.info(f"Valyu request SUCCEEDED: country-conflicts ({country})")
            except Exception as e:
                valyu_logger.error(f"Valyu request FAILED: country-conflicts ({country}): {e}")
                yield f'data: {json.dumps({"type": "error", "error": str(e)})}\n\n'.encode()

        return StreamingResponse(generate(), media_type="text/event-stream")

    valyu_logger.info(f"Valyu request STARTED: country-conflicts ({country})")
    current_task = valyu_deepsearch(
        f"current ongoing military conflicts wars tensions in {country} 2024 2025 2026",
        max_results=10,
    )
    past_task = valyu_deepsearch(
        f"historical wars conflicts in {country} history major battles",
        max_results=10,
    )
    current, past = await asyncio.gather(current_task, past_task)

    result = {
        "country": country,
        "current": {
            "conflicts": current.get("summary", ""),
            "sources": current.get("sources", []),
        },
        "past": {
            "conflicts": past.get("summary", ""),
            "sources": past.get("sources", []),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await _set_cached_response(cache_key, result)
    _mark_valyu_called()
    valyu_logger.info(f"Valyu request SUCCEEDED: country-conflicts ({country})")
    return result


@router.get("/military-bases")
async def get_military_bases():
    return {
        "bases": MILITARY_BASES_DATA,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
