"""
WorldMonitor-aligned data API routes.

Exposes GDELT, USGS, NWS, FRED, Polymarket, and ACLED data through
REST endpoints, mirroring the data sources used by the worldmonitor-
bayesian overlay system.  Also provides RSS and Finnhub proxy endpoints
so the standalone World Monitor SPA can bypass CORS restrictions.
"""

import os
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Query, HTTPException, Response

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
            raise HTTPException(
                status_code=400,
                detail=f"Unknown topic: {topic}. Available: {[t['label'] for t in GDELT_INTEL_TOPICS]}",
            )

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
        raise HTTPException(
            status_code=503,
            detail="FRED_API_KEY not configured",
        )
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
        raise HTTPException(
            status_code=503,
            detail="ACLED_ACCESS_TOKEN and ACLED_EMAIL not configured",
        )
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
            "configured": bool(os.environ.get("OPENSKY_CLIENT_ID") and os.environ.get("OPENSKY_CLIENT_SECRET")),
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


# ---------------------------------------------------------------------------
# RSS Proxy — bypasses CORS for the World Monitor's news feeds
# ---------------------------------------------------------------------------

# Allowlist of domains the RSS proxy may fetch from (prevents SSRF)
_RSS_ALLOWED_DOMAINS = frozenset({
    # Wire services & major outlets
    "feeds.reuters.com", "rss.nytimes.com", "feeds.bbci.co.uk",
    "www.theguardian.com", "feeds.washingtonpost.com",
    "rss.cnn.com", "feeds.npr.org", "www.aljazeera.com",
    "www.ft.com", "rss.politico.com", "feeds.bloomberg.com",
    "www.cnbc.com", "feeds.feedburner.com", "www.reddit.com",
    "rss.app", "news.google.com", "api.gdeltproject.org",
    "feeds.marketwatch.com", "search.cnbc.com",
    "finance.yahoo.com", "www.politico.com",
    # Defense & military
    "www.defense.gov", "www.stripes.com", "news.usni.org",
    "www.armytimes.com", "www.navytimes.com", "www.airforcetimes.com",
    "www.marinecorpstimes.com", "www.militarytimes.com",
    "www.janes.com", "breakingdefense.com", "www.defensenews.com",
    "www.defenseone.com", "www.thedrive.com",
    # Tech & security
    "cyberscoop.com", "therecord.media", "krebsonsecurity.com",
    "techcrunch.com", "venturebeat.com", "www.technologyreview.com",
    "www.theverge.com", "feeds.arstechnica.com", "export.arxiv.org",
    # Think tanks & policy
    "foreignpolicy.com", "www.foreignaffairs.com", "thediplomat.com",
    "www.atlanticcouncil.org", "www.bellingcat.com",
    # Government
    "www.federalreserve.gov", "www.sec.gov",
    # Aggregators
    "hnrss.org", "layoffs.fyi",
})


@router.get("/rss-proxy")
async def rss_proxy(url: str = Query(..., description="RSS feed URL to fetch")):
    """Proxy an RSS feed to bypass CORS for the World Monitor frontend."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed")
    if parsed.hostname and parsed.hostname not in _RSS_ALLOWED_DOMAINS:
        raise HTTPException(status_code=403, detail="Domain not in RSS allowlist")

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 WorldMonitor/1.0",
                    "Accept": "application/rss+xml, application/xml, text/xml, */*",
                },
            )
        return Response(
            content=resp.content,
            media_type="application/xml",
            headers={"Cache-Control": "public, max-age=300"},
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="RSS feed timed out")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"RSS fetch failed: {exc}")


# ---------------------------------------------------------------------------
# Finnhub Proxy — injects API key server-side
# ---------------------------------------------------------------------------

@router.get("/finnhub")
async def finnhub_proxy(symbols: str = Query(..., description="Comma-separated stock symbols")):
    """Proxy Finnhub stock quotes, injecting the API key server-side."""
    api_key = os.environ.get("FINNHUB_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="FINNHUB_API_KEY not configured")

    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()][:20]
    quotes = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        for symbol in symbol_list:
            try:
                resp = await client.get(
                    f"https://finnhub.io/api/v1/quote?symbol={symbol}&token={api_key}",
                )
                data = resp.json()
                if data.get("c", 0) == 0 and data.get("h", 0) == 0:
                    quotes.append({"symbol": symbol, "error": "No data available"})
                else:
                    quotes.append({
                        "symbol": symbol,
                        "price": data.get("c"),
                        "change": data.get("d"),
                        "changePercent": data.get("dp"),
                        "high": data.get("h"),
                        "low": data.get("l"),
                        "open": data.get("o"),
                        "previousClose": data.get("pc"),
                        "timestamp": data.get("t"),
                    })
            except Exception:
                quotes.append({"symbol": symbol, "error": "Fetch failed"})

    return {"quotes": quotes}
