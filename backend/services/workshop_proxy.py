"""
Workshop Proxy Service.

Fetches live mod listings from the Arma Reforger Workshop at
``reforger.armaplatform.com/workshop``.

The workshop is a Next.js application that embeds structured JSON data
(including thumbnail URLs) in a ``<script id="__NEXT_DATA__">`` tag.
This service extracts mod data from that JSON blob, falling back to HTML
element scraping when the JSON is unavailable.

The proxy adds:
 * browser-like request headers
 * per-page result caching (short TTL to stay responsive but polite)
 * rate-limiting (token-bucket)
 * structured logging of every outbound request
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from database import db

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
WORKSHOP_BASE = "https://reforger.armaplatform.com"
WORKSHOP_URL = f"{WORKSHOP_BASE}/workshop"
RESULTS_PER_PAGE = 16  # Workshop returns 16 items per page

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

# Sort values recognised by the Workshop site
VALID_SORTS = {"popularity", "newest", "subscribers", "versionSize"}

# Cache TTL for browse/search results (seconds)
_BROWSE_CACHE_TTL = 300  # 5 minutes

# ---------------------------------------------------------------------------
# Token-bucket rate limiter (process-wide)
# ---------------------------------------------------------------------------
_RATE_TOKENS = 3.0       # max burst (3 requests can be made immediately)
_RATE_REFILL = 0.5       # tokens per second (burst: 3 requests, sustained: 1 every 2s)
_bucket_tokens = _RATE_TOKENS
_bucket_last = time.monotonic()
_bucket_lock = asyncio.Lock()


async def _acquire_rate_token() -> None:
    """Block until a rate-limit token is available."""
    global _bucket_tokens, _bucket_last
    async with _bucket_lock:
        now = time.monotonic()
        elapsed = now - _bucket_last
        _bucket_tokens = min(_RATE_TOKENS, _bucket_tokens + elapsed * _RATE_REFILL)
        _bucket_last = now
        if _bucket_tokens < 1.0:
            wait = (1.0 - _bucket_tokens) / _RATE_REFILL
            await asyncio.sleep(wait)
            _bucket_tokens = 0.0
            _bucket_last = time.monotonic()
        else:
            _bucket_tokens -= 1.0


# ---------------------------------------------------------------------------
# Cache helpers  (MongoDB-backed, short TTL)
# ---------------------------------------------------------------------------
_PROXY_CACHE = "workshop_proxy_cache"


async def _get_cached(key: str) -> Optional[dict]:
    doc = await db[_PROXY_CACHE].find_one({"key": key}, {"_id": 0})
    if doc:
        expires_at = doc.get("expires_at")
        if expires_at:
            # MongoDB may return offset-naive datetimes; normalize to UTC-aware
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > datetime.now(timezone.utc):
                return doc.get("data")
    return None


async def _set_cached(key: str, data: Any) -> None:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_BROWSE_CACHE_TTL)
    await db[_PROXY_CACHE].update_one(
        {"key": key},
        {"$set": {"key": key, "expires_at": expires_at, "data": data}},
        upsert=True,
    )


# ---------------------------------------------------------------------------
# HTML fetcher
# ---------------------------------------------------------------------------
async def _fetch_html(url: str) -> Optional[str]:
    """Fetch a URL with browser-like headers.  Returns HTML string or None."""
    await _acquire_rate_token()
    logger.info("Workshop proxy: fetching %s", url)
    try:
        async with httpx.AsyncClient(
            timeout=20.0, follow_redirects=True
        ) as client:
            resp = await client.get(url, headers=_BROWSER_HEADERS)
            resp.raise_for_status()
            return resp.text
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Workshop proxy HTTP error %s for %s", exc.response.status_code, url
        )
    except Exception as exc:
        logger.error("Workshop proxy request failed for %s: %s", url, exc)
    return None


# ---------------------------------------------------------------------------
# HTML parsing  — mod list page
# ---------------------------------------------------------------------------
def _extract_next_data(html: str) -> Optional[dict]:
    """Extract the __NEXT_DATA__ JSON embedded in the workshop HTML.

    The Arma Reforger Workshop is a Next.js application that embeds all
    page data (including mod listings with image URLs) inside a
    ``<script id="__NEXT_DATA__">`` tag.  Parsing this JSON is far more
    reliable than scraping rendered HTML elements.
    """
    match = re.search(
        r'<script[^>]*\bid=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if match:
        try:
            return json.loads(match.group(1))
        except (json.JSONDecodeError, TypeError):
            logger.warning("Failed to parse __NEXT_DATA__ JSON")
    return None


def _thumbnail_from_asset(asset: dict) -> str:
    """Return the best thumbnail URL from a workshop asset dict."""
    previews = asset.get("previews") or asset.get("images") or []
    if isinstance(previews, list):
        for preview in previews:
            if not isinstance(preview, dict):
                continue
            # Next.js data stores thumbnails under previews[].thumbnails
            thumbs = preview.get("thumbnails", {})
            if isinstance(thumbs, dict):
                for _mime, variants in thumbs.items():
                    if isinstance(variants, list):
                        for v in variants:
                            url = v.get("url", "") if isinstance(v, dict) else ""
                            if url:
                                return url
            # Fallback: direct preview URL
            url = preview.get("url", "")
            if url:
                return url

    # Legacy / alternative field names
    for field in ("imageUrl", "image_url", "thumbnail", "thumbnailUrl"):
        val = asset.get(field, "")
        if val:
            return val

    return ""


def _human_size(size_bytes: Any) -> str:
    """Convert a byte count to a human-readable string (e.g. '12.3 MB')."""
    try:
        n = int(size_bytes)
    except (TypeError, ValueError):
        return ""
    if n <= 0:
        return ""
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _parse_mod_list_from_json(data: dict) -> Tuple[List[Dict], int]:
    """Parse mod list from the __NEXT_DATA__ JSON structure."""
    page_props = data.get("props", {}).get("pageProps", {})

    # Assets can be at pageProps.assets or pageProps.data, etc.
    assets_obj = page_props.get("assets") or page_props.get("data") or {}
    rows: list = []
    total = 0

    if isinstance(assets_obj, dict):
        rows = assets_obj.get("rows") or assets_obj.get("items") or []
        total = assets_obj.get("count") or assets_obj.get("total") or 0
    elif isinstance(assets_obj, list):
        rows = assets_obj
        total = len(rows)

    mods: List[Dict] = []
    for asset in rows:
        if not isinstance(asset, dict):
            continue

        mod_id = asset.get("id", "") or asset.get("modId", "")

        name = asset.get("name", "") or ""

        # Author may be a string or an object with a username field
        author_raw = asset.get("creator") or asset.get("author") or ""
        if isinstance(author_raw, dict):
            author = author_raw.get("username", "") or author_raw.get("name", "")
        else:
            author = str(author_raw)

        thumbnail_url = _thumbnail_from_asset(asset)

        # Size
        size_raw = (
            asset.get("currentVersionSize")
            or asset.get("size")
            or asset.get("fileSize")
            or 0
        )
        size = _human_size(size_raw)

        # Rating (averageRating is 0-1 float → convert to percentage string)
        avg_rating = asset.get("averageRating")
        if avg_rating is not None:
            try:
                rating = f"{round(float(avg_rating) * 100)}%"
            except (TypeError, ValueError):
                rating = ""
        else:
            rating = ""

        # Tags / categories
        mod_tags: List[str] = []
        raw_tags = asset.get("tags") or asset.get("categories") or []
        if isinstance(raw_tags, list):
            for t in raw_tags:
                tag_name = t.get("name", "") if isinstance(t, dict) else str(t)
                if tag_name:
                    mod_tags.append(tag_name)

        workshop_url = f"{WORKSHOP_BASE}/workshop/{mod_id}" if mod_id else ""

        mods.append({
            "mod_id": mod_id,
            "name": name,
            "author": author,
            "thumbnail_url": thumbnail_url,
            "size": size,
            "rating": rating,
            "tags": mod_tags,
            "workshop_url": workshop_url,
        })

    return mods, int(total) if total else len(mods)


def _parse_mod_list_from_html(soup: BeautifulSoup) -> Tuple[List[Dict], int]:
    """Fallback: parse the workshop listing from rendered HTML elements."""
    mods: List[Dict] = []
    total_results = 0

    # Extract total from "Showing X to Y of Z results"
    summary_el = soup.select_one("div.flex div.hidden p.text-sm")
    if summary_el:
        match = re.search(r"of\s+([\d,]+)\s+results?", summary_el.get_text())
        if match:
            total_results = int(match.group(1).replace(",", ""))

    # Check for "No mods found."
    no_results = soup.select_one("div.container div.flex div.grid div.text-center")
    if no_results and "No mods found" in no_results.get_text():
        return [], 0

    cards = soup.select("div.grid a.group[href]")

    for card in cards:
        href = card.get("href", "")

        # ── mod_id & URL
        # Workshop URLs: /workshop/{HEX_ID}-{slug-name}
        # Arma Reforger mod IDs are exactly 16 hex characters.
        mod_id = ""
        parts = href.strip("/").split("/")
        if len(parts) >= 2:
            slug = parts[-1]
            hex_match = re.match(r"^([0-9A-Fa-f]{16})", slug)
            if hex_match:
                mod_id = hex_match.group(1)
        mod_url = f"{WORKSHOP_BASE}{href}" if href.startswith("/") else href

        # ── name
        name_el = card.select_one("h2.break-words")
        name = name_el.get_text(strip=True) if name_el else ""

        # ── author
        author = ""
        author_el = card.select_one("span.mt-1")
        if author_el:
            txt = author_el.get_text(strip=True)
            author = txt[3:] if txt.lower().startswith("by ") else txt

        # ── thumbnail — check multiple attributes for lazy-loaded images
        thumbnail_url = ""
        img_el = card.select_one("div.aspect-h-9 img") or card.select_one("img")
        if img_el:
            src = (
                img_el.get("src")
                or img_el.get("data-src")
                or img_el.get("srcset", "").split(",")[0].split(" ")[0]
            )
            if src and not src.startswith("data:"):
                if src.startswith("/"):
                    src = f"{WORKSHOP_BASE}{src}"
                thumbnail_url = src

        # ── size & rating
        size = ""
        rating = ""
        for span in card.select("span.ml-1"):
            txt = span.get_text(strip=True)
            if "%" in txt:
                rating = txt
            elif txt:
                size = txt

        # ── tags
        mod_tags: List[str] = []
        for tag_el in card.select("span.text-xs, span.badge, a[href*='tags=']"):
            txt = tag_el.get_text(strip=True)
            if txt and not txt.startswith("by ") and "%" not in txt and len(txt) < 40:
                tag_href = tag_el.get("href", "")
                if "tags=" in tag_href:
                    mod_tags.append(txt)

        mods.append({
            "mod_id": mod_id,
            "name": name,
            "author": author,
            "thumbnail_url": thumbnail_url,
            "size": size,
            "rating": rating,
            "tags": mod_tags,
            "workshop_url": mod_url,
        })

    return mods, total_results


def _parse_mod_list(html: str) -> Tuple[List[Dict], int]:
    """Parse the workshop listing page and return (mods, total_results).

    The Arma Reforger Workshop is a Next.js application.  Image URLs and
    other mod metadata are embedded in a ``<script id="__NEXT_DATA__">``
    JSON blob — the rendered ``<img>`` tags may contain only placeholders
    or optimised ``/_next/image`` paths that cannot be used directly.

    Strategy:
      1. Try to extract structured data from ``__NEXT_DATA__`` (reliable).
      2. Fall back to scraping rendered HTML elements (legacy).
    """
    # ── Strategy 1: JSON from __NEXT_DATA__ ─────────────────────────
    next_data = _extract_next_data(html)
    if next_data:
        try:
            mods, total = _parse_mod_list_from_json(next_data)
            if mods:
                logger.debug(
                    "Parsed %d mods from __NEXT_DATA__ JSON", len(mods)
                )
                return mods, total
            logger.debug("__NEXT_DATA__ found but contained no mods")
        except Exception as exc:
            logger.warning("Failed to parse mods from __NEXT_DATA__: %s", exc)

    # ── Strategy 2: HTML scraping fallback ──────────────────────────
    logger.debug("Falling back to HTML scraping")
    soup = BeautifulSoup(html, "lxml")
    return _parse_mod_list_from_html(soup)


def _normalize_tags(tags: Optional[List[str]]) -> List[str]:
    """Normalize workshop tags for stable cache keys and query params."""
    normalized: List[str] = []
    seen = set()
    for tag in tags or []:
        value = str(tag).strip().upper()
        if value and value not in seen:
            seen.add(value)
            normalized.append(value)
    return normalized


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def browse_workshop(
    *,
    category: str = "popular",
    page: int = 1,
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Browse the workshop by category with pagination.

    ``category`` maps to the Workshop ``sort`` parameter:
      popular      → popularity
      newest       → newest
      subscribers  → subscribers
      versionSize  → versionSize
    """
    sort_map = {
        "popular": "popularity",
        "newest": "newest",
        "subscribers": "subscribers",
        "versionSize": "versionSize",
    }
    sort_value = sort_map.get(category, "popularity")
    normalized_tags = _normalize_tags(tags)

    cache_key = f"browse:{sort_value}:{page}:{','.join(normalized_tags)}"
    cached = await _get_cached(cache_key)
    if cached:
        logger.debug("Workshop proxy cache hit: %s", cache_key)
        return cached

    url = f"{WORKSHOP_URL}?page={page}&sort={sort_value}"
    for tag in normalized_tags:
        url += f"&tags={quote_plus(tag)}"

    html = await _fetch_html(url)
    if html is None:
        logger.warning("Workshop browse failed for category=%s page=%d", category, page)
        return _error_response("Workshop temporarily unavailable", page)

    try:
        mods, total = _parse_mod_list(html)
    except Exception as exc:
        logger.error("Workshop parse error (browse): %s", exc, exc_info=True)
        return _error_response("Failed to parse workshop data", page)

    result = {
        "mods": mods,
        "total": total,
        "page": page,
        "per_page": RESULTS_PER_PAGE,
        "total_pages": max(1, -(-total // RESULTS_PER_PAGE)),  # ceil division
        "category": category,
        "source": "live",
    }
    await _set_cached(cache_key, result)
    return result


async def search_workshop(
    *,
    query: str,
    page: int = 1,
    sort: str = "popularity",
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Search the workshop by keyword with pagination and optional tag filter."""
    sort_value = sort if sort in VALID_SORTS else "popularity"
    normalized_tags = _normalize_tags(tags)

    cache_key = f"search:{query}:{sort_value}:{page}:{','.join(normalized_tags)}"
    cached = await _get_cached(cache_key)
    if cached:
        logger.debug("Workshop proxy cache hit: %s", cache_key)
        return cached

    encoded_q = quote_plus(query)
    url = f"{WORKSHOP_URL}?page={page}&search={encoded_q}&sort={sort_value}"
    for tag in normalized_tags:
        url += f"&tags={quote_plus(tag)}"

    html = await _fetch_html(url)
    if html is None:
        logger.warning("Workshop search failed for q=%s page=%d", query, page)
        return _error_response("Workshop temporarily unavailable", page)

    try:
        mods, total = _parse_mod_list(html)
    except Exception as exc:
        logger.error("Workshop parse error (search): %s", exc, exc_info=True)
        return _error_response("Failed to parse workshop data", page)

    result = {
        "mods": mods,
        "total": total,
        "page": page,
        "per_page": RESULTS_PER_PAGE,
        "total_pages": max(1, -(-total // RESULTS_PER_PAGE)),
        "query": query,
        "source": "live",
    }
    await _set_cached(cache_key, result)
    return result


def _error_response(message: str, page: int) -> Dict[str, Any]:
    """Return a graceful error response instead of raising."""
    return {
        "mods": [],
        "total": 0,
        "page": page,
        "per_page": RESULTS_PER_PAGE,
        "total_pages": 0,
        "error": message,
        "source": "error",
    }


# ---------------------------------------------------------------------------
# Mod-specific scenario scraping
# ---------------------------------------------------------------------------

def _parse_scenario_ids_from_json(data: dict) -> List[str]:
    """Extract scenario IDs from a mod's /scenarios __NEXT_DATA__ JSON."""
    page_props = data.get("props", {}).get("pageProps", {})
    scenarios_raw = (
        page_props.get("scenarios")
        or page_props.get("assets")
        or page_props.get("data")
        or {}
    )

    rows: list = []
    if isinstance(scenarios_raw, dict):
        rows = scenarios_raw.get("rows") or scenarios_raw.get("items") or []
    elif isinstance(scenarios_raw, list):
        rows = scenarios_raw

    scenario_ids: List[str] = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        # Scenario ID is typically the "guid" or "scenarioId" field
        sid = (
            item.get("scenarioId")
            or item.get("scenario_id")
            or item.get("guid")
            or item.get("id")
            or ""
        )
        if sid:
            scenario_ids.append(sid)
        # Also check nested scenarioId patterns like "{GUID}Missions/..."
        name = item.get("name", "")
        if name and name.startswith("{") and "}" in name and "/" in name:
            scenario_ids.append(name)

    return list(dict.fromkeys(scenario_ids))  # dedupe preserving order


def _parse_scenario_ids_from_html(soup: BeautifulSoup) -> List[str]:
    """Fallback: extract scenario IDs from rendered HTML on a mod's /scenarios page."""
    scenario_ids: List[str] = []

    # Look for scenario ID patterns in any visible text on the page
    # Arma scenario IDs follow the pattern: {HEX_GUID}Path/To/Mission.conf
    scenario_pattern = re.compile(r'\{[0-9A-Fa-f]{16}\}[^\s"<>]+\.conf')

    for text_el in soup.find_all(string=True):
        text = str(text_el).strip()
        if not text:
            continue
        for match in scenario_pattern.finditer(text):
            scenario_ids.append(match.group(0))

    # Also look in code/pre tags and data attributes
    for el in soup.select("code, pre, [data-scenario-id], [data-id]"):
        text = el.get_text(strip=True) if el.string is None else el.string.strip()
        for match in scenario_pattern.finditer(text):
            scenario_ids.append(match.group(0))
        for attr in ("data-scenario-id", "data-id"):
            val = el.get(attr, "")
            if scenario_pattern.match(val):
                scenario_ids.append(val)

    return list(dict.fromkeys(scenario_ids))


async def fetch_mod_scenarios(mod_id: str) -> List[str]:
    """Fetch scenarios from a mod's /scenarios workshop page.

    Returns a list of scenario ID strings (resource paths).
    Results are cached for the standard browse TTL.
    """
    cache_key = f"mod_scenarios:{mod_id}"
    cached = await _get_cached(cache_key)
    if cached is not None:
        return cached if isinstance(cached, list) else []

    url = f"{WORKSHOP_URL}/{mod_id}/scenarios"
    html = await _fetch_html(url)
    if html is None:
        logger.debug("No scenarios page found for mod %s", mod_id)
        await _set_cached(cache_key, [])
        return []

    scenario_ids: List[str] = []

    # Strategy 1: __NEXT_DATA__ JSON
    next_data = _extract_next_data(html)
    if next_data:
        try:
            scenario_ids = _parse_scenario_ids_from_json(next_data)
        except Exception as exc:
            logger.debug("Failed to parse scenario JSON for mod %s: %s", mod_id, exc)

    # Strategy 2: HTML fallback
    if not scenario_ids:
        try:
            soup = BeautifulSoup(html, "lxml")
            scenario_ids = _parse_scenario_ids_from_html(soup)
        except Exception as exc:
            logger.debug("Failed to parse scenario HTML for mod %s: %s", mod_id, exc)

    logger.debug("Found %d scenarios for mod %s", len(scenario_ids), mod_id)
    await _set_cached(cache_key, scenario_ids)
    return scenario_ids


# ---------------------------------------------------------------------------
# Full mod detail scraping (single page → everything)
# ---------------------------------------------------------------------------

def _parse_mod_details_from_json(data: dict) -> Optional[Dict[str, Any]]:
    """Extract comprehensive mod metadata from a detail page __NEXT_DATA__ JSON.

    The workshop detail page at /workshop/{ModID} embeds ALL mod data in the
    ``pageProps.asset`` object, including dependencies (with names), scenarios
    (with game mode & player count), version history, stats, and changelog.
    """
    page_props = data.get("props", {}).get("pageProps", {})
    asset = page_props.get("asset")
    if not asset or not isinstance(asset, dict):
        return None

    mod_id = asset.get("id", "")
    if not mod_id:
        return None

    # Author
    author_raw = asset.get("author") or asset.get("creator") or {}
    if isinstance(author_raw, dict):
        author = author_raw.get("username", "") or author_raw.get("name", "")
    else:
        author = str(author_raw)

    # Tags
    tags: List[str] = []
    for t in (asset.get("tags") or []):
        tag_name = t.get("name", "") if isinstance(t, dict) else str(t)
        if tag_name:
            tags.append(tag_name)

    # Dependencies — these contain asset.id + asset.name!
    dependencies: List[Dict[str, Any]] = []
    for dep in (asset.get("dependencies") or []):
        if not isinstance(dep, dict):
            continue
        dep_asset = dep.get("asset") or {}
        dependencies.append({
            "mod_id": dep_asset.get("id", ""),
            "name": dep_asset.get("name", ""),
            "version": dep.get("version", ""),
        })

    # Scenarios — full objects with game mode, player count, etc.
    scenarios: List[Dict[str, Any]] = []
    for sc in (asset.get("scenarios") or []):
        if not isinstance(sc, dict):
            continue
        sc_image = sc.get("image") or {}
        sc_thumb = ""
        if isinstance(sc_image, dict):
            thumbs = sc_image.get("thumbnails", {})
            for _mime, variants in (thumbs.items() if isinstance(thumbs, dict) else []):
                if isinstance(variants, list) and variants:
                    sc_thumb = variants[0].get("url", "") if isinstance(variants[0], dict) else ""
                    break
            if not sc_thumb:
                sc_thumb = sc_image.get("url", "")
        scenarios.append({
            "scenario_id": sc.get("gameId", ""),
            "name": sc.get("name", ""),
            "game_mode": sc.get("gameMode", ""),
            "player_count": sc.get("playerCount", 0),
            "description": sc.get("description", ""),
            "author": sc.get("authorName", ""),
            "thumbnail_url": sc_thumb,
        })

    # Also extract flat scenario_ids for backward compatibility
    scenario_ids = [s["scenario_id"] for s in scenarios if s.get("scenario_id")]

    # Versions
    versions: List[Dict[str, Any]] = []
    for v in (asset.get("versions") or []):
        if not isinstance(v, dict):
            continue
        versions.append({
            "version": v.get("version", ""),
            "game_version": v.get("gameVersion", ""),
            "file_size": v.get("totalFileSize", 0),
            "created_at": v.get("createdAt", ""),
            "updated_at": v.get("updatedAt", ""),
            "scenarios_count": v.get("scenariosCount", 0),
            "dependencies_count": v.get("dependenciesCount", 0),
        })

    # Changelog from assetVersionDetail
    version_detail = page_props.get("assetVersionDetail") or {}
    changelog = version_detail.get("changelog", "")

    # Downloads total
    download_info = page_props.get("getAssetDownloadTotal") or {}
    downloads = download_info.get("total", 0)

    # Thumbnail
    thumbnail_url = _thumbnail_from_asset(asset)

    return {
        "mod_id": mod_id,
        "name": asset.get("name", ""),
        "author": author,
        "summary": asset.get("summary", ""),
        "description": asset.get("description", ""),
        "version": asset.get("currentVersionNumber", ""),
        "game_version": asset.get("gameVersion", ""),
        "current_version_size": asset.get("currentVersionSize", 0),
        "license": asset.get("license", ""),
        "tags": tags,
        "thumbnail_url": thumbnail_url,
        "workshop_url": f"{WORKSHOP_BASE}/workshop/{mod_id}",

        # Stats
        "rating": asset.get("averageRating", 0),
        "rating_count": asset.get("ratingCount", 0),
        "subscribers": asset.get("subscriberCount", 0),
        "downloads": downloads,

        # Dates
        "created_at": asset.get("createdAt", ""),
        "updated_at": asset.get("updatedAt", ""),

        # Rich structured data
        "dependencies": dependencies,
        "scenarios": scenarios,
        "scenario_ids": scenario_ids,
        "versions": versions,
        "changelog": changelog,
    }


def _parse_mod_details_from_html(soup: BeautifulSoup, mod_id: str) -> Dict[str, Any]:
    """Fallback: extract mod details from rendered HTML on a mod detail page."""
    result: Dict[str, Any] = {"mod_id": mod_id}

    # Name
    h1 = soup.select_one("h1")
    result["name"] = h1.get_text(strip=True) if h1 else ""

    # Author
    author_el = soup.select_one("span.text-xl.text-primary")
    if author_el:
        txt = author_el.get_text(strip=True)
        result["author"] = txt[3:].strip() if txt.lower().startswith("by ") else txt

    # Description
    desc_el = soup.select_one("article.prose pre")
    result["description"] = desc_el.get_text(strip=True) if desc_el else ""

    # Stats from the sidebar dl
    for dt_el in soup.select("dl dt"):
        label = dt_el.get_text(strip=True).lower()
        dd_el = dt_el.find_next_sibling("dd") if dt_el else None
        if not dd_el:
            continue
        val = dd_el.get_text(strip=True)
        if label == "version":
            result["version"] = val
        elif label == "game version":
            result["game_version"] = val
        elif label == "subscribers":
            result["subscribers"] = int(val.replace(",", "")) if val else 0
        elif label == "downloads":
            result["downloads"] = int(val.replace(",", "")) if val else 0
        elif label == "rating":
            try:
                result["rating"] = float(val.replace("%", "")) / 100
            except ValueError:
                pass

    # Dependencies from sidebar links
    deps: List[Dict[str, Any]] = []
    dep_section = soup.find("h2", string=re.compile(r"Dependencies", re.I))
    if dep_section:
        for link in dep_section.find_next("div").select("a[href*='/workshop/']") if dep_section.find_next("div") else []:
            href = link.get("href", "")
            dep_name = link.get_text(strip=True)
            dep_id_match = re.search(r'/workshop/([0-9A-Fa-f]{16})', href)
            if dep_id_match:
                deps.append({
                    "mod_id": dep_id_match.group(1),
                    "name": dep_name,
                    "version": "",
                })
    result["dependencies"] = deps

    # Tags
    tags: List[str] = []
    for tag_link in soup.select("a[href*='tags=']"):
        tag_text = tag_link.get_text(strip=True)
        if tag_text:
            tags.append(tag_text)
    result["tags"] = tags

    # Thumbnail
    hero_img = soup.select_one("figure img[src*='bistudio.com']")
    result["thumbnail_url"] = hero_img.get("src", "") if hero_img else ""

    result["workshop_url"] = f"{WORKSHOP_BASE}/workshop/{mod_id}"
    return result


async def fetch_mod_details(mod_id: str) -> Optional[Dict[str, Any]]:
    """Fetch comprehensive metadata for a single mod from its workshop page.

    Extracts everything from the ``__NEXT_DATA__`` JSON: dependencies (with
    names), scenarios (with game mode & player count), version history,
    changelog, stats (subscribers, downloads, rating), dates, and more.

    Falls back to HTML scraping for basic metadata when JSON is unavailable.
    Results are cached for the standard browse TTL.
    """
    cache_key = f"mod_details:{mod_id}"
    cached = await _get_cached(cache_key)
    if cached is not None:
        return cached if isinstance(cached, dict) else None

    url = f"{WORKSHOP_URL}/{mod_id}"
    html = await _fetch_html(url)
    if html is None:
        logger.warning("Failed to fetch mod detail page for %s", mod_id)
        return None

    details: Optional[Dict[str, Any]] = None

    # Strategy 1: __NEXT_DATA__ JSON (rich data)
    next_data = _extract_next_data(html)
    if next_data:
        try:
            details = _parse_mod_details_from_json(next_data)
        except Exception as exc:
            logger.warning("Failed to parse mod detail JSON for %s: %s", mod_id, exc)

    # Strategy 2: HTML fallback (basic data)
    if not details:
        try:
            soup = BeautifulSoup(html, "lxml")
            details = _parse_mod_details_from_html(soup, mod_id)
        except Exception as exc:
            logger.warning("Failed to parse mod detail HTML for %s: %s", mod_id, exc)

    if details:
        logger.debug(
            "Fetched mod details for %s: %s (deps=%d, scenarios=%d, versions=%d)",
            mod_id,
            details.get("name", ""),
            len(details.get("dependencies", [])),
            len(details.get("scenarios", [])),
            len(details.get("versions", [])),
        )
        await _set_cached(cache_key, details)

    return details
