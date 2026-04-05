"""Structured mod and runtime issue analysis grounded in unified server logs."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Tuple

from pymongo.errors import PyMongoError

from database import db
from services.server_logs import get_recent_server_log_entries

logger = logging.getLogger(__name__)


def _issue_attribution_type(mod_id: str, source_category: str) -> str:
    if mod_id and mod_id != "unattributed":
        return "mod"
    if source_category == "battleye-rcon":
        return "rcon"
    if source_category == "config":
        return "config"
    if source_category == "network":
        return "network"
    if source_category == "performance":
        return "performance"
    if source_category == "engine":
        return "engine"
    return "unknown"


ISSUE_PATTERNS: list[dict] = [
    {
        "pattern": re.compile(r"curl error 23|failed to download|workshop.*failed|download.*failed", re.IGNORECASE),
        "source_category": "workshop-download",
        "issue_type": "mod-download",
        "severity": "medium",
        "summary": "Workshop download failed while acquiring server content.",
        "actions": ["verify_workshop_permissions", "check_workshop_disk_ownership", "retry_mod_sync"],
    },
    {
        "pattern": re.compile(r"battl[e]?ye|bercon|rcon", re.IGNORECASE),
        "source_category": "battleye-rcon",
        "issue_type": "admin-channel",
        "severity": "medium",
        "summary": "BattlEye or RCON communication reported an operational fault.",
        "actions": ["verify_rcon_password", "check_battleye_runtime", "retry_rcon_bridge"],
    },
    {
        "pattern": re.compile(r"fps|stall|server thread|hitch|performance", re.IGNORECASE),
        "source_category": "performance",
        "issue_type": "runtime-performance",
        "severity": "high",
        "summary": "The server reported a performance issue that may affect simulation quality.",
        "actions": ["review_logstats", "check_mod_load_order", "inspect_host_resources"],
    },
    {
        "pattern": re.compile(r"json is invalid|incorrect type|server config|schema|additional properties", re.IGNORECASE),
        "source_category": "config",
        "issue_type": "server-config",
        "severity": "high",
        "summary": "Server configuration validation failed during startup.",
        "actions": ["review_server_config", "compare_with_reforger_schema", "retry_after_fix"],
    },
    {
        "pattern": re.compile(r"exception|script error|null reference|stack trace|traceback", re.IGNORECASE),
        "source_category": "runtime-script",
        "issue_type": "mod-runtime",
        "severity": "high",
        "summary": "A runtime script or engine exception was observed in live server output.",
        "actions": ["review_mod_stack_trace", "disable_suspect_mod", "collect_support_bundle"],
    },
    {
        "pattern": re.compile(r"timed out|timeout|connection lost|network", re.IGNORECASE),
        "source_category": "network",
        "issue_type": "connectivity",
        "severity": "medium",
        "summary": "The server reported a connectivity or timeout issue.",
        "actions": ["verify_network_reachability", "check_public_bindings", "retry_after_network_check"],
    },
    {
        "pattern": re.compile(r"failed|error|warning|warn", re.IGNORECASE),
        "source_category": "engine",
        "issue_type": "engine-runtime",
        "severity": "low",
        "summary": "The engine reported a warning or generic runtime error worth review.",
        "actions": ["review_recent_logs"],
    },
]


def _normalise_signature(source_category: str, line: str) -> str:
    cleaned = re.sub(r"\d{4}-\d{2}-\d{2}[T ].*?Z?", "", line)
    cleaned = re.sub(r"0x[0-9a-fA-F]+", "", cleaned)
    cleaned = re.sub(r"\b\d+\b", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    return hashlib.sha256(f"{source_category}|{cleaned}".encode("utf-8")).hexdigest()


def _classify_entry(entry: dict) -> dict | None:
    line = str(entry.get("line") or entry.get("raw") or "").strip()
    if not line:
        return None
    for rule in ISSUE_PATTERNS:
        if rule["pattern"].search(line):
            return {
                "source_category": rule["source_category"],
                "issue_type": rule["issue_type"],
                "severity": rule["severity"],
                "impact_summary": rule["summary"],
                "recommended_actions": rule["actions"],
                "line": line,
                "source": entry.get("source") or "unknown",
                "timestamp": entry.get("timestamp") or datetime.now(timezone.utc).isoformat(),
            }
    return None


def _extract_mod_reference(line: str, server_mods: List[Dict]) -> Tuple[str, str, float]:
    lower = line.lower()
    for mod in server_mods:
        mod_id = mod.get("mod_id") or mod.get("modId") or ""
        mod_name = mod.get("name") or mod_id or "Unknown Mod"
        if mod_id and mod_id.lower() in lower:
            return mod_id, mod_name, 0.95
        if mod_name and mod_name.lower() in lower:
            return mod_id or mod_name, mod_name, 0.8
    return "unattributed", "Core Server / Unattributed", 0.2


def _group_findings(entries: Iterable[dict], server_mods: List[Dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for entry in entries:
        classified = _classify_entry(entry)
        if not classified:
            continue
        mod_id, mod_name, confidence = _extract_mod_reference(classified["line"], server_mods)
        signature = _normalise_signature(classified["source_category"], classified["line"])
        finding = grouped.setdefault(
            signature,
            {
                "mod_id": mod_id,
                "mod_name": mod_name,
                "confidence_score": confidence,
                "severity": classified["severity"],
                "source_category": classified["source_category"],
                "issue_type": classified["issue_type"],
                "impact_summary": classified["impact_summary"],
                "recommended_actions": list(classified["recommended_actions"]),
                "error_pattern": classified["line"][:250],
                "error_signature": signature,
                "source_streams": set(),
                "evidence": [],
            },
        )
        finding["source_streams"].add(classified["source"])
        finding["evidence"].append(
            {
                "log_excerpt": classified["line"][:500],
                "timestamp": classified["timestamp"],
                "source": classified["source"],
                "source_category": classified["source_category"],
            }
        )
        finding["confidence_score"] = max(finding["confidence_score"], confidence)
        if classified["severity"] in {"critical", "high"}:
            finding["severity"] = classified["severity"]
    return [
        {**finding, "source_streams": sorted(finding["source_streams"])}
        for finding in grouped.values()
    ]


async def analyze_server_logs(server: dict) -> List[Dict]:
    entries = await get_recent_server_log_entries(server, tail=600)
    if not entries:
        return []

    findings = _group_findings(entries, server.get("mods", []))
    if not findings:
        return []

    now = datetime.now(timezone.utc)
    updated_issues: List[Dict] = []

    for finding in findings:
        try:
            existing = await db.mod_issues.find_one({"error_signature": finding["error_signature"]}, {"_id": 0})
            next_status = "active"
            if existing and existing.get("status") == "false_positive":
                next_status = "false_positive"
            designated_area = str((existing or {}).get("designated_area") or "mod-analysis")
            troublesome = bool((existing or {}).get("troublesome", False))
            troublesome_reason = str((existing or {}).get("troublesome_reason") or "")
            attribution_type = str(
                (existing or {}).get("attribution_type")
                or _issue_attribution_type(finding["mod_id"], finding["source_category"])
            )

            await db.mod_issues.update_one(
                {"error_signature": finding["error_signature"]},
                {
                    "$set": {
                        "mod_id": finding["mod_id"],
                        "mod_name": finding["mod_name"],
                        "error_pattern": finding["error_pattern"],
                        "confidence_score": finding["confidence_score"],
                        "attribution_method": "unified_log_correlation",
                        "last_seen": now,
                        "status": next_status,
                        "severity": finding["severity"],
                        "impact_summary": finding["impact_summary"],
                        "recommended_actions": finding["recommended_actions"],
                        "source_category": finding["source_category"],
                        "issue_type": finding["issue_type"],
                        "source_streams": finding["source_streams"],
                        "designated_area": designated_area,
                        "attribution_type": attribution_type,
                        "troublesome": troublesome,
                        "troublesome_reason": troublesome_reason,
                    },
                    "$setOnInsert": {
                        "id": f"mi_{uuid.uuid4().hex[:12]}",
                        "error_signature": finding["error_signature"],
                        "first_seen": now,
                        "evidence": [],
                        "affected_servers": [],
                    },
                    "$inc": {"occurrence_count": len(finding["evidence"])},
                    "$push": {"evidence": {"$each": finding["evidence"][-10:], "$slice": -50}},
                },
                upsert=True,
            )

            await db.mod_issues.update_one(
                {"error_signature": finding["error_signature"], "affected_servers.server_id": server["id"]},
                {"$set": {"affected_servers.$.last_seen": now, "affected_servers.$.server_name": server.get("name", server["id"])}},
            )
            await db.mod_issues.update_one(
                {
                    "error_signature": finding["error_signature"],
                    "affected_servers": {"$not": {"$elemMatch": {"server_id": server["id"]}}},
                },
                {"$push": {"affected_servers": {"server_id": server["id"], "server_name": server.get("name", server["id"]), "last_seen": now}}},
            )

            issue = await db.mod_issues.find_one({"error_signature": finding["error_signature"]}, {"_id": 0})
            if issue:
                updated_issues.append(issue)
        except PyMongoError as exc:
            logger.error("Failed to persist mod issue finding %s: %s", finding.get("error_signature", "?"), exc)

    return updated_issues


async def mod_issue_analysis_loop(interval: int = 60) -> None:
    logger.info("Mod issue analysis loop started (interval=%ss)", interval)
    while True:
        try:
            servers = await db.managed_servers.find({"status": {"$in": ["running", "starting"]}}, {"_id": 0}).to_list(500)
            for server in servers:
                try:
                    await analyze_server_logs(server)
                except Exception as exc:
                    logger.warning("Mod issue analysis failed for %s: %s", server.get("name"), exc)
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Mod issue analysis loop error: %s", exc)
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
