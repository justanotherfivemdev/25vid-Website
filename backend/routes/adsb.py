"""
ADS-B Military Aircraft Tracking Proxy

Aggregates live aircraft data from multiple free ADS-B APIs,
filters for military aircraft only, normalizes into a unified schema,
and caches results to minimize upstream requests.

Data sources (priority order):
  1. ADSB.lol       — no auth, good coverage, reliable
  2. Airplanes.live — no auth, real-time, US-focused
  3. ADSB.fi        — no auth, European coverage

OpenSky Network is NOT used by default because its free tier has strict
rate-limits (5 req/10 s anonymous, 1 req/5 s authenticated) and is less
reliable for continuous polling.  It can be enabled via env-var if desired.
"""

import os
import math
import time
import logging
from typing import Optional

import httpx
from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/adsb", tags=["adsb"])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ADSB_POLL_CACHE_SECONDS = int(os.environ.get("ADSB_CACHE_SECONDS", "15"))

OPENSKY_USERNAME = os.environ.get("OPENSKY_USERNAME", "")
OPENSKY_PASSWORD = os.environ.get("OPENSKY_PASSWORD", "")

# ---------------------------------------------------------------------------
# Military callsign prefixes (expandable)
# ---------------------------------------------------------------------------
MILITARY_CALLSIGN_PREFIXES = (
    "RCH", "REACH", "LAGR", "EVAC", "GOTO", "DUKE", "HKY",
    "NATO", "FORTE", "JAKE", "TOPCAT", "IRON", "GHOST",
    "HAVOC", "REAPER", "VIPER", "VAPOR", "DARK", "NIGHT",
    "SNTL", "SENTRY", "COBRA", "RAPTOR", "ATLAS", "HOMER",
    "BOLT", "FURY", "DAGGER", "TALON", "RAVEN", "ROCKY",
    "VALOR", "NOBLE", "LANCE", "BLADE", "STORM", "WRATH",
    "KNIFE", "RAZOR", "MAGMA", "JEDI", "NITE", "DOOM",
    "HAWK", "FENIX", "GRIZZLY", "MOOSE", "BISON", "CLYTN",
    "TEAL", "ORCA", "WOLF", "TIGER", "PANTH", "BOXER",
    "COMET", "FLASH", "SPIKE", "ARROW", "THUD", "GRIZZ",
    "STEEL", "BLOCK", "CRASH", "DUSTY", "CHAOS", "TRICK",
    "RRR", "CNV", "IAM", "CFC", "GAF", "BAF", "FAF",
    "RFR", "SHF", "HVK", "RFF", "NJE", "MMF", "PLF",
    "HAF", "CEF", "SVF", "DAF", "NOH", "ROF", "TUF",
    "THF", "PAT", "ASY",
    # NATO/Allied
    "NATO", "OTAN",
    # US military branch-specific
    "AEVAC", "SAM", "EXEC", "VENUS", "HERKY",
    "KING", "JOLLY", "PEDRO", "DUSTOFF",
)

# ---------------------------------------------------------------------------
# Known military ICAO hex ranges (selected, non-exhaustive)
#   US military: 0xADF7C8 – 0xAFFFFF
#   UK military: 0x43C000 – 0x43CFFF
#   DE military: 0x3F4000 – 0x3F7FFF
#   FR military: 0x3E8000 – 0x3EBFFF
#   etc.
# ---------------------------------------------------------------------------
MILITARY_ICAO_RANGES = [
    (0xADF7C8, 0xAFFFFF),  # United States
    (0x43C000, 0x43CFFF),  # United Kingdom
    (0x3F4000, 0x3F7FFF),  # Germany
    (0x3E8000, 0x3EBFFF),  # France
    (0x3A8000, 0x3ABFFF),  # Italy
    (0x480000, 0x487FFF),  # Netherlands
    (0x500000, 0x507FFF),  # Belgium
    (0x4A8000, 0x4AFFFF),  # Norway
    (0x4B0000, 0x4B7FFF),  # Denmark
    (0x4C0000, 0x4C7FFF),  # Greece
    (0x600000, 0x6003FF),  # Australia
    (0xC87000, 0xC87FFF),  # Canada
    (0x7CF800, 0x7CFFFF),  # Japan ASDF
]

# ---------------------------------------------------------------------------
# Known military aircraft type codes (ICAO type designators)
# ---------------------------------------------------------------------------
MILITARY_AIRCRAFT_TYPES = {
    "C17", "C130", "C5M", "C5", "KC10", "KC46", "KC135",
    "B52", "B1", "B2", "F15", "F16", "F18", "F22", "F35",
    "A10", "E3", "E6", "E8", "P3", "P8", "C2", "C40",
    "C37", "C32", "V22", "MV22", "CV22", "H60", "CH47",
    "C12", "C26", "C21", "T38", "T6", "RC135", "RQ4",
    "MQ9", "MQ1", "U2", "E4B", "VC25", "C30J", "A400",
    "EUFI", "MRTT", "A330", "A310", "C295", "CN35",
    "C160", "GLF5", "GLEX", "H64", "H1", "AH64",
}

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------
_cache: dict = {"data": [], "timestamp": 0}


def _is_military_callsign(callsign: Optional[str]) -> bool:
    """Check if a callsign matches known military patterns."""
    if not callsign:
        return False
    cs = callsign.strip().upper()
    if not cs:
        return False
    for prefix in MILITARY_CALLSIGN_PREFIXES:
        if cs.startswith(prefix):
            return True
    return False


def _is_military_icao(hex_code: Optional[str]) -> bool:
    """Check if an ICAO hex address falls within known military ranges."""
    if not hex_code:
        return False
    try:
        addr = int(hex_code.strip(), 16)
    except (ValueError, TypeError):
        return False
    for lo, hi in MILITARY_ICAO_RANGES:
        if lo <= addr <= hi:
            return True
    return False


def _is_military_type(aircraft_type: Optional[str]) -> bool:
    """Check if an aircraft type code matches known military types."""
    if not aircraft_type:
        return False
    return aircraft_type.strip().upper() in MILITARY_AIRCRAFT_TYPES


def is_military(callsign: Optional[str], hex_code: Optional[str],
                aircraft_type: Optional[str]) -> bool:
    """Determine whether an aircraft is military using all available signals."""
    return (
        _is_military_callsign(callsign)
        or _is_military_icao(hex_code)
        or _is_military_type(aircraft_type)
    )


# ---------------------------------------------------------------------------
# Normalizers — each API response → unified list of dicts
# ---------------------------------------------------------------------------
def _normalize_adsbx_v2(aircraft_list: list, source: str) -> list:
    """Normalize ADSB.lol / Airplanes.live / ADSB.fi (ADSBx v2-compatible) data."""
    results = []
    for ac in aircraft_list:
        callsign = (ac.get("flight") or ac.get("call") or "").strip() or None
        hex_code = (ac.get("hex") or "").strip() or None
        ac_type = (ac.get("t") or ac.get("type") or "").strip() or None

        if not is_military(callsign, hex_code, ac_type):
            continue

        lat = ac.get("lat")
        lon = ac.get("lon")
        if lat is None or lon is None:
            continue

        try:
            lat = float(lat)
            lon = float(lon)
        except (ValueError, TypeError):
            continue

        alt = ac.get("alt_baro") or ac.get("altitude") or ac.get("alt_geom")
        velocity = ac.get("gs") or ac.get("spd")
        heading = ac.get("track") or ac.get("true_heading") or ac.get("heading")

        results.append({
            "id": hex_code or callsign or f"{lat}:{lon}",
            "callsign": callsign,
            "lat": lat,
            "lon": lon,
            "altitude": _safe_float(alt),
            "velocity": _safe_float(velocity),
            "heading": _safe_float(heading),
            "aircraft_type": ac_type,
            "source": source,
            "timestamp": ac.get("seen_pos") or ac.get("now") or time.time(),
        })
    return results


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Fetchers — each API source
# ---------------------------------------------------------------------------
async def _fetch_adsblol() -> list:
    """Fetch from ADSB.lol (v2 endpoint, military filter via server if available)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://api.adsb.lol/v2/mil")
            resp.raise_for_status()
            data = resp.json()
            aircraft = data.get("ac") or data.get("aircraft") or []
            return _normalize_adsbx_v2(aircraft, "adsb.lol")
    except Exception as exc:
        logger.warning("ADSB.lol fetch failed: %s", exc)
        return []


async def _fetch_airplaneslive() -> list:
    """Fetch from Airplanes.live (v2-compatible)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://api.airplanes.live/v2/mil")
            resp.raise_for_status()
            data = resp.json()
            aircraft = data.get("ac") or data.get("aircraft") or []
            return _normalize_adsbx_v2(aircraft, "airplanes.live")
    except Exception as exc:
        logger.warning("Airplanes.live fetch failed: %s", exc)
        return []


async def _fetch_adsbfi() -> list:
    """Fetch from ADSB.fi (v2-compatible)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://opendata.adsb.fi/api/v2/all")
            resp.raise_for_status()
            data = resp.json()
            aircraft = data.get("ac") or data.get("aircraft") or []
            # ADSB.fi returns all aircraft; we filter for military client-side
            return _normalize_adsbx_v2(aircraft, "adsb.fi")
    except Exception as exc:
        logger.warning("ADSB.fi fetch failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Aggregator with fallback
# ---------------------------------------------------------------------------
async def _fetch_military_aircraft() -> list:
    """
    Try primary source first, fall back in priority order.
    Deduplicates by ICAO hex / callsign.
    """
    # Try primary: ADSB.lol (has /mil endpoint)
    results = await _fetch_adsblol()
    if results:
        return _deduplicate(results)

    # Fallback 1: Airplanes.live (has /mil endpoint)
    results = await _fetch_airplaneslive()
    if results:
        return _deduplicate(results)

    # Fallback 2: ADSB.fi (all aircraft, filtered client-side)
    results = await _fetch_adsbfi()
    if results:
        return _deduplicate(results)

    return []


def _deduplicate(aircraft: list) -> list:
    """Remove duplicate aircraft based on ICAO hex or callsign."""
    seen = set()
    unique = []
    for ac in aircraft:
        key = ac["id"]
        if key not in seen:
            seen.add(key)
            unique.append(ac)
    return unique


# ---------------------------------------------------------------------------
# API Endpoint
# ---------------------------------------------------------------------------
@router.get("/military-aircraft")
async def get_military_aircraft():
    """
    Return currently tracked military aircraft.
    Results are cached for ADSB_POLL_CACHE_SECONDS to reduce upstream load.
    """
    now = time.time()
    if now - _cache["timestamp"] < ADSB_POLL_CACHE_SECONDS and _cache["data"]:
        return {"aircraft": _cache["data"], "count": len(_cache["data"]), "cached": True}

    aircraft = await _fetch_military_aircraft()
    _cache["data"] = aircraft
    _cache["timestamp"] = now

    return {"aircraft": aircraft, "count": len(aircraft), "cached": False}
