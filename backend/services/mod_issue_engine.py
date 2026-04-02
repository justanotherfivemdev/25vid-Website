"""Log-parsing and mod-issue attribution engine.

Scans Arma Reforger container logs for known error patterns, attributes
them to specific mods with confidence scores, and persists ``ModIssue``
documents for the Server Management Portal.
"""

import re
import hashlib
import logging
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple

from database import db
from services.docker_agent import DockerAgent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1. Error patterns common in Arma Reforger server logs
# ---------------------------------------------------------------------------

ERROR_PATTERNS: List[Dict] = [
    {
        "regex": re.compile(
            r"SCRIPT\s+(?:ERROR|EXCEPTION).*?(?:mod|addon)[/\\](\S+)",
            re.IGNORECASE,
        ),
        "error_type": "script_compilation",
        "severity": "high",
        "description": "Script compilation error referencing a mod path",
    },
    {
        "regex": re.compile(
            r"(?:Failed to load|Cannot find|Missing)\s+asset\s+['\"]?(\S+)['\"]?",
            re.IGNORECASE,
        ),
        "error_type": "asset_loading_failure",
        "severity": "medium",
        "description": "Asset loading failure for a resource file",
    },
    {
        "regex": re.compile(
            r"Null\s*(?:Reference|Pointer)\s*(?:Exception|Error)",
            re.IGNORECASE,
        ),
        "error_type": "null_reference",
        "severity": "high",
        "description": "Null reference or pointer exception at runtime",
    },
    {
        "regex": re.compile(
            r"(?:Out\s+of\s+memory|Memory\s+allocation\s+failed|FPS\s+drop|"
            r"Performance\s+warning|frame\s+time\s+exceeded)",
            re.IGNORECASE,
        ),
        "error_type": "memory_performance",
        "severity": "medium",
        "description": "Memory exhaustion or performance degradation warning",
    },
    {
        "regex": re.compile(
            r"(?:CRASH|FATAL|Segmentation\s+fault|Unhandled\s+exception|"
            r"Stack\s+trace|Access\s+violation)",
            re.IGNORECASE,
        ),
        "error_type": "crash_stack_trace",
        "severity": "critical",
        "description": "Application crash or fatal unhandled exception",
    },
]

# Singleton DockerAgent reused across calls
_docker_agent = DockerAgent()

# ---------------------------------------------------------------------------
# 2. Log parser
# ---------------------------------------------------------------------------


def parse_logs(log_text: str) -> List[Dict]:
    """Split *log_text* into lines and match against ``ERROR_PATTERNS``.

    Returns a list of dicts, each containing:
    ``error_type``, ``mod_reference``, ``log_line``, ``severity``.
    """
    events: List[Dict] = []
    for line in log_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        for pattern in ERROR_PATTERNS:
            match = pattern["regex"].search(stripped)
            if match:
                mod_reference = match.group(1) if match.lastindex else None
                events.append(
                    {
                        "error_type": pattern["error_type"],
                        "mod_reference": mod_reference,
                        "log_line": stripped,
                        "severity": pattern["severity"],
                    }
                )
                break  # first matching pattern wins for this line
    return events


# ---------------------------------------------------------------------------
# 3. Mod-reference extraction
# ---------------------------------------------------------------------------


def extract_mod_reference(
    error_line: str,
    server_mods: List[Dict],
) -> Tuple[Optional[str], Optional[str], float]:
    """Try to attribute *error_line* to one of the *server_mods*.

    Each element of *server_mods* should carry at least ``mod_id`` and
    ``name`` keys.

    Returns ``(mod_id, mod_name, confidence_score)``:
    * **0.9** — exact mod name found in the line (case-insensitive).
    * **0.7** — a significant substring (≥ 4 chars) of a mod name found.
    * **0.0** — no match.
    """
    line_lower = error_line.lower()

    # Pass 1 — direct (full) name match
    for mod in server_mods:
        mod_name = mod.get("name", "")
        mod_id = mod.get("mod_id", "")
        if mod_name and mod_name.lower() in line_lower:
            return mod_id, mod_name, 0.9
        if mod_id and mod_id.lower() in line_lower:
            return mod_id, mod_name, 0.9

    # Pass 2 — partial / substring match (tokens ≥ 4 chars)
    for mod in server_mods:
        mod_name = mod.get("name", "")
        for token in mod_name.split():
            if len(token) >= 4 and token.lower() in line_lower:
                return mod.get("mod_id", ""), mod_name, 0.7

    return None, None, 0.0


# ---------------------------------------------------------------------------
# 4. Error signature (deduplication hash)
# ---------------------------------------------------------------------------

_STRIP_RE = re.compile(
    r"""
      \d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?  # ISO-ish timestamps
    | 0x[0-9A-Fa-f]+                                      # memory addresses
    | (?<!\w)\d+(?!\w)                                     # standalone numbers
    """,
    re.VERBOSE,
)


def compute_error_signature(error_pattern: str) -> str:
    """Normalise *error_pattern* and return a stable SHA-256 hex digest."""
    normalised = _STRIP_RE.sub("", error_pattern).strip()
    normalised = re.sub(r"\s+", " ", normalised)
    return hashlib.sha256(normalised.encode()).hexdigest()


# ---------------------------------------------------------------------------
# 5. Analyse logs for a single server
# ---------------------------------------------------------------------------


async def analyze_server_logs(
    server_id: str,
    container_name: str,
    server_mods: List[Dict],
) -> List[Dict]:
    """Fetch recent logs for *container_name*, attribute errors to mods, and
    upsert ``ModIssue`` documents.

    Returns the list of new / updated issue dicts.
    """
    log_text = await _docker_agent.get_container_logs(container_name, tail=500)
    if not log_text:
        return []

    events = parse_logs(log_text)
    if not events:
        return []

    now = datetime.now(timezone.utc)
    issues: List[Dict] = []

    for event in events:
        mod_id, mod_name, confidence = extract_mod_reference(
            event["log_line"], server_mods
        )
        if mod_id is None:
            # Use the raw mod_reference extracted from the regex, if any
            mod_id = event.get("mod_reference") or "unknown"
            mod_name = mod_name or mod_id
            confidence = max(confidence, 0.5) if event.get("mod_reference") else 0.0

        signature = compute_error_signature(event["log_line"])
        now_iso = now.isoformat()

        evidence_entry = {
            "log_excerpt": event["log_line"][:500],
            "timestamp": now_iso,
            "error_type": event["error_type"],
            "severity": event["severity"],
        }

        affected_entry = {"server_id": server_id, "last_seen": now_iso}

        result = await db.mod_issues.update_one(
            {"error_signature": signature},
            {
                "$set": {
                    "mod_id": mod_id,
                    "mod_name": mod_name or "Unknown",
                    "error_pattern": event["error_type"],
                    "confidence_score": confidence,
                    "attribution_method": "automated",
                    "last_seen": now_iso,
                    "status": "active",
                },
                "$setOnInsert": {
                    "id": f"mi_{uuid.uuid4().hex[:12]}",
                    "error_signature": signature,
                    "first_seen": now_iso,
                    "recommended_actions": [],
                    "evidence": [],
                    "affected_servers": [],
                },
                "$inc": {"occurrence_count": 1},
                "$push": {
                    "evidence": {"$each": [evidence_entry], "$slice": -50},
                },
                "$addToSet": {"affected_servers": affected_entry},
            },
            upsert=True,
        )

        issue_doc = await db.mod_issues.find_one(
            {"error_signature": signature}, {"_id": 0}
        )
        if issue_doc:
            issues.append(issue_doc)

    return issues


# ---------------------------------------------------------------------------
# 6. Background analysis loop
# ---------------------------------------------------------------------------


async def mod_issue_analysis_loop(interval: int = 60) -> None:
    """Continuously scan running servers for mod-related errors.

    Follows the same ``asyncio`` while-loop / ``CancelledError`` pattern as
    ``server_health_loop`` in ``server_health_monitor.py``.
    """
    logger.info("Mod-issue analysis loop started (interval=%ds)", interval)

    while True:
        try:
            cursor = db.managed_servers.find(
                {"status": "running"},
                {"_id": 0},
            )
            servers = await cursor.to_list(500)

            for server in servers:
                server_id = server.get("id", "")
                server_name = server.get("name", server_id)
                container_name = server.get("container_name", server_name)
                server_mods = server.get("mods", [])

                try:
                    issues = await analyze_server_logs(
                        server_id, container_name, server_mods
                    )

                    # Create a ServerIncident for every *critical* error
                    for issue in issues:
                        has_critical = any(
                            e.get("severity") == "critical"
                            for e in issue.get("evidence", [])
                        )
                        if has_critical:
                            incident = {
                                "id": f"inc_{uuid.uuid4().hex[:12]}",
                                "server_id": server_id,
                                "incident_type": "mod_error",
                                "severity": "critical",
                                "title": (
                                    f"Critical mod error — "
                                    f"{issue.get('mod_name', 'Unknown')}"
                                ),
                                "description": (
                                    f"Automated detection: critical error "
                                    f"attributed to mod "
                                    f"{issue.get('mod_name', 'Unknown')} "
                                    f"({issue.get('mod_id', '')})"
                                ),
                                "status": "open",
                                "detected_at": datetime.now(
                                    timezone.utc
                                ).isoformat(),
                                "related_mod_issues": [
                                    issue.get("id", "")
                                ],
                                "log_excerpts": [
                                    e.get("log_excerpt", "")
                                    for e in issue.get("evidence", [])[-3:]
                                ],
                                "auto_detected": True,
                            }
                            await db.server_incidents.insert_one(incident)
                            logger.warning(
                                "Critical mod incident created for %s on %s",
                                issue.get("mod_name"),
                                server_name,
                            )
                except Exception as exc:
                    logger.warning(
                        "Mod-issue analysis failed for %s: %s",
                        server_name,
                        exc,
                    )

            await asyncio.sleep(interval)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Mod-issue analysis loop error: %s", exc)
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break

    logger.info("Mod-issue analysis loop stopped")
