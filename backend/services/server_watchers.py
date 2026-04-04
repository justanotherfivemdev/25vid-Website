"""Backend watcher evaluation, default coverage, and detection persistence."""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from database import db
from models.server import ServerWatcher
from services.server_logs import get_recent_server_log_entries, stable_hash
from services.server_metrics_collector import get_metrics_summary

logger = logging.getLogger(__name__)


ESSENTIAL_WATCHER_TEMPLATES: tuple[dict[str, Any], ...] = (
    {
        "template_key": "essential-health",
        "name": "Essential Health",
        "type": "health",
        "severity": "high",
        "source_category": "engine",
        "description": "Flags crash loops, runtime degradation, and failed readiness states.",
        "recommended_actions": [
            "Review the workspace overview and recent console lines for the failing stage.",
            "Confirm the current config and mounted profile paths before restarting the server.",
        ],
    },
    {
        "template_key": "essential-mod-failures",
        "name": "Essential Mod Failures",
        "type": "log",
        "pattern": r"(?i)(script error|workshop.*(fail|error|timeout)|mod.*(fail|error|missing|mismatch)|addon.*(fail|error|missing)|dependency.*missing)",
        "severity": "high",
        "source_category": "mod_issue",
        "description": "Captures workshop download failures, missing dependencies, and runtime script/mod errors.",
        "recommended_actions": [
            "Review the affected mod list and recent workshop/mod issue evidence.",
            "Create or update an operational note with the required remove/test/add action.",
        ],
    },
    {
        "template_key": "essential-battleye-rcon",
        "name": "Essential BattlEye / RCON",
        "type": "log",
        "pattern": r"(?i)(battleye|battl[e]?ye|rcon).*(fail|error|reject|denied|timeout|timed out|auth|disconnect)",
        "severity": "high",
        "source_category": "battleye_rcon",
        "description": "Watches BattlEye and RCON failures so admin tooling outages are surfaced immediately.",
        "recommended_actions": [
            "Verify the BattlEye/RCON password, published port, and runtime host routing.",
            "Test the live RCON terminal after the transport path is healthy again.",
        ],
    },
    {
        "template_key": "essential-admin-actions",
        "name": "Essential Admin Actions",
        "type": "log",
        "pattern": r"(?i)^>\s*#(kick|ban|shutdown|restart|lock|unlock|mission)|\b(player|admin)\b.*\b(kicked|banned|muted)\b",
        "severity": "medium",
        "source_category": "admin_action",
        "description": "Tracks moderation and operational commands flowing through RCON and server logs.",
        "recommended_actions": [
            "Attach moderation context or follow-up notes when player action was taken.",
            "Review the related RCON response/evidence before marking the event resolved.",
        ],
    },
    {
        "template_key": "essential-runtime-crash",
        "name": "Essential Runtime Crash",
        "type": "log",
        "pattern": r"(?i)\b(fatal|crash|assert|exception|stack trace)\b",
        "severity": "critical",
        "source_category": "runtime_crash",
        "description": "Raises alerts for crash signatures and fatal runtime exceptions in merged logs.",
        "recommended_actions": [
            "Capture the crash evidence and link the likely mod/config culprit in notes.",
            "Create or update an incident if the server was player-facing when it failed.",
        ],
    },
    {
        "template_key": "essential-high-cpu",
        "name": "Essential High CPU",
        "type": "threshold",
        "metric": "cpu_percent",
        "comparison": "gt",
        "threshold": 85,
        "severity": "high",
        "source_category": "performance",
        "description": "Alerts when host-normalized CPU stays above healthy operating headroom.",
        "recommended_actions": [
            "Inspect recent mods, AI load, and profiling data for runaway server work.",
            "Correlate the spike with low-FPS or ping evidence before restarting.",
        ],
    },
    {
        "template_key": "essential-low-fps",
        "name": "Essential Low FPS",
        "type": "threshold",
        "metric": "server_fps",
        "comparison": "lt",
        "threshold": 20,
        "severity": "high",
        "source_category": "performance",
        "description": "Flags degraded simulation performance when logStats-derived server FPS drops too low.",
        "recommended_actions": [
            "Check the live console around the last low-FPS sample for script or AI spikes.",
            "Document any mod rollback or test plan in notes before changing the live stack.",
        ],
    },
    {
        "template_key": "essential-high-ping",
        "name": "Essential High Ping",
        "type": "threshold",
        "metric": "avg_player_ping_ms",
        "comparison": "gt",
        "threshold": 180,
        "severity": "medium",
        "source_category": "performance",
        "description": "Warns when the average RCON-derived player ping suggests network degradation.",
        "recommended_actions": [
            "Compare the ping spike with concurrent CPU/FPS degradation and player actions.",
            "Record any community-facing disruption and follow-up in notes.",
        ],
    },
)


def _severity_rank(value: str) -> int:
    return {"low": 1, "medium": 2, "high": 3, "critical": 4}.get(str(value or "").lower(), 1)


def _latest_metric(summary: dict, metric: str) -> float | int | None:
    latest = summary.get("latest") or {}
    aliases = {
        "cpu_percent": ("cpu_host_percent", "cpu_percent"),
        "memory_mb": ("memory_mb",),
        "player_count": ("player_count",),
        "server_fps": ("server_fps", "fps"),
        "avg_player_ping_ms": ("avg_player_ping_ms", "ping"),
    }
    for key in aliases.get(metric, (metric,)):
        value = latest.get(key)
        if value is not None:
            return value
    return None


def _comparison_label(comparison: str) -> str:
    return {
        "gt": ">",
        "gte": ">=",
        "lt": "<",
        "lte": "<=",
    }.get(str(comparison or "gt"), ">")


def _threshold_triggered(value: float, threshold: float, comparison: str) -> bool:
    if comparison == "gte":
        return value >= threshold
    if comparison == "lt":
        return value < threshold
    if comparison == "lte":
        return value <= threshold
    return value > threshold


def build_essential_watchers(server_id: str, *, created_by: str = "system") -> list[ServerWatcher]:
    now = datetime.now(timezone.utc)
    return [
        ServerWatcher(
            server_id=server_id,
            created_by=created_by,
            created_at=now,
            updated_at=now,
            enabled=True,
            notify=True,
            system_managed=True,
            **template,
        )
        for template in ESSENTIAL_WATCHER_TEMPLATES
    ]


async def ensure_default_watchers(server_id: str, *, created_by: str = "system") -> list[dict]:
    existing = await db.server_watchers.find(
        {"server_id": server_id},
        {"_id": 0, "template_key": 1},
    ).to_list(200)
    existing_keys = {
        str(watcher.get("template_key") or "").strip()
        for watcher in existing
        if watcher.get("template_key")
    }

    created: list[dict] = []
    for watcher in build_essential_watchers(server_id, created_by=created_by):
        if watcher.template_key and watcher.template_key in existing_keys:
            continue
        doc = watcher.model_dump()
        for key in ("created_at", "updated_at", "last_triggered_at"):
            value = doc.get(key)
            if isinstance(value, datetime):
                doc[key] = value.isoformat()
        await db.server_watchers.insert_one(doc)
        created.append(doc)
    return created


async def _upsert_detection(
    *,
    server: dict,
    watcher: dict,
    detection_key: str,
    title: str,
    summary: str,
    evidence: List[Dict[str, Any]],
    source_category: str,
    source_streams: Iterable[str],
    confidence_score: float,
) -> None:
    now = datetime.now(timezone.utc)
    detection_seed = f"{server['id']}|{detection_key}|{title}"
    detection_id = f"detect_{stable_hash(detection_seed)}"
    existing = await db.server_detections.find_one(
        {"server_id": server["id"], "detection_key": detection_key},
        {"_id": 0},
    )
    next_status = "active"
    if existing and existing.get("status") == "false_positive":
        next_status = "false_positive"

    recommended_actions = list(
        watcher.get("recommended_actions")
        or (existing.get("recommended_actions") if existing else [])
        or []
    )

    await db.server_detections.update_one(
        {"server_id": server["id"], "detection_key": detection_key},
        {
            "$set": {
                "watcher_id": watcher.get("id", ""),
                "title": title,
                "summary": summary,
                "severity": watcher.get("severity", "medium"),
                "status": next_status,
                "source_category": source_category,
                "source_streams": sorted(set(source_streams)),
                "confidence_score": confidence_score,
                "last_seen": now,
                "updated_at": now,
                "recommended_actions": recommended_actions,
            },
            "$setOnInsert": {
                "id": detection_id,
                "server_id": server["id"],
                "first_seen": now,
                "occurrence_count": 0,
                "evidence": [],
                "verdict_notes": "",
            },
            "$inc": {"occurrence_count": max(1, len(evidence))},
            "$push": {"evidence": {"$each": evidence[-10:], "$slice": -50}},
        },
        upsert=True,
    )

    await db.server_watchers.update_one(
        {"id": watcher["id"]},
        {"$set": {"last_triggered_at": now, "updated_at": now}, "$inc": {"trigger_count": 1}},
    )


async def _evaluate_health_watcher(server: dict, watcher: dict) -> None:
    if server.get("status") in {"error", "crash_loop"} or server.get("readiness_state") == "degraded":
        title = f"{server.get('name', 'Server')} health requires attention"
        summary = server.get("summary_message") or server.get("last_docker_error") or "Runtime state is degraded."
        evidence = [{
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "server_state",
            "log_excerpt": summary,
        }]
        await _upsert_detection(
            server=server,
            watcher=watcher,
            detection_key=f"health|{watcher['id']}",
            title=title,
            summary=summary,
            evidence=evidence,
            source_category=str(watcher.get("source_category") or "engine"),
            source_streams=["server_state"],
            confidence_score=0.95,
        )


async def _evaluate_log_watcher(server: dict, watcher: dict) -> None:
    pattern = str(watcher.get("pattern") or "").strip()
    if not pattern:
        return
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error:
        logger.warning("Invalid watcher regex %r for %s", pattern, watcher.get("id"))
        return

    entries = await get_recent_server_log_entries(server, tail=400)
    matches = [
        entry for entry in entries
        if regex.search(str(entry.get("line") or entry.get("raw") or ""))
    ]
    if not matches:
        return

    summary = f"Watcher matched {len(matches)} recent log line(s) for pattern `{pattern}`."
    await _upsert_detection(
        server=server,
        watcher=watcher,
        detection_key=f"log|{watcher['id']}",
        title=f"{watcher.get('name', 'Log watcher')} matched on {server.get('name', server['id'])}",
        summary=summary,
        evidence=[
            {
                "timestamp": entry.get("timestamp"),
                "source": entry.get("source"),
                "log_excerpt": entry.get("line") or entry.get("raw"),
            }
            for entry in matches[-10:]
        ],
        source_category=str(watcher.get("source_category") or "runtime-script"),
        source_streams=[entry.get("source") or "unknown" for entry in matches],
        confidence_score=0.8,
    )


async def _evaluate_threshold_watcher(server: dict, watcher: dict) -> None:
    metric = str(watcher.get("metric") or "cpu_percent")
    threshold = float(watcher.get("threshold") or 0)
    comparison = str(watcher.get("comparison") or "gt")
    summary = await get_metrics_summary(server["id"])
    latest_value = _latest_metric(summary, metric)
    if latest_value is None:
        return

    numeric_value = float(latest_value)
    if not _threshold_triggered(numeric_value, threshold, comparison):
        return

    comparison_label = _comparison_label(comparison)
    await _upsert_detection(
        server=server,
        watcher=watcher,
        detection_key=f"threshold|{watcher['id']}",
        title=f"{watcher.get('name', metric)} triggered on {server.get('name', server['id'])}",
        summary=f"{metric} is {numeric_value}, which is {comparison_label} {threshold}.",
        evidence=[{
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "metrics",
            "log_excerpt": f"{metric}={numeric_value} {comparison_label} {threshold}",
        }],
        source_category=str(
            watcher.get("source_category")
            or ("performance" if metric in {"cpu_percent", "server_fps", "avg_player_ping_ms"} else "engine")
        ),
        source_streams=["metrics"],
        confidence_score=0.9,
    )


async def evaluate_watchers_once() -> None:
    watchers = await db.server_watchers.find({"enabled": True}, {"_id": 0}).to_list(500)
    if not watchers:
        return

    server_ids = sorted({watcher["server_id"] for watcher in watchers if watcher.get("server_id")})
    servers = await db.managed_servers.find({"id": {"$in": server_ids}}, {"_id": 0}).to_list(500)
    servers_by_id = {server["id"]: server for server in servers}

    for watcher in watchers:
        server = servers_by_id.get(watcher.get("server_id"))
        if not server:
            continue
        try:
            if watcher.get("type") == "health":
                await _evaluate_health_watcher(server, watcher)
            elif watcher.get("type") == "log":
                await _evaluate_log_watcher(server, watcher)
            elif watcher.get("type") == "threshold":
                await _evaluate_threshold_watcher(server, watcher)
        except Exception as exc:
            logger.warning("Watcher evaluation failed for %s on %s: %s", watcher.get("id"), server.get("id"), exc)


async def watchers_loop(interval: int = 30) -> None:
    logger.info("Watcher evaluation loop started (interval=%ss)", interval)
    while True:
        try:
            await evaluate_watchers_once()
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Watcher evaluation loop error: %s", exc)
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
