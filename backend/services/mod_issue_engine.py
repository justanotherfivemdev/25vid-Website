"""Grounded mod issue analysis based on real server log output."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from database import db
from services.docker_agent import DockerAgent

logger = logging.getLogger(__name__)

docker_agent = DockerAgent()

ERROR_KEYWORDS = ("error", "failed", "exception", "timeout", "warn", "performance", "stall")


def _normalise_signature(line: str) -> str:
    cleaned = re.sub(r"\d{4}-\d{2}-\d{2}[T ].*?Z?", "", line)
    cleaned = re.sub(r"0x[0-9a-fA-F]+", "", cleaned)
    cleaned = re.sub(r"\b\d+\b", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()


def _classify_impact(line: str) -> Tuple[str, str]:
    lower = line.lower()
    if "performance" in lower or "fps" in lower or "stall" in lower:
        return "high", "This log line indicates the mod may be degrading server performance."
    if "failed to download" in lower or "workshop" in lower:
        return "medium", "This mod appears to be failing during workshop download or startup loading."
    if "exception" in lower or "error" in lower:
        return "high", "This mod is generating runtime errors that may affect gameplay or stability."
    if "warn" in lower:
        return "low", "This mod is generating warnings that should be reviewed before they escalate."
    return "low", "The server emitted a suspicious log line associated with this mod."


def _extract_mod_reference(line: str, server_mods: List[Dict]) -> Tuple[str, str, float]:
    lower = line.lower()
    for mod in server_mods:
        mod_id = mod.get("mod_id") or mod.get("modId") or ""
        mod_name = mod.get("name") or mod_id or "Unknown Mod"
        if mod_id and mod_id.lower() in lower:
            return mod_id, mod_name, 0.95
        if mod_name and mod_name.lower() in lower:
            return mod_id or mod_name, mod_name, 0.8
    return "unattributed", "Unattributed server issue", 0.2


def parse_logs(log_text: str, server_mods: List[Dict]) -> List[Dict]:
    issues: List[Dict] = []
    for raw_line in log_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if not any(keyword in line.lower() for keyword in ERROR_KEYWORDS):
            continue
        mod_id, mod_name, confidence = _extract_mod_reference(line, server_mods)
        severity, summary = _classify_impact(line)
        issues.append(
            {
                "mod_id": mod_id,
                "mod_name": mod_name,
                "confidence_score": confidence,
                "severity": severity,
                "impact_summary": summary,
                "log_line": line,
                "error_signature": _normalise_signature(line),
            }
        )
    return issues


async def analyze_server_logs(server_id: str, container_name: str, server_mods: List[Dict]) -> List[Dict]:
    log_text = await docker_agent.get_container_logs(container_name, tail=500)
    if not log_text:
        return []

    findings = parse_logs(log_text, server_mods)
    if not findings:
        return []

    now = datetime.now(timezone.utc).isoformat()
    updated_issues: List[Dict] = []

    for finding in findings:
        try:
            evidence_entry = {
                "log_excerpt": finding["log_line"][:500],
                "timestamp": now,
                "severity": finding["severity"],
            }

            await db.mod_issues.update_one(
                {"error_signature": finding["error_signature"]},
                {
                    "$set": {
                        "mod_id": finding["mod_id"],
                        "mod_name": finding["mod_name"],
                        "error_pattern": finding["log_line"][:250],
                        "confidence_score": finding["confidence_score"],
                        "attribution_method": "log_correlation",
                        "last_seen": now,
                        "status": "active",
                        "severity": finding["severity"],
                        "impact_summary": finding["impact_summary"],
                    },
                    "$setOnInsert": {
                        "id": f"mi_{uuid.uuid4().hex[:12]}",
                        "error_signature": finding["error_signature"],
                        "first_seen": now,
                        "recommended_actions": [],
                        "evidence": [],
                        "affected_servers": [],
                    },
                    "$inc": {"occurrence_count": 1},
                    "$push": {"evidence": {"$each": [evidence_entry], "$slice": -50}},
                },
                upsert=True,
            )

            await db.mod_issues.update_one(
                {"error_signature": finding["error_signature"], "affected_servers.server_id": server_id},
                {"$set": {"affected_servers.$.last_seen": now}},
            )
            await db.mod_issues.update_one(
                {
                    "error_signature": finding["error_signature"],
                    "affected_servers": {"$not": {"$elemMatch": {"server_id": server_id}}},
                },
                {"$push": {"affected_servers": {"server_id": server_id, "last_seen": now}}},
            )

            issue = await db.mod_issues.find_one({"error_signature": finding["error_signature"]}, {"_id": 0})
            if issue:
                updated_issues.append(issue)
        except Exception as exc:
            logger.warning("Failed to persist mod issue finding %s: %s", finding.get("error_signature", "?"), exc)

    return updated_issues


async def mod_issue_analysis_loop(interval: int = 60) -> None:
    logger.info("Mod issue analysis loop started (interval=%ss)", interval)
    while True:
        try:
            servers = await db.managed_servers.find({"status": "running"}, {"_id": 0}).to_list(500)
            for server in servers:
                try:
                    await analyze_server_logs(
                        server.get("id", ""),
                        server.get("container_name") or server.get("name", ""),
                        server.get("mods", []),
                    )
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
