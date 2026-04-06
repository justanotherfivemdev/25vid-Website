"""
Workshop Metadata Ingestion Service.

Fetches Arma Reforger mod metadata from the Workshop and populates
the ``workshop_mods`` collection.  Follows the same cache-first / TTL /
upsert pattern used by ``worldmonitor_ingest.py``.
"""

import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional, Any

from database import db

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache helpers  (mirror worldmonitor_ingest pattern)
# ---------------------------------------------------------------------------
_CACHE_COLLECTION = "workshop_cache"
_CACHE_TTL_MINUTES = 24 * 60  # 24 hours

WORKSHOP_BASE_URL = "https://reforger.armaplatform.com/workshop"


async def _ws_get_cached(key: str, ttl_minutes: int = _CACHE_TTL_MINUTES) -> Optional[dict]:
    """Return cached data for *key* if it exists and has not expired."""
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


async def _ws_set_cached(key: str, data: Any) -> None:
    """Store *data* under *key* with a UTC timestamp."""
    await db[_CACHE_COLLECTION].update_one(
        {"key": key},
        {"$set": {
            "key": key,
            "cached_at": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }},
        upsert=True,
    )


# ---------------------------------------------------------------------------
# Metadata extraction helpers
# ---------------------------------------------------------------------------

def _normalize_metadata(raw: dict, mod_id: str) -> dict:
    """Turn a raw API/scrape response into a normalised mod document."""
    return {
        "mod_id": mod_id,
        "name": raw.get("name", ""),
        "author": raw.get("author", ""),
        "version": raw.get("version", ""),
        "summary": raw.get("summary", ""),
        "description": raw.get("description", ""),
        "license": raw.get("license", ""),
        "tags": raw.get("tags", []),
        "dependencies": raw.get("dependencies", []),
        "scenario_ids": raw.get("scenario_ids") or raw.get("scenarioIds", []),
        "scenarios": raw.get("scenarios", []),
        "versions": raw.get("versions", []),
        "changelog": raw.get("changelog", ""),
        "thumbnail_url": raw.get("thumbnail_url") or raw.get("thumbnailUrl", ""),
        "workshop_url": raw.get("workshop_url", "") or f"{WORKSHOP_BASE_URL}/{mod_id}",
        "game_version": raw.get("game_version", ""),
        "current_version_size": raw.get("current_version_size", 0),
        "rating": raw.get("rating", 0),
        "rating_count": raw.get("rating_count", 0),
        "subscribers": raw.get("subscribers", 0),
        "downloads": raw.get("downloads", 0),
        "created_at": raw.get("created_at", ""),
        "updated_at": raw.get("updated_at", ""),
        "metadata_source": "workshop",
        "metadata_completeness": "full",
        "metadata_locked": False,
        "last_fetched": datetime.now(timezone.utc).isoformat(),
    }


def _partial_record(mod_id: str) -> dict:
    """Return a minimal record when metadata could not be auto-fetched."""
    return {
        "mod_id": mod_id,
        "name": "",
        "author": "",
        "version": "",
        "summary": "",
        "description": "",
        "license": "",
        "tags": [],
        "dependencies": [],
        "scenario_ids": [],
        "scenarios": [],
        "versions": [],
        "changelog": "",
        "thumbnail_url": "",
        "workshop_url": f"{WORKSHOP_BASE_URL}/{mod_id}",
        "game_version": "",
        "current_version_size": 0,
        "rating": 0,
        "rating_count": 0,
        "subscribers": 0,
        "downloads": 0,
        "created_at": "",
        "updated_at": "",
        "metadata_source": "workshop",
        "metadata_completeness": "minimal",
        "metadata_incomplete": True,
        "metadata_locked": False,
        "last_fetched": datetime.now(timezone.utc).isoformat(),
    }


async def _fetch_from_workshop(mod_id: str) -> dict:
    """Fetch mod metadata by scraping the detail page's __NEXT_DATA__ JSON.

    The Arma Reforger Workshop detail page embeds comprehensive mod data
    (dependencies with names, scenarios, version history, stats, changelog)
    in a ``<script id="__NEXT_DATA__">`` JSON blob.  This is far richer than
    any JSON API endpoint.

    Falls back to a partial record when the page is unreachable.
    """
    try:
        from services.workshop_proxy import fetch_mod_details
        details = await fetch_mod_details(mod_id)
        if details:
            return _normalize_metadata(details, mod_id)
    except Exception as exc:
        logger.debug("Workshop detail fetch for %s failed: %s", mod_id, exc)

    logger.info("Returning partial record for mod %s (metadata unavailable)", mod_id)
    return _partial_record(mod_id)


# ---------------------------------------------------------------------------
# Primary public function
# ---------------------------------------------------------------------------

async def fetch_mod_metadata(mod_id: str) -> Optional[dict]:
    """Fetch mod metadata with cache-first strategy and upsert into DB.

    1. Check the ``workshop_cache`` collection (24-hour TTL).
    2. On cache miss, fetch from the Arma Reforger Workshop.
    3. Cache the result and upsert into ``workshop_mods``.
    """
    cache_key = f"mod:{mod_id}"

    cached = await _ws_get_cached(cache_key)
    if cached:
        return cached

    metadata = await _fetch_from_workshop(mod_id)
    if metadata is None:
        return None

    # Cache the result
    await _ws_set_cached(cache_key, metadata)

    # Upsert into the canonical workshop_mods collection
    # Preserve manual_overrides and metadata_locked flag
    existing = await db.workshop_mods.find_one({"mod_id": mod_id}, {"_id": 0})
    if existing and existing.get("metadata_locked"):
        # Don't overwrite locked (manually curated) records;
        # return the stored doc so callers see canonical data
        return existing

    update_doc = {**metadata}
    if existing and existing.get("manual_overrides"):
        # Merge: keep manual_overrides, apply them on top
        update_doc["manual_overrides"] = existing["manual_overrides"]
        for field, val in existing["manual_overrides"].items():
            if val is not None:  # Apply manual overrides, allowing falsy values
                update_doc[field] = val
        update_doc["metadata_source"] = "hybrid"

    await db.workshop_mods.update_one(
        {"mod_id": mod_id},
        {"$set": update_doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    return metadata


# ---------------------------------------------------------------------------
# Convenience wrapper (used by API endpoints)
# ---------------------------------------------------------------------------

async def fetch_and_store_mod(mod_id: str) -> Optional[dict]:
    """On-demand fetch + store.  Returns the stored document."""
    await fetch_mod_metadata(mod_id)
    doc = await db.workshop_mods.find_one({"mod_id": mod_id}, {"_id": 0})
    return doc


# ---------------------------------------------------------------------------
# Background refresh loop
# ---------------------------------------------------------------------------
_RATE_LIMIT_DELAY = 6  # seconds between fetches (≈10 per minute)


async def workshop_refresh_loop(interval_hours: int = 24) -> None:
    """Periodically re-fetch metadata for all non-manual workshop mods.

    Prioritizes mods used by active servers and retries incomplete records.
    Follows the same ``asyncio`` while-loop / ``CancelledError`` pattern as
    ``_valyu_background_ingestion`` in ``server.py``.
    """
    logger.info("Workshop refresh loop started (interval=%dh)", interval_hours)
    while True:
        try:
            stale_threshold = (
                datetime.now(timezone.utc) - timedelta(hours=interval_hours)
            ).isoformat()

            # Prioritize: collect mod IDs from active/running servers first
            priority_mod_ids = set()
            active_servers = db.managed_servers.find(
                {"status": {"$in": ["running", "starting"]}},
                {"mods": 1, "_id": 0},
            )
            async for srv in active_servers:
                for mod in srv.get("mods", []):
                    mid = mod.get("mod_id") or mod.get("modId")
                    if mid:
                        priority_mod_ids.add(mid)

            # First pass: refresh priority mods that are stale or incomplete
            refreshed = 0
            for mod_id in priority_mod_ids:
                existing = await db.workshop_mods.find_one({"mod_id": mod_id}, {"_id": 0})
                if existing and existing.get("metadata_locked"):
                    continue
                needs_refresh = (
                    not existing
                    or existing.get("metadata_incomplete")
                    or existing.get("metadata_completeness") == "minimal"
                    or (existing.get("last_fetched", "") < stale_threshold)
                )
                if needs_refresh:
                    try:
                        await fetch_mod_metadata(mod_id)
                        refreshed += 1
                    except Exception as exc:
                        logger.warning("Failed to refresh priority mod %s: %s", mod_id, exc)
                    await asyncio.sleep(_RATE_LIMIT_DELAY)

            # Second pass: refresh other stale mods
            cursor = db.workshop_mods.find(
                {
                    "metadata_source": {"$ne": "manual"},
                    "metadata_locked": {"$ne": True},
                    "$or": [
                        {"last_fetched": {"$lt": stale_threshold}},
                        {"last_fetched": {"$exists": False}},
                        {"metadata_incomplete": True},
                    ],
                },
                {"mod_id": 1, "_id": 0},
            )

            async for doc in cursor:
                mod_id = doc.get("mod_id")
                if not mod_id or mod_id in priority_mod_ids:
                    continue
                try:
                    await fetch_mod_metadata(mod_id)
                    refreshed += 1
                except Exception as exc:
                    logger.warning("Failed to refresh mod %s: %s", mod_id, exc)
                # Rate-limit: ~10 fetches per minute
                await asyncio.sleep(_RATE_LIMIT_DELAY)

            if refreshed:
                logger.info("Workshop refresh: updated %d mods", refreshed)

            await asyncio.sleep(interval_hours * 3600)
        except asyncio.CancelledError:
            logger.info("Workshop refresh loop cancelled – shutting down")
            break
        except Exception as exc:
            logger.error("Workshop refresh loop error: %s", exc)
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break
