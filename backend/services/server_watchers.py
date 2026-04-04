"""Backend watcher evaluation and detection persistence."""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from database import db
from services.server_logs import get_recent_server_log_entries, stable_hash
from services.server_metrics_collector import get_metrics_summary

logger = logging.getLogger(__name__)


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
                "recommended_actions": existing.get("recommended_actions", []) if existing else [],
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
        detection_key = f"health|{watcher['id']}|{server.get('status')}|{server.get('readiness_state')}"
        await _upsert_detection(
            server=server,
            watcher=watcher,
            detection_key=detection_key,
            title=title,
            summary=summary,
            evidence=evidence,
            source_category="engine",
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

    entries = await get_recent_server_log_entries(server, tail=300)
    matches = [
        entry for entry in entries
        if regex.search(str(entry.get("line") or entry.get("raw") or ""))
    ]
    if not matches:
        return

    summary = f"Watcher matched {len(matches)} recent log line(s) for pattern `{pattern}`."
    detection_key = f"log|{watcher['id']}|{stable_hash(summary + (matches[-1].get('cursor') or ''))}"
    await _upsert_detection(
        server=server,
        watcher=watcher,
        detection_key=detection_key,
        title=f"Log watcher matched on {server.get('name', server['id'])}",
        summary=summary,
        evidence=[
            {
                "timestamp": entry.get("timestamp"),
                "source": entry.get("source"),
                "log_excerpt": entry.get("line") or entry.get("raw"),
            }
            for entry in matches[-10:]
        ],
        source_category="runtime-script",
        source_streams=[entry.get("source") or "unknown" for entry in matches],
        confidence_score=0.8,
    )


async def _evaluate_threshold_watcher(server: dict, watcher: dict) -> None:
    metric = str(watcher.get("metric") or "cpu_percent")
    threshold = float(watcher.get("threshold") or 0)
    summary = await get_metrics_summary(server["id"])
    latest_value = _latest_metric(summary, metric)
    if latest_value is None or float(latest_value) <= threshold:
        return

    detection_key = f"threshold|{watcher['id']}|{metric}|{int(float(latest_value))}"
    await _upsert_detection(
        server=server,
        watcher=watcher,
        detection_key=detection_key,
        title=f"{metric} exceeded threshold on {server.get('name', server['id'])}",
        summary=f"{metric} is {latest_value}, above threshold {threshold}.",
        evidence=[{
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "metrics",
            "log_excerpt": f"{metric}={latest_value} threshold={threshold}",
        }],
        source_category="performance" if metric in {"cpu_percent", "server_fps"} else "engine",
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
