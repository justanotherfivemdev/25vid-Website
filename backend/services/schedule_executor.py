import logging
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Dict

import httpx

from database import db
from services.docker_agent import DockerAgent

logger = logging.getLogger(__name__)

try:
    from croniter import croniter as _croniter  # type: ignore[import-untyped]
except ImportError:
    _croniter = None

_PRESET_INTERVALS: Dict[str, timedelta] = {
    "@hourly": timedelta(hours=1),
    "@daily": timedelta(days=1),
    "@weekly": timedelta(weeks=1),
}

# Track consecutive failures per schedule id for auto-disable logic.
_consecutive_failures: Dict[str, int] = {}


# ---------------------------------------------------------------------------
# 1. Cron parsing
# ---------------------------------------------------------------------------

def parse_next_run(cron_expr: str, from_dt: datetime = None) -> Optional[datetime]:
    """Return the next run time for *cron_expr* starting from *from_dt*.

    Supports ``@hourly``, ``@daily``, ``@weekly`` presets and simple
    ``minute hour`` two-field expressions.  If the ``croniter`` library is
    installed, full five-field cron expressions are also supported.
    """
    if not cron_expr or not cron_expr.strip():
        return None

    cron_expr = cron_expr.strip()
    if from_dt is None:
        from_dt = datetime.now(timezone.utc)

    # Ensure from_dt is timezone-aware.
    if from_dt.tzinfo is None:
        from_dt = from_dt.replace(tzinfo=timezone.utc)

    # --- preset shortcuts ---
    if cron_expr in _PRESET_INTERVALS:
        return from_dt + _PRESET_INTERVALS[cron_expr]

    # --- croniter (full five-field expressions) ---
    if _croniter is not None:
        try:
            cron = _croniter(cron_expr, from_dt)
            next_dt = cron.get_next(datetime)
            if next_dt.tzinfo is None:
                next_dt = next_dt.replace(tzinfo=timezone.utc)
            return next_dt
        except (ValueError, KeyError, TypeError):
            pass  # fall through to simple parser

    # --- simple two-field parser: "minute hour" ---
    parts = cron_expr.split()
    if len(parts) >= 2:
        try:
            minute = int(parts[0])
            hour = int(parts[1])
            if not (0 <= minute <= 59 and 0 <= hour <= 23):
                return None

            candidate = from_dt.replace(
                hour=hour, minute=minute, second=0, microsecond=0,
            )
            if candidate <= from_dt:
                candidate += timedelta(days=1)
            return candidate
        except (ValueError, TypeError):
            pass

    logger.warning("Unable to parse cron expression: %s", cron_expr)
    return None


# ---------------------------------------------------------------------------
# 2. Action executor
# ---------------------------------------------------------------------------

_docker_agent = DockerAgent()


async def execute_action(schedule: dict, server: dict) -> Tuple[bool, str]:
    """Execute the scheduled *action_type* against *server*.

    Returns ``(success, message)`` describing the outcome.
    """
    action_type = schedule.get("action_type", "restart")
    server_name = server.get("name", server.get("id", "unknown"))

    if action_type == "restart":
        container_name = server.get("container_name") or server.get("name", "")
        success, err = await _docker_agent.restart_container(container_name)
        if success:
            msg = f"Server '{server_name}' restarted successfully"
            logger.info(msg)
            return True, msg
        msg = f"Failed to restart server '{server_name}': {err}"
        logger.error(msg)
        return False, msg

    if action_type == "backup":
        backup_doc = {
            "id": f"bk_{uuid.uuid4().hex[:12]}",
            "server_id": server.get("id", ""),
            "backup_type": "automatic",
            "file_path": "",
            "size_bytes": 0,
            "config_snapshot": server.get("config", {}),
            "mods_snapshot": server.get("mods", []),
            "created_at": datetime.now(timezone.utc),
            "created_by": schedule.get("created_by", "scheduler"),
        }
        try:
            await db.server_backups.insert_one(backup_doc)
            msg = f"Backup created for server '{server_name}' ({backup_doc['id']})"
            logger.info(msg)
            return True, msg
        except Exception as exc:
            msg = f"Backup failed for server '{server_name}': {exc}"
            logger.error(msg)
            return False, msg

    if action_type == "mod_update":
        msg = (
            f"Mod update requested for server '{server_name}' "
            "(not yet implemented — skipping)"
        )
        logger.info(msg)
        return True, msg

    msg = f"Unknown action_type '{action_type}' for server '{server_name}'"
    logger.warning(msg)
    return False, msg


# ---------------------------------------------------------------------------
# 3. Background execution loop
# ---------------------------------------------------------------------------

async def schedule_execution_loop(check_interval: int = 60) -> None:
    """Long-running loop that checks for due scheduled actions and runs them."""
    logger.info(
        "Schedule execution loop started (check every %ds)", check_interval,
    )
    try:
        while True:
            try:
                now = datetime.now(timezone.utc)
                due_schedules = await db.server_schedules.find(
                    {"enabled": True, "next_run": {"$lte": now}},
                ).to_list(100)

                for sched in due_schedules:
                    sched_id = sched.get("id", "unknown")
                    server = await db.managed_servers.find_one(
                        {"id": sched.get("server_id")},
                    )
                    if server is None:
                        logger.warning(
                            "Schedule %s references missing server %s — skipping",
                            sched_id,
                            sched.get("server_id"),
                        )
                        continue

                    success, message = await execute_action(sched, server)

                    # Compute next run from now.
                    new_next = parse_next_run(
                        sched.get("schedule", ""), from_dt=now,
                    )
                    update_fields: Dict = {
                        "last_run": now,
                    }
                    if new_next is not None:
                        update_fields["next_run"] = new_next

                    if success:
                        _consecutive_failures.pop(sched_id, None)
                        await fire_webhooks(
                            "schedule.success", server,
                            sched.get("action_type", "restart"), "success",
                        )
                    else:
                        fail_count = _consecutive_failures.get(sched_id, 0) + 1
                        _consecutive_failures[sched_id] = fail_count

                        # Create an incident for the failure.
                        incident = {
                            "id": f"inc_{uuid.uuid4().hex[:12]}",
                            "server_id": sched.get("server_id", ""),
                            "incident_type": "scheduled_action_failure",
                            "severity": "high",
                            "title": (
                                f"Scheduled {sched.get('action_type', 'action')} "
                                f"failed for {server.get('name', 'unknown')}"
                            ),
                            "description": message,
                            "status": "open",
                            "detected_at": now.isoformat(),
                            "auto_detected": True,
                        }
                        await db.server_incidents.insert_one(incident)

                        # Disable schedule after 3 consecutive failures.
                        if fail_count >= 3:
                            update_fields["enabled"] = False
                            _consecutive_failures.pop(sched_id, None)
                            logger.warning(
                                "Schedule %s disabled after %d consecutive failures",
                                sched_id,
                                fail_count,
                            )

                        await fire_webhooks(
                            "schedule.failure", server,
                            sched.get("action_type", "restart"), "failure",
                        )

                    await db.server_schedules.update_one(
                        {"id": sched_id},
                        {"$set": update_fields},
                    )

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("Schedule execution loop error: %s", exc)

            await asyncio.sleep(check_interval)

    except asyncio.CancelledError:
        logger.info("Schedule execution loop cancelled — shutting down")


# ---------------------------------------------------------------------------
# 4. Webhook dispatcher
# ---------------------------------------------------------------------------

_DISCORD_COLORS = {
    "success": 0x2ECC71,  # green
    "failure": 0xE74C3C,  # red
    "info": 0x3498DB,     # blue
}

_WEBHOOK_MAX_RETRIES = 3
_WEBHOOK_BACKOFF_BASE = 1  # seconds


async def fire_webhooks(
    event: str,
    server: dict,
    action_type: str,
    status: str,
) -> None:
    """Send webhook notifications for *event* to all matching subscribers."""
    try:
        webhooks = await db.server_webhooks.find(
            {"enabled": True, "events": event},
        ).to_list(50)
    except Exception as exc:
        logger.error("Failed to query webhooks for event %s: %s", event, exc)
        return

    if not webhooks:
        return

    payload = {
        "event": event,
        "server_id": server.get("id", ""),
        "server_name": server.get("name", "unknown"),
        "action_type": action_type,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    for wh in webhooks:
        url = wh.get("url", "")
        if not url:
            continue

        body: dict
        if "discord.com/api/webhooks" in url or "discordapp.com/api/webhooks" in url:
            color = _DISCORD_COLORS.get(status, _DISCORD_COLORS["info"])
            body = {
                "embeds": [
                    {
                        "title": f"Scheduled {action_type} — {status}",
                        "description": (
                            f"Server **{payload['server_name']}** "
                            f"({payload['server_id']})"
                        ),
                        "color": color,
                        "fields": [
                            {"name": "Event", "value": event, "inline": True},
                            {"name": "Status", "value": status, "inline": True},
                        ],
                        "timestamp": payload["timestamp"],
                    }
                ],
            }
        else:
            body = payload

        await _send_webhook(url, body, wh.get("id", "unknown"))


async def _send_webhook(url: str, body: dict, webhook_id: str) -> None:
    """POST *body* to *url* with exponential-backoff retries."""
    for attempt in range(_WEBHOOK_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=body)
                if resp.status_code < 400:
                    return
                logger.warning(
                    "Webhook %s returned %d on attempt %d",
                    webhook_id,
                    resp.status_code,
                    attempt + 1,
                )
        except httpx.HTTPError as exc:
            logger.warning(
                "Webhook %s attempt %d failed: %s",
                webhook_id,
                attempt + 1,
                exc,
            )

        if attempt < _WEBHOOK_MAX_RETRIES - 1:
            await asyncio.sleep(_WEBHOOK_BACKOFF_BASE * (2 ** attempt))

    logger.error(
        "Webhook %s: all %d attempts exhausted", webhook_id, _WEBHOOK_MAX_RETRIES,
    )
