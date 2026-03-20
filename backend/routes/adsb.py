"""
ADS-B Military Aircraft Tracking Proxy

Aggregates live aircraft data from multiple ADS-B APIs, filters for
military aircraft only, normalizes into a unified schema, and caches
results to minimize upstream requests.

Data sources (priority order):
  1. OpenSky Network — OAuth2 authenticated, best data quality, origin_country
  2. ADSB.lol        — no auth, good coverage, /mil endpoint
  3. Airplanes.live  — no auth, real-time, US-focused, /mil endpoint
  4. ADSB.fi         — no auth, European coverage

OpenSky REST API reference:
  https://openskynetwork.github.io/opensky-api/rest.html

State vector response format (array-of-arrays):
  Index  Field             Type
  0      icao24            str
  1      callsign          str|null
  2      origin_country    str
  3      time_position     int|null
  4      last_contact      int
  5      longitude         float|null
  6      latitude          float|null
  7      baro_altitude     float|null  (meters)
  8      on_ground         bool
  9      velocity          float|null  (m/s)
  10     true_track        float|null  (degrees clockwise from north)
  11     vertical_rate     float|null  (m/s)
  12     sensors           int[]|null
  13     geo_altitude      float|null  (meters)
  14     squawk            str|null
  15     spi               bool
  16     position_source   int         (0=ADS-B, 1=ASTERIX, 2=MLAT)
  17     category          int|null    (only with extended=1)
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
ADSB_CACHE_SECONDS = int(os.environ.get("ADSB_CACHE_SECONDS", "15"))

# OpenSky Network OAuth2 credentials (client_credentials grant)
OPENSKY_CLIENT_ID = os.environ.get("OPENSKY_CLIENT_ID", "")
OPENSKY_CLIENT_SECRET = os.environ.get("OPENSKY_CLIENT_SECRET", "")
OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)
OPENSKY_API_URL = "https://opensky-network.org/api"

# OpenSky rate-limit: min 10 s between requests (authenticated gets 5 s, but
# we use 10 s to stay safely within the 4 000 credits/day budget).
OPENSKY_MIN_INTERVAL_S = int(os.environ.get("OPENSKY_MIN_INTERVAL_S", "10"))

# Unit conversion constants
_METERS_TO_FEET = 3.28084
_MS_TO_KNOTS = 1.94384
_MS_TO_FPM = 196.8504   # m/s → feet per minute (60 * 3.28084)

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
    "OTAN",
    # US military branch-specific
    "AEVAC", "SAM", "EXEC", "VENUS", "HERKY",
    "KING", "JOLLY", "PEDRO", "DUSTOFF",
)

# ---------------------------------------------------------------------------
# Known military ICAO hex ranges (selected, non-exhaustive)
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
# In-memory caches
# ---------------------------------------------------------------------------
_cache: dict = {"data": [], "timestamp": 0}

# OpenSky OAuth2 token cache
_opensky_token: dict = {"access_token": "", "expires_at": 0}

# OpenSky rate-limit tracker
_opensky_last_call: float = 0


# ===================================================================
# Military identification helpers
# ===================================================================

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


# ===================================================================
# Safe conversion helpers
# ===================================================================

def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None


def _meters_to_feet(val) -> Optional[float]:
    """Convert meters to feet, returning None if input is None."""
    f = _safe_float(val)
    return round(f * _METERS_TO_FEET, 1) if f is not None else None


def _ms_to_knots(val) -> Optional[float]:
    """Convert m/s to knots, returning None if input is None."""
    f = _safe_float(val)
    return round(f * _MS_TO_KNOTS, 1) if f is not None else None


def _ms_to_fpm(val) -> Optional[float]:
    """Convert m/s to feet per minute, returning None if input is None."""
    f = _safe_float(val)
    return round(f * _MS_TO_FPM, 1) if f is not None else None


# ===================================================================
# OpenSky OAuth2 token management
# ===================================================================

async def _get_opensky_token() -> Optional[str]:
    """
    Obtain (or reuse cached) OAuth2 access_token via client_credentials grant.
    Returns None if credentials are not configured or the request fails.
    Tokens are valid for 30 minutes; we refresh 60 s early.
    """
    global _opensky_token

    if not OPENSKY_CLIENT_ID or not OPENSKY_CLIENT_SECRET:
        return None

    now = time.time()
    if _opensky_token["access_token"] and now < _opensky_token["expires_at"]:
        return _opensky_token["access_token"]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                OPENSKY_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": OPENSKY_CLIENT_ID,
                    "client_secret": OPENSKY_CLIENT_SECRET,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            body = resp.json()
            token = body.get("access_token", "")
            expires_in = body.get("expires_in", 1800)  # default 30 min
            _opensky_token = {
                "access_token": token,
                "expires_at": now + expires_in - 60,  # refresh 60 s early
            }
            logger.info("OpenSky OAuth2 token acquired (expires_in=%ss)", expires_in)
            return token
    except Exception as exc:
        logger.warning("OpenSky OAuth2 token request failed: %s", exc)
        _opensky_token = {"access_token": "", "expires_at": 0}
        return None


# ===================================================================
# Normalizers — each API response → unified list of dicts
# ===================================================================

def _normalize_opensky(states: list, timestamp: int) -> list:
    """
    Normalize OpenSky /api/states/all response.

    Each state is a positional array:
      [icao24, callsign, origin_country, time_position, last_contact,
       longitude, latitude, baro_altitude, on_ground, velocity,
       true_track, vertical_rate, sensors, geo_altitude, squawk,
       spi, position_source, ...]
    """
    results = []
    for sv in states:
        if not sv or len(sv) < 17:
            continue

        icao24 = (sv[0] or "").strip() or None
        callsign = (sv[1] or "").strip() or None
        origin_country = sv[2] or None

        lon = sv[5]
        lat = sv[6]
        if lat is None or lon is None:
            continue

        try:
            lat = float(lat)
            lon = float(lon)
        except (ValueError, TypeError):
            continue

        # OpenSky doesn't provide aircraft type in state vectors,
        # so we filter on callsign + ICAO hex only
        if not is_military(callsign, icao24, None):
            continue

        on_ground = bool(sv[8]) if sv[8] is not None else None

        results.append({
            "id": icao24 or callsign or f"{lat}:{lon}",
            "callsign": callsign,
            "lat": lat,
            "lon": lon,
            "altitude": _meters_to_feet(sv[7]),       # baro_altitude m → ft
            "velocity": _ms_to_knots(sv[9]),           # m/s → knots
            "heading": _safe_float(sv[10]),             # true_track (degrees)
            "vertical_rate": _ms_to_fpm(sv[11]),        # m/s → ft/min
            "aircraft_type": None,                      # not in state vectors
            "origin_country": origin_country,
            "on_ground": on_ground,
            "squawk": sv[14] if len(sv) > 14 else None,
            "source": "opensky",
            "timestamp": timestamp or time.time(),
        })
    return results


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
            "altitude": _safe_float(alt),              # already in feet
            "velocity": _safe_float(velocity),          # already in knots
            "heading": _safe_float(heading),
            "vertical_rate": _safe_float(ac.get("baro_rate") or ac.get("geom_rate")),  # already in ft/min
            "aircraft_type": ac_type,
            "origin_country": None,
            "on_ground": ac.get("ground") if "ground" in ac else None,
            "squawk": ac.get("squawk"),
            "source": source,
            "timestamp": ac.get("seen_pos") or ac.get("now") or time.time(),
        })
    return results


# ===================================================================
# Fetchers — each API source
# ===================================================================

async def _fetch_v2_source(url: str, source: str) -> list:
    """Generic fetcher for ADSBx v2-compatible endpoints (ADSB.lol, Airplanes.live, ADSB.fi)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            aircraft = data.get("ac") or data.get("aircraft") or []
            return _normalize_adsbx_v2(aircraft, source)
    except Exception as exc:
        logger.warning("%s fetch failed: %s", source, exc)
        return []


async def _fetch_opensky() -> list:
    """
    Fetch military aircraft from OpenSky Network /api/states/all.

    Uses OAuth2 Bearer token if credentials are configured.
    Respects rate-limit interval (OPENSKY_MIN_INTERVAL_S).
    """
    global _opensky_last_call

    # Rate-limit guard
    now = time.time()
    if now - _opensky_last_call < OPENSKY_MIN_INTERVAL_S:
        return []

    token = await _get_opensky_token()
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            _opensky_last_call = time.time()
            resp = await client.get(
                f"{OPENSKY_API_URL}/states/all",
                headers=headers,
                params={"extended": "1"},
            )
            resp.raise_for_status()
            data = resp.json()
            states = data.get("states") or []
            ts = data.get("time", int(time.time()))
            return _normalize_opensky(states, ts)
    except Exception as exc:
        logger.warning("OpenSky fetch failed: %s", exc)
        return []


# ===================================================================
# Aggregator with fallback
# ===================================================================

async def _fetch_military_aircraft() -> list:
    """
    Try sources in priority order, fall back if one fails.
    Deduplicates by ICAO hex / callsign.
    """
    # 1. OpenSky (authenticated, best data quality)
    if OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET:
        results = await _fetch_opensky()
        if results:
            return _deduplicate(results)

    # 2. ADSB.lol (has /mil endpoint)
    results = await _fetch_v2_source("https://api.adsb.lol/v2/mil", "adsb.lol")
    if results:
        return _deduplicate(results)

    # 3. Airplanes.live (has /mil endpoint)
    results = await _fetch_v2_source("https://api.airplanes.live/v2/mil", "airplanes.live")
    if results:
        return _deduplicate(results)

    # 4. ADSB.fi (all aircraft — military filtered client-side)
    results = await _fetch_v2_source("https://opendata.adsb.fi/api/v2/all", "adsb.fi")
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


# ===================================================================
# API Endpoint
# ===================================================================

@router.get("/military-aircraft")
async def get_military_aircraft():
    """
    Return currently tracked military aircraft.
    Results are cached for ADSB_CACHE_SECONDS to reduce upstream load.
    """
    now = time.time()
    if now - _cache["timestamp"] < ADSB_CACHE_SECONDS and _cache["data"]:
        return {"aircraft": _cache["data"], "count": len(_cache["data"]), "cached": True}

    aircraft = await _fetch_military_aircraft()
    _cache["data"] = aircraft
    _cache["timestamp"] = now

    return {"aircraft": aircraft, "count": len(aircraft), "cached": False}
