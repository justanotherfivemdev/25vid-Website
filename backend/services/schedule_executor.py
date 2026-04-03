"""Schedule execution for managed Arma Reforger servers."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple
from zoneinfo import ZoneInfo

from croniter import croniter

from database import db
from services.reforger_orchestrator import (
    ProvisioningError,
    restart_server as orchestrator_restart_server,
    start_server as orchestrator_start_server,
    stop_server as orchestrator_stop_server,
)

logger = logging.getLogger(__name__)


def _coerce_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def parse_next_run(schedule: str, timezone_name: str = "UTC", from_dt: Optional[datetime] = None) -> Optional[datetime]:
    if not schedule or not schedule.strip():
        return None

    base_dt = from_dt or datetime.now(timezone.utc)
    if base_dt.tzinfo is None:
        base_dt = base_dt.replace(tzinfo=timezone.utc)

    local_tz = _coerce_timezone(timezone_name)
    local_base = base_dt.astimezone(local_tz)

    try:
        next_local = croniter(schedule.strip(), local_base).get_next(datetime)
    except Exception:
        logger.warning("Unable to parse schedule %r for timezone %s", schedule, timezone_name)
        return None

    if next_local.tzinfo is None:
        next_local = next_local.replace(tzinfo=local_tz)
    return next_local.astimezone(timezone.utc)


async def _apply_server_update(server_id: str, update_fields: Dict) -> None:
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.managed_servers.update_one({"id": server_id}, {"$set": update_fields})


async def execute_action(schedule: Dict, server: Dict) -> Tuple[bool, Dict]:
    action_type = schedule.get("action_type", "restart")
    now = datetime.now(timezone.utc)

    try:
        if action_type == "restart":
            updates = await orchestrator_restart_server(server)
            await _apply_server_update(server["id"], updates)
            return True, {"message": "Server restarted", "at": now.isoformat()}

        if action_type == "start":
            updates = await orchestrator_start_server(server)
            await _apply_server_update(server["id"], updates)
            return True, {"message": "Server started", "at": now.isoformat()}

        if action_type == "stop":
            updates = await orchestrator_stop_server(server)
            await _apply_server_update(server["id"], updates)
            return True, {"message": "Server stopped", "at": now.isoformat()}

        if action_type == "downtime_window":
            updates = await orchestrator_stop_server(server)
            restore_at = now + timedelta(minutes=int(schedule.get("downtime_minutes") or 0))
            updates["last_scheduled_downtime_start"] = now.isoformat()
            await _apply_server_update(server["id"], updates)
            return True, {
                "message": "Downtime started",
                "at": now.isoformat(),
                "restore_at": restore_at.isoformat(),
            }
    except ProvisioningError as exc:
        return False, {"message": exc.message, "step": exc.step, "at": now.isoformat()}

    return False, {"message": f"Unknown action type: {action_type}", "at": now.isoformat()}


async def _record_schedule_result(schedule_id: str, result: Dict, success: bool, update_fields: Dict) -> None:
    history_entry = {
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "success": success,
        **result,
    }
    update_fields["execution_history"] = {"$each": [history_entry], "$slice": -25}
    await db.server_schedules.update_one(
        {"id": schedule_id},
        {
            "$set": {k: v for k, v in update_fields.items() if k != "execution_history"},
            "$push": {"execution_history": update_fields["execution_history"]},
        },
    )


async def _run_due_schedules(now: datetime) -> None:
    due_schedules = await db.server_schedules.find(
        {"enabled": True, "next_run": {"$lte": now}},
        {"_id": 0},
    ).to_list(100)

    for schedule in due_schedules:
        server = await db.managed_servers.find_one({"id": schedule["server_id"]}, {"_id": 0})
        if not server:
            continue

        success, result = await execute_action(schedule, server)
        next_run = parse_next_run(schedule.get("schedule", ""), schedule.get("timezone", "UTC"), now)
        update_fields = {
            "last_run": now,
            "next_run": next_run,
            "updated_at": now,
            "last_result": result,
        }
        if success and schedule.get("action_type") == "downtime_window":
            try:
                update_fields["downtime_restore_at"] = datetime.fromisoformat(result["restore_at"])
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Invalid restore_at in downtime result for schedule %s: %s", schedule.get("id"), exc)
        await _record_schedule_result(schedule["id"], result, success, update_fields)


async def _run_due_restores(now: datetime) -> None:
    restore_schedules = await db.server_schedules.find(
        {
            "enabled": True,
            "action_type": "downtime_window",
            "downtime_restore_at": {"$lte": now},
        },
        {"_id": 0},
    ).to_list(100)

    for schedule in restore_schedules:
        server = await db.managed_servers.find_one({"id": schedule["server_id"]}, {"_id": 0})
        if not server:
            continue
        try:
            updates = await orchestrator_start_server(server)
            await _apply_server_update(server["id"], updates)
            result = {"message": "Downtime ended and server restored", "at": now.isoformat()}
            await _record_schedule_result(
                schedule["id"],
                result,
                True,
                {
                    "last_result": result,
                    "downtime_restore_at": None,
                    "updated_at": now,
                },
            )
        except ProvisioningError as exc:
            await _record_schedule_result(
                schedule["id"],
                {"message": exc.message, "step": exc.step, "at": now.isoformat()},
                False,
                {"last_result": {"message": exc.message, "step": exc.step, "at": now.isoformat()}, "updated_at": now},
            )


async def schedule_execution_loop(check_interval: int = 60) -> None:
    logger.info("Schedule executor started (interval=%ss)", check_interval)
    while True:
        try:
            now = datetime.now(timezone.utc)
            await _run_due_schedules(now)
            await _run_due_restores(now)
            await asyncio.sleep(check_interval)
        except asyncio.CancelledError:
            logger.info("Schedule executor cancelled")
            raise
        except Exception as exc:
            logger.error("Schedule executor error: %s", exc)
            await asyncio.sleep(check_interval)
