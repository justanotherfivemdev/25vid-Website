"""Background service that monitors Docker container health for managed game servers."""

import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict
import uuid

from database import db
from models.server import SERVER_STATUSES  # noqa: F401 – used for validation reference
from services.docker_agent import DockerAgent
from services.server_notifications import sync_server_notifications

logger = logging.getLogger(__name__)

docker_agent = DockerAgent()

# Tracks automatic restart attempts per server_id.  Reset when a server is
# manually started or has been running stably for > 5 minutes.
_restart_counts: Dict[str, int] = {}

# Statuses that indicate the container should be alive
_ACTIVE_STATUSES = [s for s in ("running", "starting") if s in SERVER_STATUSES]

STABILITY_THRESHOLD_SECONDS = 300  # 5 minutes before restart counter resets
_running_since: Dict[str, datetime] = {}


def _parse_datetime(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


async def server_health_loop(check_interval: int = 15):
    """Continuously check managed-server containers and react to failures.

    Follows the same async-loop pattern used by ``_valyu_background_ingestion``
    and ``_expire_loa_requests`` in *server.py*.
    """
    logger.info("Server health monitor started (interval=%ds)", check_interval)

    while True:
        try:
            cursor = db.managed_servers.find(
                {"status": {"$in": _ACTIVE_STATUSES}},
                {"_id": 0},
            )
            servers = await cursor.to_list(500)

            for server in servers:
                server_id = server.get("id", "")
                server_name = server.get("name", server_id)
                container_name = server.get("container_name", server_name)
                current_status = server.get("status")

                try:
                    status_info = await docker_agent.get_container_status(container_name)
                    await _evaluate_server(server, server_id, server_name,
                                           container_name, current_status,
                                           status_info)
                except Exception as exc:
                    logger.warning("Health check failed for %s: %s", server_name, exc)

            await asyncio.sleep(check_interval)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Server health monitor error: %s", exc)
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break

    logger.info("Server health monitor stopped")


# ---------------------------------------------------------------------- #
#  Internal helpers
# ---------------------------------------------------------------------- #

async def _evaluate_server(server: dict, server_id: str, server_name: str,
                           container_name: str, current_status: str,
                           status_info):
    """Evaluate a single server's container state and take action."""

    now = datetime.now(timezone.utc)
    startup_grace_until = _parse_datetime(server.get("startup_grace_until"))
    container_missing = status_info is None
    container_dead = (
        not container_missing
        and not status_info.get("running", False)
        and status_info.get("status") in ("exited", "dead")
    )

    if (container_missing or container_dead) and current_status in {"starting", "initializing"}:
        if startup_grace_until and now < startup_grace_until:
            logger.info(
                "Server %s is still within its startup grace window until %s",
                server_name,
                startup_grace_until.isoformat(),
            )
            return
        await _handle_startup_failure(server, server_id, server_name)
        return

    # --- Container crashed / disappeared while it should be running --------
    if (container_missing or container_dead) and current_status == "running":
        if startup_grace_until and now < startup_grace_until:
            logger.info(
                "Container for %s exited inside the startup grace window, delaying crash classification",
                server_name,
            )
            return
        # Before flagging as crash, check if the server is in an expected
        # restart cycle (mod download / content mounting).  Servers in the
        # "initializing" or "starting" provisioning states are expected to
        # restart during first boot.
        provisioning_state = server.get("provisioning_state", "ready")
        if provisioning_state in ("allocating", "preparing_filesystem",
                                   "writing_config", "creating_container",
                                   "starting_container", "waiting_for_profile",
                                   "discovering_sat"):
            logger.info(
                "Container for %s exited during provisioning (state=%s) — "
                "expected restart cycle, not flagging as crash",
                server_name, provisioning_state,
            )
            return

        # Also check recent logs for mod download activity
        try:
            from services.reforger_orchestrator import is_in_mod_cycle
            logs = await docker_agent.get_container_logs(container_name, tail=100)
            if is_in_mod_cycle(logs):
                logger.info(
                    "Container for %s exited during mod download cycle — "
                    "not flagging as crash",
                    server_name,
                )
                return
        except Exception:
            pass

        await _handle_crash(server, server_id, server_name, container_name)
        return

    # --- Container is running and server was still "starting" -------------
    if (not container_missing
            and status_info.get("running")
            and current_status == "starting"):
        updates = {
            "status": "running",
            "readiness_state": "ready",
            "provisioning_state": "ready",
            "startup_grace_until": None,
            "updated_at": now,
        }
        await db.managed_servers.update_one(
            {"id": server_id},
            {"$set": updates},
        )
        await sync_server_notifications({**server, **updates})
        _running_since[server_id] = now
        logger.info("Server %s transitioned from starting → running", server_name)
        return

    if (not container_missing
            and status_info.get("running")
            and current_status == "running"
            and server.get("readiness_state") in {"initializing", "degraded"}):
        updates = {
            "readiness_state": "ready",
            "provisioning_state": "ready",
            "startup_grace_until": None,
            "updated_at": now,
        }
        await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
        await sync_server_notifications({**server, **updates})

    # --- Stable-running reset: clear restart counter after 5 minutes ------
    if current_status == "running" and server_id in _restart_counts:
        started = _running_since.get(server_id)
        if started:
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            if elapsed > STABILITY_THRESHOLD_SECONDS:
                _restart_counts.pop(server_id, None)
                _running_since.pop(server_id, None)
                logger.info("Restart counter reset for %s (stable >5 min)", server_name)


async def _handle_crash(server: dict, server_id: str, server_name: str,
                        container_name: str):
    """React to a container that has crashed or gone missing."""

    # Move to error state
    updates = {
        "status": "error",
        "readiness_state": "failed",
        "startup_grace_until": None,
        "updated_at": datetime.now(timezone.utc),
    }
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": updates},
    )
    await sync_server_notifications({**server, **updates})

    # Record an auto-detected incident
    incident = _make_incident(
        server_id, server_name,
        severity="high",
        description=f"Container for server '{server_name}' crashed or exited unexpectedly.",
    )
    await db.server_incidents.insert_one(incident)
    logger.warning("Crash detected for server %s — incident %s created",
                   server_name, incident["id"])

    # Auto-restart logic
    auto_restart = server.get("auto_restart", False)
    max_attempts = server.get("max_restart_attempts", 3)
    attempts = _restart_counts.get(server_id, 0)

    if auto_restart and attempts < max_attempts:
        _restart_counts[server_id] = attempts + 1
        logger.info("Auto-restarting %s (attempt %d/%d)",
                     server_name, attempts + 1, max_attempts)

        ok, err = await docker_agent.restart_container(container_name)
        if ok:
            restart_updates = {
                "status": "starting",
                "readiness_state": "initializing",
                "startup_grace_until": datetime.now(timezone.utc) + timedelta(minutes=5),
                "updated_at": datetime.now(timezone.utc),
            }
            await db.managed_servers.update_one(
                {"id": server_id},
                {"$set": restart_updates},
            )
            await sync_server_notifications({**server, **restart_updates})
            _running_since.pop(server_id, None)
        else:
            logger.error("Restart failed for %s: %s", server_name, err)

    elif auto_restart and attempts >= max_attempts:
        # Restart budget exhausted → crash-loop
        await db.managed_servers.update_one(
            {"id": server_id},
            {"$set": {"status": "crash_loop"}},
        )
        await sync_server_notifications({**server, "status": "crash_loop"})

        critical_incident = _make_incident(
            server_id, server_name,
            severity="critical",
            description=(
                f"Server '{server_name}' has exhausted all {max_attempts} "
                f"restart attempts and entered crash-loop state."
            ),
        )
        await db.server_incidents.insert_one(critical_incident)
        logger.critical("Server %s entered crash_loop — incident %s",
                        server_name, critical_incident["id"])


def _make_incident(server_id: str, server_name: str, *,
                   severity: str, description: str) -> dict:
    """Build a standardised incident document."""
    return {
        "id": f"inc_{uuid.uuid4().hex[:12]}",
        "server_id": server_id,
        "incident_type": "crash",
        "severity": severity,
        "title": f"Container crash detected — {server_name}",
        "description": description,
        "status": "open",
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "auto_detected": True,
    }


async def _handle_startup_failure(server: dict, server_id: str, server_name: str):
    """Mark a server as failed when it never leaves the startup window."""
    updates = {
        "status": "error",
        "readiness_state": "failed",
        "startup_grace_until": None,
        "last_docker_error": "Server did not become operational before the startup grace window expired.",
        "updated_at": datetime.now(timezone.utc),
    }
    await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
    incident = {
        "id": f"inc_{uuid.uuid4().hex[:12]}",
        "server_id": server_id,
        "incident_type": "startup_failure",
        "severity": "high",
        "title": f"Startup timeout - {server_name}",
        "description": updates["last_docker_error"],
        "status": "open",
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "auto_detected": True,
    }
    await db.server_incidents.insert_one(incident)
    await sync_server_notifications({**server, **updates})
