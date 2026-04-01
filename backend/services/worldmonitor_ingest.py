"""
WorldMonitor-aligned data ingestion services.

Mirrors the data sources used by the worldmonitor-bayesian overlay
(https://github.com/swatfa/worldmonitor-bayesian) and normalizes
them into a unified event schema stored in MongoDB.

Data sources:
  - GDELT (news & intelligence articles)
  - USGS Earthquakes
  - NWS Weather Alerts
  - FRED Economic Indicators
  - Polymarket Prediction Markets
  - ACLED Protests / Civil Unrest
"""

import os
import logging
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import httpx

from database import db
from services.threat_intel import extract_country

logger = logging.getLogger("worldmonitor_ingest")

# ---------------------------------------------------------------------------
# Cache helpers (reuse the same pattern as threat_intel.py)
# ---------------------------------------------------------------------------
_CACHE_COLLECTION = "wm_cache"


async def _wm_get_cached(key: str, ttl_minutes: int) -> Optional[dict]:
    doc = await db[_CACHE_COLLECTION].find_one({"key": key}, {"_id": 0})
    if doc:
        cached_at = doc.get("cached_at")
        if cached_at:
            if isinstance(cached_at, str):
                cached_at = datetime.fromisoformat(cached_at)
            age = (datetime.now(timezone.utc) - cached_at).total_seconds()
            if age < ttl_minutes * 60:
                return doc.get("data")
    return None


async def _wm_set_cached(key: str, data: Any) -> None:
    await db[_CACHE_COLLECTION].update_one(
        {"key": key},
        {"$set": {"key": key, "data": data, "cached_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


# ============================================================================
# GDELT Intelligence Ingestion
# ============================================================================

GDELT_DOC_API = os.environ.get(
    "GDELT_API_URL", "https://api.gdeltproject.org/api/v2/doc/doc"
)

GDELT_INTEL_TOPICS = [
    {"label": "Military Activity", "query": "(military OR troops OR deployment OR airstrike) sourcelang:eng"},
    {"label": "Cyber Threats", "query": "(cyberattack OR ransomware OR breach OR hacking) sourcelang:eng"},
    {"label": "Nuclear", "query": "(nuclear OR uranium OR missile test OR warhead) sourcelang:eng"},
    {"label": "Sanctions", "query": "(sanctions OR embargo OR trade restriction) sourcelang:eng"},
    {"label": "Intelligence", "query": "(intelligence OR espionage OR surveillance OR covert) sourcelang:eng"},
    {"label": "Maritime Security", "query": "(maritime OR piracy OR naval OR strait OR shipping lane) sourcelang:eng"},
]


async def fetch_gdelt_articles(query: str, max_records: int = 10, timespan: str = "24h") -> List[dict]:
    """Fetch articles from GDELT DOC API (no auth required)."""
    cache_key = f"gdelt_{_content_hash(f'{query}|max={max_records}|ts={timespan}')}"
    cached = await _wm_get_cached(cache_key, 5)  # 5-min cache per WorldMonitor
    if cached:
        return cached

    params = {
        "query": query,
        "mode": "ArtList",
        "maxrecords": str(max_records),
        "timespan": timespan,
        "format": "json",
        "sort": "DateDesc",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(GDELT_DOC_API, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning(f"GDELT fetch failed for '{query[:40]}': {exc}")
        return []

    articles = []
    for art in data.get("articles", []):
        articles.append({
            "title": art.get("title", ""),
            "url": art.get("url", ""),
            "source": art.get("domain", art.get("source", "")),
            "date": art.get("seendate", ""),
            "image": art.get("socialimage", ""),
            "language": art.get("language", "English"),
            "tone": art.get("tone", 0),
        })

    await _wm_set_cached(cache_key, articles)
    return articles


async def ingest_gdelt_intel() -> int:
    """Run full GDELT intelligence sweep across all topics, store in external_events."""
    inserted = 0
    for topic in GDELT_INTEL_TOPICS:
        articles = await fetch_gdelt_articles(topic["query"], max_records=10)
        for art in articles:
            content_hash = _content_hash(f"gdelt_{art.get('url', '')}{art.get('title', '')}")
            # Parse GDELT seendate (e.g. "20250401T120000Z") into ISO-8601
            raw_date = art.get("date", "")
            try:
                parsed_dt = datetime.strptime(raw_date, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
                iso_timestamp = parsed_dt.isoformat()
            except (ValueError, TypeError):
                iso_timestamp = datetime.now(timezone.utc).isoformat()
            # Derive country-level coordinates from article title
            title_text = art.get("title", "")
            country, lat, lng = extract_country(title_text, title=title_text)
            evt = {
                "id": f"gdelt_{content_hash}",
                "title": title_text,
                "summary": title_text,
                "category": _gdelt_topic_to_category(topic["label"]),
                "threatLevel": _gdelt_tone_to_threat(art.get("tone", 0)),
                "location": {
                    "latitude": lat,
                    "longitude": lng,
                    "placeName": country or "",
                    "country": country or "",
                },
                "timestamp": iso_timestamp,
                "source": "gdelt",
                "sourceUrl": art.get("url", ""),
                "keywords": [topic["label"].lower()],
                "rawContent": title_text,
                "provider": "gdelt",
                "gdelt_topic": topic["label"],
                "content_hash": content_hash,
                "ingested_at": datetime.now(timezone.utc).isoformat(),
            }
            op = await db.external_events.update_one(
                {"content_hash": content_hash},
                {"$setOnInsert": evt},
                upsert=True,
            )
            if op.upserted_id:
                inserted += 1
    logger.info(f"GDELT ingestion: {inserted} new articles stored")
    return inserted


def _gdelt_topic_to_category(label: str) -> str:
    mapping = {
        "Military Activity": "military",
        "Cyber Threats": "cyber",
        "Nuclear": "military",
        "Sanctions": "diplomatic",
        "Intelligence": "military",
        "Maritime Security": "piracy",
    }
    return mapping.get(label, "conflict")


def _gdelt_tone_to_threat(tone) -> str:
    try:
        t = float(tone)
    except (TypeError, ValueError):
        return "medium"
    if t < -5:
        return "high"
    if t < -2:
        return "medium"
    return "low"


# ============================================================================
# USGS Earthquake Ingestion
# ============================================================================

USGS_API_URL = os.environ.get(
    "USGS_API_URL",
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
)


async def fetch_earthquakes() -> List[dict]:
    """Fetch recent M2.5+ earthquakes from USGS (no auth required)."""
    cache_key = "usgs_earthquakes"
    cached = await _wm_get_cached(cache_key, 5)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(USGS_API_URL)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning(f"USGS earthquake fetch failed: {exc}")
        return []

    quakes = []
    for feature in data.get("features", []):
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})
        coords = geom.get("coordinates", [None, None, None])
        quakes.append({
            "id": feature.get("id", ""),
            "place": props.get("place", ""),
            "magnitude": props.get("mag"),
            "longitude": coords[0],
            "latitude": coords[1],
            "depth": coords[2] if len(coords) > 2 else None,
            "time": props.get("time"),
            "url": props.get("url", ""),
            "alert": props.get("alert"),
            "tsunami": props.get("tsunami", 0),
        })

    await _wm_set_cached(cache_key, quakes)
    return quakes


async def ingest_earthquakes() -> int:
    """Fetch and store earthquake data as external events."""
    quakes = await fetch_earthquakes()
    inserted = 0
    for q in quakes:
        content_hash = _content_hash(f"usgs_{q['id']}")
        mag = q.get("magnitude") or 0
        threat = "critical" if mag >= 7 else "high" if mag >= 5.5 else "medium" if mag >= 4 else "low"
        evt = {
            "id": f"eq_{content_hash}",
            "title": f"M{mag} Earthquake — {q.get('place', 'Unknown')}",
            "summary": f"Magnitude {mag} earthquake at {q.get('place', 'unknown location')}, depth {q.get('depth', '?')} km",
            "category": "disaster",
            "threatLevel": threat,
            "location": {
                "latitude": q.get("latitude"),
                "longitude": q.get("longitude"),
                "placeName": q.get("place", ""),
                "country": "",
            },
            "timestamp": datetime.fromtimestamp(
                q["time"] / 1000, tz=timezone.utc
            ).isoformat() if q.get("time") else datetime.now(timezone.utc).isoformat(),
            "source": "usgs",
            "sourceUrl": q.get("url", ""),
            "keywords": ["earthquake", "seismic"],
            "rawContent": f"Magnitude {mag}, Depth {q.get('depth', '?')} km, Tsunami alert: {q.get('tsunami', 0)}",
            "provider": "usgs",
            "content_hash": content_hash,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        }
        op = await db.external_events.update_one(
            {"content_hash": content_hash},
            {"$setOnInsert": evt},
            upsert=True,
        )
        if op.upserted_id:
            inserted += 1
    logger.info(f"Earthquake ingestion: {inserted} new events stored")
    return inserted


# ============================================================================
# NWS Weather Alerts
# ============================================================================

NWS_ALERTS_URL = os.environ.get(
    "NWS_ALERTS_URL", "https://api.weather.gov/alerts/active"
)

# NWS requires a valid User-Agent with contact info. Configure via env var.
NWS_USER_AGENT = os.environ.get(
    "NWS_USER_AGENT", "(25vid-worldmonitor, contact@yourdomain.com)"
)


async def fetch_weather_alerts() -> List[dict]:
    """Fetch active weather alerts from NWS (no auth required)."""
    cache_key = "nws_weather_alerts"
    cached = await _wm_get_cached(cache_key, 5)
    if cached:
        return cached

    try:
        headers = {"User-Agent": NWS_USER_AGENT}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(NWS_ALERTS_URL, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning(f"NWS weather alerts fetch failed: {exc}")
        return []

    alerts = []
    for feature in data.get("features", [])[:50]:  # Cap at 50
        props = feature.get("properties", {})
        alerts.append({
            "id": props.get("id", ""),
            "event": props.get("event", ""),
            "severity": props.get("severity", ""),
            "certainty": props.get("certainty", ""),
            "urgency": props.get("urgency", ""),
            "headline": props.get("headline", ""),
            "description": (props.get("description") or "")[:500],
            "areas": props.get("areaDesc", ""),
            "effective": props.get("effective", ""),
            "expires": props.get("expires", ""),
            "sender": props.get("senderName", ""),
        })

    await _wm_set_cached(cache_key, alerts)
    return alerts


# ============================================================================
# FRED Economic Data
# ============================================================================

FRED_BASE_URL = os.environ.get(
    "FRED_API_URL", "https://api.stlouisfed.org/fred/series/observations"
)

FRED_INDICATORS = [
    {"series_id": "WALCL", "name": "Fed Total Assets", "display": "Fed Assets"},
    {"series_id": "UNRATE", "name": "Unemployment Rate", "display": "Unemployment"},
    {"series_id": "CPIAUCSL", "name": "Consumer Price Index", "display": "CPI"},
    {"series_id": "DGS10", "name": "10-Year Treasury", "display": "10Y Treasury"},
    {"series_id": "DTWEXBGS", "name": "Trade-Weighted Dollar", "display": "USD Index"},
    {"series_id": "VIXCLS", "name": "VIX (Volatility)", "display": "VIX"},
    {"series_id": "T10Y2Y", "name": "Yield Curve (10Y-2Y)", "display": "Yield Curve"},
]


async def fetch_fred_data(api_key: str) -> List[dict]:
    """Fetch latest FRED economic indicator values. Requires FRED_API_KEY."""
    if not api_key:
        return []

    cache_key = "fred_economic_data"
    cached = await _wm_get_cached(cache_key, 60)  # 1-hour cache per WorldMonitor
    if cached:
        return cached

    indicators = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        for ind in FRED_INDICATORS:
            try:
                params = {
                    "series_id": ind["series_id"],
                    "api_key": api_key,
                    "file_type": "json",
                    "sort_order": "desc",
                    "limit": "1",
                }
                resp = await client.get(FRED_BASE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
                obs = data.get("observations", [])
                if obs:
                    latest = obs[0]
                    indicators.append({
                        "series_id": ind["series_id"],
                        "name": ind["name"],
                        "display": ind["display"],
                        "value": latest.get("value", "N/A"),
                        "date": latest.get("date", ""),
                    })
            except Exception as exc:
                logger.warning(f"FRED fetch failed for {ind['series_id']}: {exc}")

    if indicators:
        await _wm_set_cached(cache_key, indicators)
    return indicators


# ============================================================================
# Polymarket Prediction Markets
# ============================================================================

POLYMARKET_API_URL = os.environ.get(
    "POLYMARKET_API_URL", "https://gamma-api.polymarket.com/events"
)


async def fetch_polymarket_events(limit: int = 20) -> List[dict]:
    """Fetch active prediction market events from Polymarket (no auth required)."""
    cache_key = f"polymarket_events_limit_{limit}"
    cached = await _wm_get_cached(cache_key, 5)
    if cached:
        return cached

    try:
        params = {
            "closed": "false",
            "order": "volume",
            "ascending": "false",
            "limit": str(limit),
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(POLYMARKET_API_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning(f"Polymarket fetch failed: {exc}")
        return []

    events = []
    for item in data if isinstance(data, list) else []:
        events.append({
            "id": item.get("id", ""),
            "title": item.get("title", ""),
            "slug": item.get("slug", ""),
            "volume": item.get("volume", 0),
            "liquidity": item.get("liquidity", 0),
            "start_date": item.get("startDate", ""),
            "end_date": item.get("endDate", ""),
            "markets": [
                {
                    "question": m.get("question", ""),
                    "outcome_prices": m.get("outcomePrices", ""),
                }
                for m in item.get("markets", [])[:5]
            ],
        })

    if events:
        await _wm_set_cached(cache_key, events)
    return events


# ============================================================================
# ACLED Protests / Civil Unrest
# ============================================================================

ACLED_API_URL = os.environ.get(
    "ACLED_API_URL", "https://api.acleddata.com/acled/read"
)


async def fetch_acled_protests(api_key: str, email: str, limit: int = 50) -> List[dict]:
    """Fetch recent protest/unrest data from ACLED. Requires ACLED_ACCESS_TOKEN + email."""
    if not api_key or not email:
        return []

    cache_key = "acled_protests"
    cached = await _wm_get_cached(cache_key, 10)  # 10-min cache
    if cached:
        return cached

    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    try:
        params = {
            "key": api_key,
            "email": email,
            "event_type": "Protests",
            "event_date": week_ago,
            "event_date_where": ">=",
            "limit": str(limit),
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(ACLED_API_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning(f"ACLED fetch failed: {exc}")
        return []

    protests = []
    for item in data.get("data", []):
        protests.append({
            "event_id": item.get("data_id", ""),
            "event_date": item.get("event_date", ""),
            "event_type": item.get("event_type", ""),
            "sub_event_type": item.get("sub_event_type", ""),
            "country": item.get("country", ""),
            "admin1": item.get("admin1", ""),
            "location": item.get("location", ""),
            "latitude": item.get("latitude"),
            "longitude": item.get("longitude"),
            "fatalities": item.get("fatalities", 0),
            "notes": (item.get("notes") or "")[:300],
        })

    if protests:
        await _wm_set_cached(cache_key, protests)
    return protests


async def ingest_acled_protests(api_key: str, email: str) -> int:
    """Fetch and store ACLED protest data as external events."""
    protests = await fetch_acled_protests(api_key, email)
    inserted = 0
    for p in protests:
        content_hash = _content_hash(f"acled_{p.get('event_id', '')}")
        fatalities = int(p.get("fatalities", 0) or 0)
        threat = "high" if fatalities > 10 else "medium" if fatalities > 0 else "low"
        try:
            lat = float(p["latitude"]) if p.get("latitude") else None
            lng = float(p["longitude"]) if p.get("longitude") else None
        except (TypeError, ValueError):
            lat, lng = None, None
        evt = {
            "id": f"acled_{content_hash}",
            "title": f"{p.get('sub_event_type', 'Protest')} — {p.get('location', '')}, {p.get('country', '')}",
            "summary": p.get("notes", "") or f"Protest event in {p.get('location', 'unknown')}",
            "category": "protest",
            "threatLevel": threat,
            "location": {
                "latitude": lat,
                "longitude": lng,
                "placeName": p.get("location", ""),
                "country": p.get("country", ""),
            },
            "timestamp": p.get("event_date", datetime.now(timezone.utc).isoformat()),
            "source": "acled",
            "sourceUrl": "",
            "keywords": ["protest", "unrest", p.get("sub_event_type", "").lower()],
            "rawContent": p.get("notes", ""),
            "provider": "acled",
            "content_hash": content_hash,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        }
        op = await db.external_events.update_one(
            {"content_hash": content_hash},
            {"$setOnInsert": evt},
            upsert=True,
        )
        if op.upserted_id:
            inserted += 1
    logger.info(f"ACLED protest ingestion: {inserted} new events stored")
    return inserted
