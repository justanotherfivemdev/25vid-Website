import re
import hashlib
import logging
import uuid
import asyncio
import time as _time_mod
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional

import httpx

from config import (
    VALYU_API_KEY, VALYU_BASE_URL,
    VALYU_CACHE_TTL_MINUTES, VALYU_RATE_LIMIT_SECONDS,
)
from database import db

valyu_logger = logging.getLogger("valyu")

THREAT_QUERIES = [
    "breaking news conflict military",
    "geopolitical crisis tensions",
    "protest demonstration unrest",
    "natural disaster emergency",
    "earthquake tsunami volcano eruption",
    "terrorism attack security",
    "cyber attack breach",
    "diplomatic summit sanctions",
    "shipping attack piracy maritime",
    "missile strike airstrike bombing",
    "military deployment troops mobilization",
    "nuclear threat ballistic missile test",
    "Ukraine Russia frontline offensive",
    "Israel Hamas Gaza ceasefire offensive",
    "Yemen Houthi Red Sea shipping attacks",
    "Iran nuclear facilities escalation",
    "Taiwan China military exercises",
    "NATO military deployment buildup",
    "North Korea missile launch",
    "South China Sea military confrontation",
]

CATEGORY_KEYWORDS = {
    "conflict": ["war", "battle", "fighting", "combat", "clash", "strike", "attack", "offensive", "invasion", "troops"],
    "protest": ["protest", "demonstration", "rally", "march", "riot", "unrest", "uprising"],
    "disaster": ["earthquake", "flood", "hurricane", "typhoon", "tsunami", "wildfire", "tornado", "volcanic", "disaster"],
    "diplomatic": ["summit", "treaty", "agreement", "diplomatic", "embassy", "negotiation", "sanctions"],
    "economic": ["economy", "trade", "tariff", "currency", "inflation", "recession", "market"],
    "terrorism": ["terrorist", "terrorism", "bomb", "explosion", "hostage", "extremist", "militant"],
    "cyber": ["cyber", "hack", "breach", "malware", "ransomware", "ddos", "phishing"],
    "health": ["pandemic", "epidemic", "outbreak", "virus", "disease", "vaccine"],
    "environmental": ["climate", "pollution", "environmental", "emission", "deforestation"],
    "military": ["military", "army", "navy", "air force", "missile", "nuclear", "weapons", "defense", "nato"],
    "crime": ["murder", "kidnapping", "shooting", "drug trafficking", "cartel", "gang", "crime"],
    "piracy": ["piracy", "pirate", "hijack", "maritime", "vessel seized", "ship attack"],
    "infrastructure": ["dam", "power grid", "blackout", "power outage", "pipeline", "infrastructure"],
    "commodities": ["food price", "commodity", "wheat", "food shortage", "agriculture", "famine"],
}

THREAT_KEYWORDS = {
    "critical": ["emergency", "imminent", "catastrophic", "mass casualty", "nuclear", "wmd", "crisis"],
    "high": ["severe", "major", "significant", "escalating", "dangerous", "alarming", "warning"],
    "medium": ["moderate", "developing", "ongoing", "tensions", "concern", "elevated"],
    "low": ["minor", "limited", "contained", "isolated", "localized", "stable"],
    "info": ["update", "report", "announcement", "statement", "analysis", "summary"],
}

COUNTRY_COORDS = {
    "Afghanistan": [33.93, 67.71], "Albania": [41.15, 20.17], "Algeria": [28.03, 1.66],
    "Angola": [-11.20, 17.87], "Argentina": [-38.42, -63.62], "Armenia": [40.07, 45.04],
    "Australia": [-25.27, 133.78], "Austria": [47.52, 14.55], "Azerbaijan": [40.14, 47.58],
    "Bangladesh": [23.68, 90.36], "Belarus": [53.71, 27.95], "Belgium": [50.50, 4.47],
    "Bolivia": [-16.29, -63.59], "Bosnia": [43.92, 17.68], "Brazil": [-14.24, -51.93],
    "Bulgaria": [42.73, 25.49], "Cambodia": [12.57, 104.99], "Cameroon": [7.37, 12.35],
    "Canada": [56.13, -106.35], "Chad": [15.45, 18.73], "Chile": [-35.68, -71.54],
    "China": [35.86, 104.20], "Colombia": [4.57, -74.30], "Congo": [-4.04, 21.76],
    "Cuba": [21.52, -77.78], "Cyprus": [35.13, 33.43], "Czech Republic": [49.82, 15.47],
    "Denmark": [56.26, 9.50], "Ecuador": [-1.83, -78.18], "Egypt": [26.82, 30.80],
    "Ethiopia": [9.15, 40.49], "Finland": [61.92, 25.75], "France": [46.23, 2.21],
    "Gaza": [31.35, 34.31], "Georgia": [42.32, 43.36], "Germany": [51.17, 10.45],
    "Ghana": [7.95, -1.02], "Greece": [39.07, 21.82], "Haiti": [18.97, -72.29],
    "Honduras": [15.20, -86.24], "Hungary": [47.16, 19.50], "India": [20.59, 78.96],
    "Indonesia": [-0.79, 113.92], "Iran": [32.43, 53.69], "Iraq": [33.22, 43.68],
    "Ireland": [53.14, -7.69], "Israel": [31.05, 34.85], "Italy": [41.87, 12.57],
    "Japan": [36.20, 138.25], "Jordan": [30.59, 36.24], "Kazakhstan": [48.02, 66.92],
    "Kenya": [-0.02, 37.91], "Kosovo": [42.60, 20.90], "Kuwait": [29.31, 47.48],
    "Kyrgyzstan": [41.20, 74.77], "Laos": [19.86, 102.50], "Latvia": [56.88, 24.60],
    "Lebanon": [33.85, 35.86], "Libya": [26.34, 17.23], "Lithuania": [55.17, 23.88],
    "Mali": [17.57, -3.99], "Mexico": [23.63, -102.55], "Moldova": [47.41, 28.37],
    "Mongolia": [46.86, 103.85], "Morocco": [31.79, -7.09], "Mozambique": [-18.67, 35.53],
    "Myanmar": [21.91, 95.96], "Nepal": [28.39, 84.12], "Netherlands": [52.13, 5.29],
    "New Zealand": [-40.90, 174.89], "Niger": [17.61, 8.08], "Nigeria": [9.08, 8.68],
    "North Korea": [40.34, 127.51], "Norway": [60.47, 8.47], "Oman": [21.47, 55.98],
    "Pakistan": [30.38, 69.35], "Palestine": [31.95, 35.23], "Panama": [8.54, -80.78],
    "Peru": [-9.19, -75.02], "Philippines": [12.88, 121.77], "Poland": [51.92, 19.15],
    "Portugal": [39.40, -8.22], "Qatar": [25.35, 51.18], "Romania": [45.94, 24.97],
    "Russia": [61.52, 105.32], "Rwanda": [-1.94, 29.87], "Saudi Arabia": [23.89, 45.08],
    "Senegal": [14.50, -14.45], "Serbia": [44.02, 21.01], "Somalia": [5.15, 46.20],
    "South Africa": [-30.56, 22.94], "South Korea": [35.91, 127.77],
    "South Sudan": [6.88, 31.31], "Spain": [40.46, -3.75], "Sri Lanka": [7.87, 80.77],
    "Sudan": [12.86, 30.22], "Sweden": [60.13, 18.64], "Switzerland": [46.82, 8.23],
    "Syria": [34.80, 38.99], "Taiwan": [23.70, 120.96], "Thailand": [15.87, 100.99],
    "Tunisia": [33.89, 9.54], "Turkey": [38.96, 35.24], "Turkmenistan": [38.97, 59.56],
    "Uganda": [1.37, 32.29], "Ukraine": [48.38, 31.17], "United Arab Emirates": [23.42, 53.85],
    "United Kingdom": [55.38, -3.44], "United States": [37.09, -95.71],
    "Uzbekistan": [41.38, 64.59], "Venezuela": [6.42, -66.59], "Vietnam": [14.06, 108.28],
    "Yemen": [15.55, 48.52], "Zimbabwe": [-19.02, 29.15],
}

_COUNTRY_PATTERNS: dict = {
    country: re.compile(r'\b' + re.escape(country.lower()) + r'\b')
    for country in COUNTRY_COORDS
}

# In-memory rate limiting and deduplication state
_valyu_last_call_time: float = 0.0
_valyu_pending_requests: Dict[str, asyncio.Task] = {}
_valyu_rate_lock = asyncio.Lock()


def classify_category(text):
    lower = text.lower()
    best, best_score = "conflict", 0
    for cat, kws in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in kws if kw in lower)
        if score > best_score:
            best, best_score = cat, score
    return best


def classify_threat_level(text):
    lower = text.lower()
    for level in ["critical", "high", "medium", "low", "info"]:
        for kw in THREAT_KEYWORDS[level]:
            if kw in lower:
                return level
    return "medium"


def extract_country(text, title=None):
    if title:
        lower_title = title.lower()
        title_matches = []
        for country, coords in COUNTRY_COORDS.items():
            m = _COUNTRY_PATTERNS[country].search(lower_title)
            if m:
                title_matches.append((m.start(), country, coords))
        if title_matches:
            title_matches.sort(key=lambda x: x[0])
            _, best_country, coords = title_matches[0]
            return best_country, coords[0], coords[1]

    lower_text = text.lower()
    scores: dict = {}
    for country, coords in COUNTRY_COORDS.items():
        count = len(_COUNTRY_PATTERNS[country].findall(lower_text))
        if count > 0:
            scores[country] = count

    if not scores:
        return None, None, None

    best_country = max(scores, key=scores.get)
    coords = COUNTRY_COORDS[best_country]
    return best_country, coords[0], coords[1]


def extract_keywords_from_text(text):
    lower = text.lower()
    all_kws = []
    for kws in CATEGORY_KEYWORDS.values():
        all_kws.extend(kws)
    for kws in THREAT_KEYWORDS.values():
        all_kws.extend(kws)
    found = [kw for kw in all_kws if kw in lower]
    return list(set(found))[:10]


async def _get_cached_response(cache_key: str, ttl_minutes: int):
    doc = await db.valyu_cache.find_one({"key": cache_key}, {"_id": 0})
    if doc:
        cached_at = doc.get("cached_at")
        if cached_at:
            if isinstance(cached_at, str):
                cached_at = datetime.fromisoformat(cached_at)
            age = (datetime.now(timezone.utc) - cached_at).total_seconds()
            if age < ttl_minutes * 60:
                valyu_logger.info(f"Cache HIT for key={cache_key} (age={int(age)}s)")
                return doc.get("data")
    valyu_logger.info(f"Cache MISS for key={cache_key}")
    return None


async def _set_cached_response(cache_key: str, data):
    await db.valyu_cache.update_one(
        {"key": cache_key},
        {"$set": {"key": cache_key, "data": data, "cached_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )


def _rate_limit_ok() -> bool:
    global _valyu_last_call_time
    now = _time_mod.time()
    if now - _valyu_last_call_time < VALYU_RATE_LIMIT_SECONDS:
        valyu_logger.info("Rate-limited – returning cached data instead of calling Valyu")
        return False
    return True


def _mark_valyu_called():
    global _valyu_last_call_time
    _valyu_last_call_time = _time_mod.time()


def _event_content_hash(evt: dict) -> str:
    raw = f"{evt.get('title', '')}|{evt.get('description', '')[:200]}|{evt.get('date', '')}|{evt.get('source', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


async def _deduplicated_request(key: str, coro_factory):
    if key in _valyu_pending_requests:
        task = _valyu_pending_requests[key]
        valyu_logger.info(f"Dedup – reusing in-flight request for key={key}")
        return await task

    async def _run():
        try:
            return await coro_factory()
        finally:
            _valyu_pending_requests.pop(key, None)

    task = asyncio.ensure_future(_run())
    _valyu_pending_requests[key] = task
    return await task


async def valyu_search(query, max_results=20, start_date=None):
    if not VALYU_API_KEY:
        return []

    headers = {
        "x-api-key": VALYU_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "query": query,
        "search_type": "all",
        "max_num_results": max_results,
    }
    if start_date:
        payload["start_date"] = start_date

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{VALYU_BASE_URL}/search",
                json=payload,
                headers=headers,
            )
            if resp.status_code != 200:
                logging.warning(f"Valyu search returned {resp.status_code}: {resp.text[:200]}")
                return []
            data = resp.json()
            return data.get("results", [])
    except Exception as e:
        logging.error(f"Valyu search error: {e}")
        return []


async def valyu_deepsearch(query, max_results=10):
    if not VALYU_API_KEY:
        return {"summary": "Valyu API key not configured.", "sources": []}

    headers = {
        "x-api-key": VALYU_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "query": query,
        "search_type": "all",
        "max_num_results": max_results,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{VALYU_BASE_URL}/deepsearch",
                json=payload,
                headers=headers,
            )
            if resp.status_code != 200:
                logging.warning(f"Valyu deepsearch returned {resp.status_code}: {resp.text[:200]}")
                return {"summary": "Search failed.", "sources": []}
            data = resp.json()
            return {
                "summary": data.get("answer", data.get("summary", "")),
                "sources": [
                    {"title": s.get("title", ""), "url": s.get("url", "")}
                    for s in data.get("results", [])[:20]
                ],
            }
    except Exception as e:
        logging.error(f"Valyu deepsearch error: {e}")
        return {"summary": f"Search error: {str(e)}", "sources": []}


def get_start_date():
    d = datetime.now(timezone.utc) - timedelta(days=7)
    return d.strftime("%Y-%m-%d")


def process_search_results(results):
    events = []
    seen_titles = set()

    for r in results:
        title = (r.get("title") or "").strip()
        content = (r.get("content") or r.get("snippet") or "").strip()
        url = r.get("url", "")
        published = r.get("published_date") or r.get("publishedDate") or datetime.now(timezone.utc).isoformat()

        if not title or title in seen_titles:
            continue
        seen_titles.add(title)

        full_text = f"{title} {content}"
        country, lat, lng = extract_country(full_text, title=title)
        if lat is None or lng is None:
            continue

        category = classify_category(full_text)
        threat_level = classify_threat_level(full_text)

        events.append({
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "title": title,
            "summary": content[:500] if content else title,
            "category": category,
            "threatLevel": threat_level,
            "location": {
                "latitude": lat,
                "longitude": lng,
                "placeName": country,
                "country": country,
            },
            "timestamp": published,
            "source": r.get("source", "web"),
            "sourceUrl": url,
            "keywords": extract_keywords_from_text(full_text),
            "rawContent": content,
        })

    level_priority = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    events.sort(key=lambda e: (level_priority.get(e["threatLevel"], 5), e.get("timestamp", "")))
    return events


MILITARY_BASES_DATA = [
    {"baseName": "Ramstein Air Base", "country": "Germany", "latitude": 49.44, "longitude": 7.60, "type": "usa"},
    {"baseName": "Camp Humphreys", "country": "South Korea", "latitude": 36.96, "longitude": 127.03, "type": "usa"},
    {"baseName": "Yokota Air Base", "country": "Japan", "latitude": 35.75, "longitude": 139.35, "type": "usa"},
    {"baseName": "Naval Station Rota", "country": "Spain", "latitude": 36.64, "longitude": -6.35, "type": "nato"},
    {"baseName": "RAF Lakenheath", "country": "United Kingdom", "latitude": 52.41, "longitude": 0.56, "type": "usa"},
    {"baseName": "Incirlik Air Base", "country": "Turkey", "latitude": 37.00, "longitude": 35.43, "type": "nato"},
    {"baseName": "Al Udeid Air Base", "country": "Qatar", "latitude": 25.12, "longitude": 51.32, "type": "usa"},
    {"baseName": "Camp Lemonnier", "country": "Djibouti", "latitude": 11.55, "longitude": 43.15, "type": "usa"},
    {"baseName": "Naval Support Facility Diego Garcia", "country": "Diego Garcia", "latitude": -7.32, "longitude": 72.42, "type": "usa"},
    {"baseName": "Guantanamo Bay Naval Base", "country": "Cuba", "latitude": 19.90, "longitude": -75.13, "type": "usa"},
    {"baseName": "Thule Air Base", "country": "Greenland", "latitude": 76.53, "longitude": -68.70, "type": "usa"},
    {"baseName": "Joint Base Pearl Harbor-Hickam", "country": "United States", "latitude": 21.35, "longitude": -157.95, "type": "usa"},
    {"baseName": "Osan Air Base", "country": "South Korea", "latitude": 37.09, "longitude": 127.03, "type": "usa"},
    {"baseName": "Kadena Air Base", "country": "Japan", "latitude": 26.35, "longitude": 127.77, "type": "usa"},
    {"baseName": "Aviano Air Base", "country": "Italy", "latitude": 46.03, "longitude": 12.60, "type": "nato"},
    {"baseName": "Spangdahlem Air Base", "country": "Germany", "latitude": 49.97, "longitude": 6.69, "type": "usa"},
    {"baseName": "Naval Station Norfolk", "country": "United States", "latitude": 36.95, "longitude": -76.33, "type": "usa"},
    {"baseName": "Fort Bragg", "country": "United States", "latitude": 35.14, "longitude": -79.00, "type": "usa"},
    {"baseName": "Bagram Airfield", "country": "Afghanistan", "latitude": 34.95, "longitude": 69.27, "type": "usa"},
    {"baseName": "Al Dhafra Air Base", "country": "United Arab Emirates", "latitude": 24.25, "longitude": 54.55, "type": "usa"},
]
