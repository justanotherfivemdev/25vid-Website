"""Real-time log monitoring service.

Collects console logs from managed Arma Reforger servers (via Docker container
logs), parses mod-related errors using pattern matching, and stores structured
occurrence records in MongoDB for dashboard querying and alerting.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from database import db

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Error detection patterns
# ---------------------------------------------------------------------------
# Each pattern is a tuple of (compiled_regex, severity, category_label).
# Order matters: first match wins.  More specific patterns should come first.

ERROR_PATTERNS: list[dict] = [
    {
        "regex": re.compile(
            r"BACKEND\s*\(E\)",
            re.IGNORECASE,
        ),
        "severity": "critical",
        "category": "backend-error",
        "label": "Backend Engine Error",
    },
    {
        "regex": re.compile(
            r"ADDON_LOAD_ERROR|addon\s+load\s+error|failed\s+to\s+load\s+addon",
            re.IGNORECASE,
        ),
        "severity": "high",
        "category": "addon-load",
        "label": "Addon Load Failure",
    },
    {
        "regex": re.compile(
            r"Fragmentizer:\s*",
            re.IGNORECASE,
        ),
        "severity": "high",
        "category": "fragmentizer",
        "label": "Fragmentizer Error",
    },
    {
        "regex": re.compile(
            r"SCRIPT\s*\(E\)|script\s+exception|ScriptModule.*error",
            re.IGNORECASE,
        ),
        "severity": "high",
        "category": "script-error",
        "label": "Script Error",
    },
    {
        "regex": re.compile(
            r"RESOURCE\s*\(E\)|resource\s+manager\s+error|ResourceManager.*fail",
            re.IGNORECASE,
        ),
        "severity": "medium",
        "category": "resource-error",
        "label": "Resource Error",
    },
    {
        "regex": re.compile(
            r"NETWORK\s*\(E\)|network\s+error|socket\s+error|connection\s+refused",
            re.IGNORECASE,
        ),
        "severity": "medium",
        "category": "network-error",
        "label": "Network Error",
    },
    {
        "regex": re.compile(
            r"WORLD\s*\(E\)|world\s+error|terrain\s+load\s+failed",
            re.IGNORECASE,
        ),
        "severity": "medium",
        "category": "world-error",
        "label": "World/Terrain Error",
    },
    {
        "regex": re.compile(
            r"NULL\s+POINTER|null\s+reference|NullReferenceException|access\s+violation",
            re.IGNORECASE,
        ),
        "severity": "high",
        "category": "null-reference",
        "label": "Null Reference",
    },
    {
        "regex": re.compile(
            r"CRASH|segfault|SIGSEGV|SIGABRT|unhandled\s+exception",
            re.IGNORECASE,
        ),
        "severity": "critical",
        "category": "crash",
        "label": "Crash / Fatal",
    },
    {
        "regex": re.compile(
            r"mod\s+mismatch|version\s+mismatch|incompatible\s+mod",
            re.IGNORECASE,
        ),
        "severity": "medium",
        "category": "mod-mismatch",
        "label": "Mod Version Mismatch",
    },
    {
        "regex": re.compile(
            r"CONFIG\s*\(E\)|config\s+error|invalid\s+config|schema\s+validation",
            re.IGNORECASE,
        ),
        "severity": "medium",
        "category": "config-error",
        "label": "Configuration Error",
    },
    {
        "regex": re.compile(
            r"PHYSICS\s*\(E\)|physics\s+error|PhysX.*error",
            re.IGNORECASE,
        ),
        "severity": "low",
        "category": "physics-error",
        "label": "Physics Error",
    },
    {
        "regex": re.compile(
            r"AI\s*\(E\)|ai\s+error|pathfinding.*fail",
            re.IGNORECASE,
        ),
        "severity": "low",
        "category": "ai-error",
        "label": "AI Error",
    },
    {
        "regex": re.compile(
            r"\bERROR\b|\bFATAL\b|\bSEVERE\b",
            re.IGNORECASE,
        ),
        "severity": "low",
        "category": "generic-error",
        "label": "Generic Error",
    },
]

# Regex to extract Arma-style timestamps (e.g. "2024-01-15 12:34:56.789")
_TIMESTAMP_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+"
)

# Regex to extract mod GUIDs (16-character hex or longer hashes)
_MOD_GUID_RE = re.compile(r"\b([0-9A-Fa-f]{16,})\b")

# Normalisation patterns – strip variable data to produce stable fingerprints
_NORM_TIMESTAMP_RE = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*")
_NORM_HEX_RE = re.compile(r"0x[0-9A-Fa-f]+")
_NORM_NUMBERS_RE = re.compile(r"\b\d+\b")
_NORM_PATH_RE = re.compile(r"[A-Za-z]:\\[^\s]+|/[^\s]+\.[a-zA-Z]{1,5}")
_NORM_GUID_RE = re.compile(r"\b[0-9A-Fa-f]{16,}\b")
_NORM_WHITESPACE_RE = re.compile(r"\s+")


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def normalise_message(message: str) -> str:
    """Remove variable parts (timestamps, paths, GUIDs, numbers) from a log message."""
    text = _NORM_TIMESTAMP_RE.sub("", message)
    text = _NORM_PATH_RE.sub("<PATH>", text)
    text = _NORM_GUID_RE.sub("<GUID>", text)
    text = _NORM_HEX_RE.sub("<HEX>", text)
    text = _NORM_NUMBERS_RE.sub("<N>", text)
    text = _NORM_WHITESPACE_RE.sub(" ", text).strip().lower()
    return text


def compute_fingerprint(normalised: str) -> str:
    """Compute an MD5 hex digest fingerprint for a normalised message."""
    return hashlib.md5(normalised.encode("utf-8", errors="replace")).hexdigest()


def parse_log_line(line: str) -> Optional[Dict[str, Any]]:
    """Parse a raw log line and return structured data if it matches an error pattern.

    Returns ``None`` for non-error lines.
    """
    stripped = line.strip()
    if not stripped:
        return None

    # Try to extract a leading timestamp
    timestamp_str: Optional[str] = None
    body = stripped
    ts_match = _TIMESTAMP_RE.match(stripped)
    if ts_match:
        timestamp_str = ts_match.group(1)
        body = stripped[ts_match.end():]

    # Match against error patterns
    matched_pattern: Optional[dict] = None
    for pattern in ERROR_PATTERNS:
        if pattern["regex"].search(body):
            matched_pattern = pattern
            break

    if matched_pattern is None:
        return None

    # Extract mod GUID (first hex string ≥ 16 chars in the body)
    mod_guid: Optional[str] = None
    guid_match = _MOD_GUID_RE.search(body)
    if guid_match:
        mod_guid = guid_match.group(1).upper()

    # Build normalised message and fingerprint
    normalised = normalise_message(body)
    fingerprint = compute_fingerprint(normalised)

    return {
        "timestamp_str": timestamp_str,
        "severity": matched_pattern["severity"],
        "category": matched_pattern["category"],
        "label": matched_pattern["label"],
        "mod_guid": mod_guid,
        "message": body[:1000],
        "normalised": normalised[:500],
        "fingerprint": fingerprint,
        "raw": stripped[:2000],
    }


# ---------------------------------------------------------------------------
# Database persistence
# ---------------------------------------------------------------------------

async def ensure_error_type(parsed: dict) -> str:
    """Look up or create an error_types document for the given fingerprint.

    Returns the error_type ``id``.
    """
    fingerprint = parsed["fingerprint"]
    existing = await db.log_error_types.find_one(
        {"fingerprint": fingerprint}, {"_id": 0, "id": 1}
    )
    if existing:
        # Bump the last-seen timestamp and occurrence counter
        await db.log_error_types.update_one(
            {"fingerprint": fingerprint},
            {
                "$set": {"last_seen": datetime.now(timezone.utc)},
                "$inc": {"total_occurrences": 1},
            },
        )
        return existing["id"]

    error_type_id = f"et_{uuid.uuid4().hex[:12]}"
    await db.log_error_types.insert_one(
        {
            "id": error_type_id,
            "fingerprint": fingerprint,
            "category": parsed["category"],
            "label": parsed["label"],
            "severity": parsed["severity"],
            "normalised_message": parsed["normalised"],
            "example_raw": parsed["raw"],
            "total_occurrences": 1,
            "first_seen": datetime.now(timezone.utc),
            "last_seen": datetime.now(timezone.utc),
        }
    )
    return error_type_id


async def ensure_mod(mod_guid: str, mod_name: Optional[str] = None) -> None:
    """Insert a new mod record if the GUID hasn't been seen before."""
    if not mod_guid:
        return
    existing = await db.log_mods.find_one({"guid": mod_guid}, {"_id": 0, "guid": 1})
    if existing:
        return
    await db.log_mods.update_one(
        {"guid": mod_guid},
        {
            "$setOnInsert": {
                "id": f"lm_{uuid.uuid4().hex[:12]}",
                "guid": mod_guid,
                "name": mod_name or "",
                "version": "",
                "first_seen": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )


async def store_occurrence(
    server_id: str,
    parsed: dict,
    error_type_id: str,
) -> str:
    """Create an occurrence record linking server, mod, and error_type."""
    occ_id = f"occ_{uuid.uuid4().hex[:12]}"

    ts = datetime.now(timezone.utc)
    if parsed.get("timestamp_str"):
        try:
            ts_raw = parsed["timestamp_str"].replace("Z", "+00:00")
            ts = datetime.fromisoformat(ts_raw)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass

    await db.log_occurrences.insert_one(
        {
            "id": occ_id,
            "server_id": server_id,
            "mod_guid": parsed.get("mod_guid") or "",
            "error_type_id": error_type_id,
            "severity": parsed["severity"],
            "category": parsed["category"],
            "message": parsed["message"],
            "raw": parsed["raw"],
            "timestamp": ts,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return occ_id


async def ingest_log_line(server_id: str, raw_line: str) -> Optional[str]:
    """Full pipeline: parse → ensure types/mods → store occurrence.

    Returns the occurrence id if the line was an error, else ``None``.
    """
    parsed = parse_log_line(raw_line)
    if parsed is None:
        return None

    error_type_id = await ensure_error_type(parsed)

    if parsed.get("mod_guid"):
        await ensure_mod(parsed["mod_guid"])

    occ_id = await store_occurrence(server_id, parsed, error_type_id)

    # Fire-and-forget alerting check
    try:
        await _check_alert(server_id, parsed, error_type_id)
    except Exception:
        logger.debug("Alert check failed", exc_info=True)

    return occ_id


# ---------------------------------------------------------------------------
# Alerting
# ---------------------------------------------------------------------------

# In-memory rate tracking: error_type_id → list of recent timestamps
_rate_windows: Dict[str, list] = {}
_RATE_WINDOW_SECONDS = 300  # 5-minute window
_RATE_THRESHOLD = 20        # alert when >20 errors of same type in 5 min


async def _check_alert(
    server_id: str,
    parsed: dict,
    error_type_id: str,
) -> None:
    """Check if an alert should be fired (new error type or rate spike)."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=_RATE_WINDOW_SECONDS)

    # Track rate
    timestamps = _rate_windows.setdefault(error_type_id, [])
    timestamps.append(now)
    # Prune old entries
    _rate_windows[error_type_id] = [t for t in timestamps if t > cutoff]

    should_alert = False
    alert_reason = ""

    # Check: first time this error type was seen
    et = await db.log_error_types.find_one(
        {"id": error_type_id}, {"_id": 0, "total_occurrences": 1}
    )
    if et and et.get("total_occurrences", 0) <= 1:
        should_alert = True
        alert_reason = "New error type detected"

    # Check: rate spike
    if len(_rate_windows.get(error_type_id, [])) >= _RATE_THRESHOLD:
        should_alert = True
        alert_reason = f"Rate spike: {len(_rate_windows[error_type_id])} occurrences in {_RATE_WINDOW_SECONDS}s"

    if not should_alert:
        return

    # Store alert in DB for dashboard visibility
    alert_id = f"la_{uuid.uuid4().hex[:12]}"
    await db.log_alerts.update_one(
        {"error_type_id": error_type_id, "server_id": server_id, "resolved": False},
        {
            "$setOnInsert": {
                "id": alert_id,
                "created_at": now,
            },
            "$set": {
                "error_type_id": error_type_id,
                "server_id": server_id,
                "severity": parsed["severity"],
                "category": parsed["category"],
                "reason": alert_reason,
                "message_snippet": parsed["message"][:300],
                "last_triggered": now,
                "resolved": False,
            },
            "$inc": {"trigger_count": 1},
        },
        upsert=True,
    )
    logger.warning(
        "Log alert [%s] on server %s: %s — %s",
        parsed["severity"],
        server_id,
        alert_reason,
        parsed["message"][:120],
    )


# ---------------------------------------------------------------------------
# Background log collector
# ---------------------------------------------------------------------------

async def _collect_server_logs(server: dict) -> int:
    """Tail recent Docker container logs for a server and ingest new lines.

    Returns the number of error occurrences created.
    """
    from services.docker_agent import DockerAgent

    docker = DockerAgent()
    server_id = server["id"]
    container_name = server.get("container_name")
    if not container_name:
        return 0

    try:
        # Get recent logs (last 60 seconds worth)
        logs = await docker.get_container_logs(container_name, tail=200)
    except Exception as exc:
        logger.debug("Could not fetch logs for %s: %s", container_name, exc)
        return 0

    if not logs:
        return 0

    count = 0
    for line in logs.splitlines():
        occ_id = await ingest_log_line(server_id, line)
        if occ_id:
            count += 1
    return count


async def log_monitor_loop(interval: int = 30) -> None:
    """Background loop that periodically collects and parses server logs."""
    logger.info("Log monitor loop started (interval=%ss)", interval)
    while True:
        try:
            servers = await db.managed_servers.find(
                {"status": {"$in": ["running", "starting"]}},
                {"_id": 0, "id": 1, "container_name": 1, "name": 1},
            ).to_list(500)
            for server in servers:
                try:
                    await _collect_server_logs(server)
                except Exception as exc:
                    logger.debug(
                        "Log collection failed for %s: %s",
                        server.get("name", server.get("id")),
                        exc,
                    )
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Log monitor loop error: %s", exc)
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
