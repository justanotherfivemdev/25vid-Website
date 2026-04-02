"""
Workshop Proxy Service.

Fetches live mod listings from the Arma Reforger Workshop by scraping
``reforger.armaplatform.com/workshop``.  No undocumented JSON API is
assumed — every response is parsed from the rendered HTML.

The proxy adds:
 * browser-like request headers
 * per-page result caching (short TTL to stay responsive but polite)
 * rate-limiting (token-bucket)
 * structured logging of every outbound request
"""

import asyncio
import logging
import re
import time
from datetime import datetime, timezone
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
VALID_SORTS = {"popularity", "newest", "updated", "name"}

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
        cached_at = doc.get("cached_at", 0)
        if (time.time() - cached_at) < _BROWSE_CACHE_TTL:
            return doc.get("data")
    return None


async def _set_cached(key: str, data: Any) -> None:
    await db[_PROXY_CACHE].update_one(
        {"key": key},
        {"$set": {"key": key, "cached_at": time.time(), "data": data}},
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
def _parse_mod_list(html: str) -> Tuple[List[Dict], int]:
    """Parse the workshop listing page and return (mods, total_results)."""
    soup = BeautifulSoup(html, "lxml")
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

    # Collect mod data from the grid cards.
    # Each card is an <a> with class "group" inside the grid.
    cards = soup.select("div.grid a.group[href]")
    names = [el.get_text(strip=True) for el in soup.select("div.grid h2.break-words")]
    authors_raw = soup.select("div.grid span.mt-1")
    authors = []
    for el in authors_raw:
        txt = el.get_text(strip=True)
        # Author text starts with "by " — strip it
        authors.append(txt[3:] if txt.lower().startswith("by ") else txt)

    # Images — from aspect-h-9 containers, find img tags
    image_els = soup.select("div.grid div.aspect-h-9 img")
    images: List[str] = []
    for img in image_els:
        src = img.get("src") or img.get("srcset", "").split(",")[0].split(" ")[0]
        if src:
            if src.startswith("/"):
                src = f"{WORKSHOP_BASE}{src}"
            images.append(src)
        else:
            images.append("")

    # If aspect-h-9 img selector doesn't match, try broader approach
    if not images:
        for card in cards:
            img = card.select_one("img")
            if img:
                src = img.get("src") or img.get("srcset", "").split(",")[0].split(" ")[0]
                if src and src.startswith("/"):
                    src = f"{WORKSHOP_BASE}{src}"
                images.append(src or "")
            else:
                images.append("")

    # Sizes and ratings from span.ml-1
    span_ml1 = soup.select("div.grid span.ml-1")
    sizes: List[str] = []
    ratings: List[str] = []
    for el in span_ml1:
        txt = el.get_text(strip=True)
        if "%" in txt:
            ratings.append(txt)
        else:
            sizes.append(txt)

    for i, card in enumerate(cards):
        href = card.get("href", "")
        # Extract mod_id from URL like /workshop/5965550F0AA2C145-ModName
        mod_id = ""
        parts = href.strip("/").split("/")
        if len(parts) >= 2:
            slug = parts[-1]
            mod_id = slug.split("-")[0]

        mod_url = f"{WORKSHOP_BASE}{href}" if href.startswith("/") else href

        mods.append({
            "mod_id": mod_id,
            "name": names[i] if i < len(names) else "",
            "author": authors[i] if i < len(authors) else "",
            "thumbnail_url": images[i] if i < len(images) else "",
            "size": sizes[i] if i < len(sizes) else "",
            "rating": ratings[i] if i < len(ratings) else "",
            "workshop_url": mod_url,
        })

    return mods, total_results


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
      popular  → popularity
      newest   → newest
      updated  → updated
      name     → name
    """
    sort_map = {
        "popular": "popularity",
        "newest": "newest",
        "updated": "updated",
        "name": "name",
    }
    sort_value = sort_map.get(category, "popularity")

    cache_key = f"browse:{sort_value}:{page}:{','.join(tags or [])}"
    cached = await _get_cached(cache_key)
    if cached:
        logger.debug("Workshop proxy cache hit: %s", cache_key)
        return cached

    url = f"{WORKSHOP_URL}?page={page}&sort={sort_value}"
    if tags:
        for tag in tags:
            url += f"&tags={quote_plus(tag.upper())}"

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
) -> Dict[str, Any]:
    """Search the workshop by keyword with pagination."""
    sort_value = sort if sort in VALID_SORTS else "popularity"

    cache_key = f"search:{query}:{sort_value}:{page}"
    cached = await _get_cached(cache_key)
    if cached:
        logger.debug("Workshop proxy cache hit: %s", cache_key)
        return cached

    encoded_q = quote_plus(query)
    url = f"{WORKSHOP_URL}?page={page}&search={encoded_q}&sort={sort_value}"

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
