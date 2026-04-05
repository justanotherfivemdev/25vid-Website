"""Helpers for managed-server notifications."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from database import db
from models.server import ServerNotification
from services.reforger_orchestrator import NON_READINESS_STAGE_NAMES

CORE_PROVISIONING_STAGES = {
    "record_creation",
    "filesystem_preparation",
    "config_write",
    "container_creation",
    "initial_startup",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    return value


def _collect_follow_up_checklist(server: Dict[str, Any]) -> List[Dict[str, str]]:
    checklist: List[Dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for warning in server.get("provisioning_warnings") or []:
        stage = str(warning.get("stage") or "unknown")
        if stage in NON_READINESS_STAGE_NAMES:
            continue
        message = str(warning.get("message") or "Follow-up attention required")
        key = (stage, message)
        if key in seen:
            continue
        seen.add(key)
        checklist.append({"stage": stage, "message": message})

    for stage in (server.get("provisioning_stages") or {}).values():
        if stage.get("status") != "failed":
            continue
        stage_name = str(stage.get("name") or "unknown")
        if stage_name in CORE_PROVISIONING_STAGES:
            continue
        if stage_name in NON_READINESS_STAGE_NAMES:
            continue
        message = str(stage.get("error") or stage.get("message") or "Stage completed with warnings")
        key = (stage_name, message)
        if key in seen:
            continue
        seen.add(key)
        checklist.append({"stage": stage_name, "message": message})

    return checklist


async def upsert_server_notification(
    *,
    server_id: str,
    notification_type: str,
    title: str,
    message: str = "",
    severity: str = "warning",
    checklist: List[Dict[str, Any]] | None = None,
    dedupe_key: str | None = None,
    source: str = "",
) -> Dict[str, Any]:
    now = _utc_now()
    checklist = list(checklist or [])
    dedupe = dedupe_key or f"{server_id}:{notification_type}"
    existing = await db.server_notifications.find_one(
        {"server_id": server_id, "dedupe_key": dedupe},
        {"_id": 0, "id": 1, "acknowledged": 1, "acknowledged_at": 1, "acknowledged_by": 1, "created_at": 1},
    )

    notification = ServerNotification(
        id=(existing or {}).get("id") or f"notif_{now.strftime('%Y%m%d%H%M%S%f')[-12:]}",
        server_id=server_id,
        notification_type=notification_type,
        severity=severity,
        title=title,
        message=message,
        checklist=checklist,
        dedupe_key=dedupe,
        source=source,
        acknowledged=bool((existing or {}).get("acknowledged")),
        acknowledged_at=(existing or {}).get("acknowledged_at"),
        acknowledged_by=(existing or {}).get("acknowledged_by") or "",
        created_at=(existing or {}).get("created_at") or now,
        updated_at=now,
    )
    doc = notification.model_dump()

    await db.server_notifications.update_one(
        {"server_id": server_id, "dedupe_key": dedupe},
        {"$set": doc},
        upsert=True,
    )
    return _serialize(doc)


async def clear_server_notification_by_dedupe(server_id: str, dedupe_key: str, *, cleared_by: str = "") -> None:
    await db.server_notifications.update_many(
        {"server_id": server_id, "dedupe_key": dedupe_key, "status": "active"},
        {"$set": {
            "status": "cleared",
            "cleared_at": _utc_now(),
            "cleared_by": cleared_by,
            "updated_at": _utc_now(),
        }},
    )


async def sync_server_notifications(server: Dict[str, Any]) -> None:
    server_id = str(server.get("id") or "")
    if not server_id:
        return

    checklist = _collect_follow_up_checklist(server)
    if server.get("status") == "running" and checklist:
        await upsert_server_notification(
            server_id=server_id,
            notification_type="provisioning.followup",
            severity="warning",
            title="Provisioning Follow-up Required",
            message="The server is operational, but one or more provisioning checks still need review.",
            checklist=checklist,
            dedupe_key=f"{server_id}:provisioning.followup",
            source="provisioning",
        )
    else:
        await clear_server_notification_by_dedupe(server_id, f"{server_id}:provisioning.followup")

    if server.get("status") in {"error", "crash_loop"}:
        await upsert_server_notification(
            server_id=server_id,
            notification_type="runtime.failure",
            severity="critical" if server.get("status") == "crash_loop" else "error",
            title="Server Requires Intervention",
            message=str(server.get("summary_message") or server.get("last_docker_error") or "Server runtime failure detected."),
            checklist=[],
            dedupe_key=f"{server_id}:runtime.failure",
            source="runtime",
        )
    else:
        await clear_server_notification_by_dedupe(server_id, f"{server_id}:runtime.failure")


async def list_server_notifications(server_id: str, *, include_cleared: bool = False) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"server_id": server_id}
    if not include_cleared:
        query["status"] = "active"
    docs = await db.server_notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return _serialize(docs)

