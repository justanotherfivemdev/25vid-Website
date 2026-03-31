"""
WorldMonitor-aligned data API routes.

Exposes GDELT, USGS, NWS, FRED, Polymarket, and ACLED data through
REST endpoints, mirroring the data sources used by the worldmonitor-
bayesian overlay system.
"""

import os
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query

from services.worldmonitor_ingest import (
    fetch_gdelt_articles,
    fetch_earthquakes,
    fetch_weather_alerts,
    fetch_fred_data,
    fetch_polymarket_events,
    fetch_acled_protests,
    GDELT_INTEL_TOPICS,
)

logger = logging.getLogger("worldmonitor_routes")

router = APIRouter(prefix="/worldmonitor", tags=["worldmonitor"])


# ---------------------------------------------------------------------------
# GDELT Intelligence
# ---------------------------------------------------------------------------

@router.get("/gdelt")
async def get_gdelt_intel(
    topic: str = Query(None, description="Topic label filter (e.g. 'Military Activity')"),
    max_records: int = Query(10, ge=1, le=50),
):
    """Fetch GDELT intelligence articles grouped by topic."""
    results = {}
    topics = GDELT_INTEL_TOPICS
    if topic:
        topics = [t for t in GDELT_INTEL_TOPICS if t["label"].lower() == topic.lower()]
        if not topics:
            return {"error": f"Unknown topic: {topic}", "available": [t["label"] for t in GDELT_INTEL_TOPICS]}

    for t in topics:
        articles = await fetch_gdelt_articles(t["query"], max_records=max_records)
        results[t["label"]] = articles

    return {
        "topics": results,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "gdelt",
    }


# ---------------------------------------------------------------------------
# USGS Earthquakes
# ---------------------------------------------------------------------------

@router.get("/earthquakes")
async def get_earthquakes():
    """Fetch recent M2.5+ earthquakes from USGS."""
    quakes = await fetch_earthquakes()
    return {
        "earthquakes": quakes,
        "count": len(quakes),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "usgs",
    }


# ---------------------------------------------------------------------------
# NWS Weather Alerts
# ---------------------------------------------------------------------------

@router.get("/weather")
async def get_weather_alerts():
    """Fetch active weather alerts from National Weather Service."""
    alerts = await fetch_weather_alerts()
    return {
        "alerts": alerts,
        "count": len(alerts),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "nws",
    }


# ---------------------------------------------------------------------------
# FRED Economic Data
# ---------------------------------------------------------------------------

@router.get("/economic")
async def get_economic_data():
    """Fetch latest FRED economic indicators."""
    api_key = os.environ.get("FRED_API_KEY", "")
    if not api_key:
        return {
            "indicators": [],
            "error": "FRED_API_KEY not configured",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    indicators = await fetch_fred_data(api_key)
    return {
        "indicators": indicators,
        "count": len(indicators),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "fred",
    }


# ---------------------------------------------------------------------------
# Polymarket Predictions
# ---------------------------------------------------------------------------

@router.get("/predictions")
async def get_predictions(limit: int = Query(20, ge=1, le=100)):
    """Fetch active prediction market events from Polymarket."""
    events = await fetch_polymarket_events(limit=limit)
    return {
        "events": events,
        "count": len(events),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "polymarket",
    }


# ---------------------------------------------------------------------------
# ACLED Protests
# ---------------------------------------------------------------------------

@router.get("/protests")
async def get_protests():
    """Fetch recent protest/civil unrest data from ACLED."""
    api_key = os.environ.get("ACLED_ACCESS_TOKEN", "")
    email = os.environ.get("ACLED_EMAIL", "")
    if not api_key or not email:
        return {
            "protests": [],
            "error": "ACLED_ACCESS_TOKEN and ACLED_EMAIL not configured",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    protests = await fetch_acled_protests(api_key, email)
    return {
        "protests": protests,
        "count": len(protests),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "acled",
    }


# ---------------------------------------------------------------------------
# Combined Status
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_pipeline_status():
    """Health check for all WorldMonitor data pipelines."""
    from database import db

    pipelines = {
        "gdelt": {"configured": True, "auth_required": False},
        "usgs_earthquakes": {"configured": True, "auth_required": False},
        "nws_weather": {"configured": True, "auth_required": False},
        "fred_economic": {
            "configured": bool(os.environ.get("FRED_API_KEY")),
            "auth_required": True,
        },
        "polymarket": {"configured": True, "auth_required": False},
        "acled_protests": {
            "configured": bool(os.environ.get("ACLED_ACCESS_TOKEN") and os.environ.get("ACLED_EMAIL")),
            "auth_required": True,
        },
        "adsb_military": {"configured": True, "auth_required": False},
        "opensky": {
            "configured": bool(os.environ.get("OPENSKY_CLIENT_ID")),
            "auth_required": True,
        },
        "valyu_intel": {
            "configured": bool(os.environ.get("VALYU_API_KEY")),
            "auth_required": True,
        },
        "openai_research": {
            "configured": bool(os.environ.get("OPENAI_API_KEY")),
            "auth_required": True,
        },
    }

    # Count stored events by provider
    provider_counts = {}
    try:
        pipeline = [
            {"$group": {"_id": "$provider", "count": {"$sum": 1}}},
        ]
        async for doc in db.external_events.aggregate(pipeline):
            provider_counts[doc["_id"] or "unknown"] = doc["count"]
    except Exception:
        pass

    return {
        "pipelines": pipelines,
        "stored_events_by_provider": provider_counts,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
