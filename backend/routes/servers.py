"""Server Management Portal API routes.

Provides endpoints for managing Docker-based game servers, workshop mods,
mod presets, incidents, mod issue tracking, backups, scheduled actions,
webhooks, and admin notes.  All endpoints require MANAGE_SERVERS permission
(S4 Logistics and S1/Admin).
"""

import json
import logging
import asyncio
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, field_validator
from pymongo.errors import DuplicateKeyError

from database import db
from middleware.auth import get_current_user, get_current_admin
from middleware.rbac import require_permission, Permission
from services.audit_service import log_audit
from services.mongo_sanitize import sanitize_mongo_payload
from config import (
    SERVER_PORT_BASE_GAME,
    SERVER_PORT_BASE_QUERY,
    SERVER_PORT_BASE_RCON,
    SERVER_PORT_BLOCK_SIZE,
)
from services.docker_agent import DockerAgent
from services.reforger_orchestrator import (
    ProvisioningError,
    apply_runtime_defaults,
    delete_server as orchestrator_delete_server,
    get_diagnostics as orchestrator_get_diagnostics,
    prepare_server_deployment as orchestrator_prepare_server,
    provision_server as orchestrator_provision_server,
    restart_server as orchestrator_restart_server,
    start_server as orchestrator_start_server,
    stop_server as orchestrator_stop_server,
)
from services.server_config_generator import (
    ensure_required_mods,
    generate_reforger_config,
    normalize_server_config,
    write_config_file,
)
from services.server_notifications import (
    list_server_notifications,
    sync_server_notifications,
)
from services.server_logs import (
    build_log_entries,
    build_log_entry,
    get_recent_server_log_entries,
    parse_log_since,
    record_server_log_event,
    stable_hash,
    stream_server_log_entries,
)
from services.rcon_bridge import bercon_client
from services.server_runtime_host import get_server_runtime_host
from services.sat_config_service import discover_sat_config, load_sat_config, overlay_baseline_if_configured, save_sat_config
from services.server_watchers import ensure_default_watchers
from models.server import (
    ManagedServer, ServerCreate, ServerUpdate,
    WorkshopMod, WorkshopModCreate,
    ModPreset, ModPresetCreate, ModPresetUpdate,
    ServerIncident, IncidentCreate,
    ModIssue,
    ServerWatcher, ServerWatcherCreate, ServerWatcherUpdate,
    WatcherDetection,
    ServerBackup,
    ScheduledAction, ScheduledActionCreate, ScheduledActionUpdate,
    WebhookConfig, WebhookConfigCreate,
    ServerNote, ServerNoteCreate,
    SERVER_STATUSES,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Docker agent instance for container orchestration
_docker = DockerAgent()

# Shorthand dependency for all server-management endpoints
_require_servers = require_permission(Permission.MANAGE_SERVERS)

# Sensitive keys that should be redacted in API responses
_SENSITIVE_ENV_KEYS = {"rcon_password", "password", "admin_password", "steam_password"}


def _redact_env(env: dict) -> dict:
    """Return a copy of environment dict with sensitive values masked."""
    if not env:
        return env
    return {
        k: ("***" if k.lower() in _SENSITIVE_ENV_KEYS else v)
        for k, v in env.items()
    }


def _clean_string_list(values: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        item = str(value or "").strip()
        if not item:
            continue
        marker = item.lower()
        if marker in seen:
            continue
        seen.add(marker)
        cleaned.append(item)
    return cleaned


def _normalize_server_contract(server: dict) -> dict:
    """Normalize legacy provisioning statuses into operational/readiness fields."""
    doc = dict(server or {})
    status = doc.get("status")
    deployment_state = doc.get("deployment_state")

    if status == "provisioning_partial":
        doc["status"] = "running"
        doc["deployment_state"] = deployment_state or "created"
        doc["provisioning_state"] = "warning"
        doc["readiness_state"] = doc.get("readiness_state") or "degraded"
        if not (doc.get("provisioning_warnings") or []):
            failed = [
                stage for stage in (doc.get("provisioning_stages") or {}).values()
                if stage.get("status") == "failed"
            ]
            if failed:
                doc["provisioning_warnings"] = [
                    {
                        "stage": stage.get("name", "unknown"),
                        "message": stage.get("error") or stage.get("message") or "Stage completed with warnings",
                    }
                    for stage in failed
                ]

    if status == "provisioning_failed":
        doc["status"] = "error"
        doc["deployment_state"] = "failed"
        doc["provisioning_state"] = "failed"
        doc["readiness_state"] = "failed"

    if not doc.get("deployment_state"):
        doc["deployment_state"] = "created" if doc.get("status") not in {"error", "deletion_pending"} else "failed"

    if doc.get("status") == "running" and doc.get("provisioning_state") == "warning":
        doc["readiness_state"] = doc.get("readiness_state") or "degraded"

    return doc


def _server_response(server: dict) -> dict:
    """Prepare a server document for API response (redact secrets)."""
    if not server:
        return server
    doc = _serialize_doc(_normalize_server_contract(dict(server)))
    doc.pop("_id", None)
    if "environment" in doc:
        doc["environment"] = _redact_env(doc["environment"])
    return doc


def _validate_mission_header(config: dict) -> None:
    """Ensure missionHeader is a JSON-serializable object when provided.

    The Arma Reforger engine schema expects missionHeader inside
    game.gameProperties, but we also accept it at game level during input
    and migrate it automatically during config normalization.
    """
    game = config.get("game") if isinstance(config.get("game"), dict) else config
    mission_header = None
    if game:
        # Check canonical location first (game.gameProperties.missionHeader)
        gp = game.get("gameProperties")
        if isinstance(gp, dict) and "missionHeader" in gp:
            mission_header = gp["missionHeader"]
        # Fall back to legacy location (game.missionHeader) — will be migrated
        elif "missionHeader" in game:
            mission_header = game["missionHeader"]
    if mission_header is None:
        return
    if not isinstance(mission_header, dict):
        raise HTTPException(
            status_code=422,
            detail="missionHeader must be a JSON object (not an array, string, or primitive).",
        )
    try:
        json.dumps(mission_header, ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"missionHeader contains values that cannot be serialized to JSON: {exc}",
        )


def _find_mount_source(mounts: list[dict], destinations: tuple[str, ...]) -> Optional[str]:
    for mount in mounts or []:
        destination = mount.get("destination")
        source = mount.get("source")
        if destination in destinations and source:
            return source
    return None


def _normalize_host_path(path: Optional[str]) -> str:
    return (path or "").replace("\\", "/").rstrip("/")


def _server_scoped_path(root: Optional[str], server_id: str) -> str:
    normalized = _normalize_host_path(root)
    if not normalized or not server_id:
        return normalized
    segments = [segment for segment in normalized.split("/") if segment]
    if server_id in segments:
        return normalized
    return f"{normalized}/{server_id}"


def _derive_troubleshooting(server: dict, runtime: Optional[dict] = None) -> dict:
    runtime = runtime or {}
    mounts = runtime.get("mounts") or []
    server_id = server.get("id", "")
    volumes = server.get("volumes") or {}

    config_destinations = ("/reforger/Configs", "/app/server-configs")
    profile_destinations = ("/home/profile", "/app/profiles", "/profile", "/app/profile")
    workshop_destinations = ("/reforger/workshop", "/app/workshop")

    config_directory = _normalize_host_path(Path(server["config_path"]).parent.as_posix()) if server.get("config_path") else ""
    if not config_directory:
        config_root = _find_mount_source(mounts, config_destinations) or next(
            (host for host, container in volumes.items() if container in config_destinations),
            None,
        )
        config_directory = _server_scoped_path(config_root, server_id)

    profile_directory = _normalize_host_path(server.get("profile_path"))
    if not profile_directory:
        profile_root = _find_mount_source(mounts, profile_destinations) or next(
            (host for host, container in volumes.items() if container in profile_destinations),
            None,
        )
        profile_directory = _server_scoped_path(profile_root, server_id)

    workshop_directory = _normalize_host_path(server.get("workshop_path"))
    if not workshop_directory:
        workshop_root = _find_mount_source(mounts, workshop_destinations) or next(
            (host for host, container in volumes.items() if container in workshop_destinations),
            None,
        )
        workshop_directory = _server_scoped_path(workshop_root, server_id)

    config_file = _normalize_host_path(server.get("config_path")) or (
        f"{config_directory}/server.json" if config_directory else ""
    )
    working_directory = _normalize_host_path(runtime.get("working_dir")) or profile_directory or config_directory

    return {
        "actual_container_name": runtime.get("actual_container_name") or server.get("container_name") or server.get("name", ""),
        "requested_container_name": server.get("container_name") or server.get("name", ""),
        "working_directory": working_directory,
        "config_directory": config_directory,
        "config_file": config_file,
        "profile_directory": profile_directory,
        "workshop_directory": workshop_directory,
        "cd_target": profile_directory or config_directory or working_directory,
        "mounts": mounts,
    }


def _merge_nested_dicts(base: dict, incoming: dict) -> dict:
    merged = dict(base or {})
    for key, value in (incoming or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_nested_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


def _parse_players_response(response: str) -> list[dict]:
    players: list[dict] = []
    for raw_line in (response or "").splitlines():
        line = raw_line.strip()
        if not line or line.lower().startswith(("players", "---", "name")):
            continue
        if "|" in line:
            parts = [part.strip() for part in line.split("|") if part.strip()]
            if len(parts) >= 2:
                name = parts[1] if parts[0].isdigit() else parts[0]
                players.append({
                    "name": name,
                    "raw": line,
                    "ping": next(
                        (int(token[:-2]) for token in parts if token.lower().endswith("ms") and token[:-2].isdigit()),
                        None,
                    ),
                })
                continue
        if line[0].isdigit():
            name = line.lstrip("0123456789.-: ").strip()
            if name:
                players.append({"name": name, "raw": line, "ping": None})
    return players


def _serialize_doc(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize_doc(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize_doc(item) for key, item in value.items()}
    return value


def _startup_grace_until(minutes: int = 6) -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)


def _notification_actor(user: dict) -> str:
    return str(user.get("username") or user.get("name") or user.get("id") or "")


def _server_summary_response(server: dict) -> dict:
    doc = _server_response(server)
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "status": doc.get("status"),
        "deployment_state": doc.get("deployment_state", "created"),
        "provisioning_state": doc.get("provisioning_state"),
        "provisioning_step": doc.get("provisioning_step"),
        "readiness_state": doc.get("readiness_state"),
        "summary_message": doc.get("summary_message", ""),
        "needs_manual_intervention": doc.get("needs_manual_intervention", False),
        "provisioning_warnings": doc.get("provisioning_warnings", []),
        "container_name": doc.get("container_name", ""),
        "docker_image": doc.get("docker_image", ""),
    }


async def _run_follow_up_provisioning(server_id: str) -> None:
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        return

    now = datetime.now(timezone.utc)
    await db.managed_servers.update_one(
        {"id": server_id},
        {
            "$set": {
                "provisioning_state": "running",
                "provisioning_step": "running",
                "summary_message": "Server deployment succeeded. Follow-up provisioning is running.",
                "updated_at": now,
            }
        },
    )
    server["provisioning_state"] = "running"
    server["provisioning_step"] = "running"

    try:
        updates = await orchestrator_provision_server(server)
        updates["config"] = generate_reforger_config({**server, **updates})
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
        await sync_server_notifications({**server, **updates})
    except ProvisioningError as exc:
        failure_updates = {
            "deployment_state": server.get("deployment_state", "created"),
            "status": "error",
            "provisioning_state": "failed",
            "provisioning_step": exc.step,
            "readiness_state": "failed",
            "last_docker_error": exc.message,
            "provisioning_stages": {
                **(server.get("provisioning_stages") or {}),
                **(exc.stages or {}),
            },
            "summary_message": f"Server deployment succeeded, but follow-up provisioning failed: {exc.message}",
            "startup_grace_until": None,
            "updated_at": datetime.now(timezone.utc),
        }
        await db.managed_servers.update_one({"id": server_id}, {"$set": failure_updates})
        await sync_server_notifications({**server, **failure_updates})
        logger.error("Follow-up provisioning failed for %s at %s: %s", server_id, exc.step, exc.message)
    except Exception as exc:
        failure_updates = {
            "deployment_state": server.get("deployment_state", "created"),
            "status": "error",
            "provisioning_state": "failed",
            "provisioning_step": "unexpected_error",
            "readiness_state": "failed",
            "last_docker_error": str(exc),
            "summary_message": f"Server deployment succeeded, but follow-up provisioning failed: {exc}",
            "updated_at": datetime.now(timezone.utc),
        }
        await db.managed_servers.update_one({"id": server_id}, {"$set": failure_updates})
        logger.error("Unexpected follow-up provisioning failure for %s: %s", server_id, exc)


# ── Server Lifecycle ─────────────────────────────────────────────────────────


async def _allocate_ports() -> dict:
    """Auto-allocate the next available port block for a new server.

    Uses configured base ports and increments by SERVER_PORT_BLOCK_SIZE for
    each existing server to avoid collisions.  Port values are validated
    against the valid 1-65535 range.
    """
    servers = await db.managed_servers.find({}, {"ports": 1, "_id": 0}).to_list(None)
    used_game = set()
    used_query = set()
    used_rcon = set()
    for s in servers:
        p = s.get("ports") or {}
        if "game" in p:
            used_game.add(int(p["game"]))
        if "query" in p:
            used_query.add(int(p["query"]))
        if "rcon" in p:
            used_rcon.add(int(p["rcon"]))

    step = SERVER_PORT_BLOCK_SIZE  # validated > 0 in config.py

    game = SERVER_PORT_BASE_GAME
    while game in used_game:
        game += step
        if game > 65535:
            raise HTTPException(status_code=409, detail="No available game ports remaining.")
    query = SERVER_PORT_BASE_QUERY
    while query in used_query:
        query += step
        if query > 65535:
            raise HTTPException(status_code=409, detail="No available query ports remaining.")
    rcon = SERVER_PORT_BASE_RCON
    while rcon in used_rcon:
        rcon += step
        if rcon > 65535:
            raise HTTPException(status_code=409, detail="No available RCON ports remaining.")

    return {"game": game, "query": query, "rcon": rcon}

@router.get("/servers")
async def list_servers(current_user: dict = Depends(_require_servers)):
    """List all managed game servers."""
    servers = await db.managed_servers.find({}, {"_id": 0}).to_list(200)
    return [_server_response(s) for s in servers]


@router.post("/servers", status_code=201)
async def create_server(
    body: ServerCreate,
    current_user: dict = Depends(get_current_admin),
):
    """Create and provision a Docker-backed Arma Reforger server."""
    max_retries = 3
    doc = None

    for attempt in range(max_retries):
        ports = await _allocate_ports()
        server = ManagedServer(
            name=body.name,
            description=body.description,
            config=body.config,
            mods=ensure_required_mods(body.mods),
            ports=ports,
            port_allocations=ports,
            tags=body.tags,
            auto_restart=body.auto_restart,
            max_restart_attempts=body.max_restart_attempts,
            log_stats_enabled=body.log_stats_enabled,
            max_fps=body.max_fps,
            startup_parameters=body.startup_parameters,
            startup_grace_until=_startup_grace_until(),
            created_by=current_user["id"],
            deployment_state="creating",
            status="created",
            provisioning_state="queued",
            provisioning_step="queued",
            readiness_state="pending",
            summary_message="Reserving deployment resources.",
        )
        doc = apply_runtime_defaults(server.model_dump())
        doc["config"] = generate_reforger_config(doc)
        try:
            await db.managed_servers.insert_one(doc)
            break
        except DuplicateKeyError:
            if attempt < max_retries - 1:
                logger.warning("Managed server create collided on attempt %d, retrying", attempt + 1)
                continue
            raise HTTPException(status_code=409, detail="Unable to reserve unique server resources")

    if doc is None:
        raise HTTPException(status_code=500, detail="Failed to create server definition")

    deployment_error = None

    try:
        updates = await orchestrator_prepare_server(doc)
        updates["config"] = generate_reforger_config({**doc, **updates})
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.managed_servers.update_one({"id": doc["id"]}, {"$set": updates})
        await sync_server_notifications({**doc, **updates})
        asyncio.create_task(_run_follow_up_provisioning(doc["id"]))
    except ProvisioningError as exc:
        failure_updates = {
            "deployment_state": "failed",
            "status": "error",
            "provisioning_state": "failed",
            "provisioning_step": exc.step,
            "readiness_state": "failed",
            "last_docker_error": exc.message,
            "provisioning_stages": exc.stages,
            "summary_message": exc.message,
            "startup_grace_until": None,
            "updated_at": datetime.now(timezone.utc),
        }
        await db.managed_servers.update_one({"id": doc["id"]}, {"$set": failure_updates})
        await sync_server_notifications({**doc, **failure_updates})
        logger.error("Provisioning failed for %s at %s: %s", doc["id"], exc.step, exc.message)
        deployment_error = failure_updates["summary_message"]

    await log_audit(
        user_id=current_user["id"],
        action_type="server_create",
        resource_type="server",
        resource_id=doc["id"],
        after={"name": doc["name"], "docker_image": doc["docker_image"]},
    )
    created = await db.managed_servers.find_one({"id": doc["id"]}, {"_id": 0})
    if deployment_error or created.get("deployment_state") != "created":
        raise HTTPException(
            status_code=500,
            detail=deployment_error or created.get("summary_message") or "Server deployment failed before the container was created.",
        )
    return _server_response(created)


@router.get("/servers/{server_id}")
async def get_server(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get full details for a single managed server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return _server_response(server)


@router.get("/servers/{server_id}/summary")
async def get_server_summary(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get the lightweight server summary used by workspace header polling."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return _server_summary_response(server)


@router.put("/servers/{server_id}")
async def update_server(
    server_id: str,
    body: ServerUpdate,
    current_user: dict = Depends(_require_servers),
):
    """Update server metadata and configuration."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "startup_parameters" in updates:
        updates["startup_parameters"] = [
            str(param).strip()
            for param in (updates.get("startup_parameters") or [])
            if str(param).strip()
        ]
    if "max_fps" in updates:
        try:
            updates["max_fps"] = max(30, int(updates["max_fps"]))
        except (TypeError, ValueError):
            updates["max_fps"] = max(30, int(server.get("max_fps") or 120))
    if "log_stats_enabled" in updates:
        updates["log_stats_enabled"] = bool(updates["log_stats_enabled"])

    if "config" in updates:
        if not isinstance(updates["config"], dict):
            raise HTTPException(status_code=400, detail="config must be a JSON object")
        _validate_mission_header(updates["config"])

    before = {k: server.get(k) for k in updates}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Store config history if config changed
    if "config" in updates and server.get("config") != updates["config"]:
        history_entry = {
            "version": len(server.get("config_history", [])) + 1,
            "config": server.get("config", {}),
            "changed_by": current_user["id"],
            "changed_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.managed_servers.update_one(
            {"id": server_id},
            {"$push": {"config_history": history_entry}},
        )

    next_mods = updates.get("mods", server.get("mods", []))
    if "mods" in updates:
        updates["mods"] = ensure_required_mods(next_mods)
        next_mods = updates["mods"]

    if "config" in updates:
        merged_config = _merge_nested_dicts(server.get("config") or {}, updates["config"])
        normalized_config = normalize_server_config(
            merged_config,
            {**server, **updates, "mods": next_mods},
        )
        updates["config"] = generate_reforger_config(
            {**server, **updates, "config": normalized_config, "mods": next_mods},
        )

    if "config" in updates or "mods" in updates:
        merged = {**server, **updates}
        ok, result = await write_config_file(merged)
        if ok:
            updates["config_path"] = result
            sat_path, sat_status = discover_sat_config(merged.get("profile_path", ""))
            updates["sat_config_path"] = sat_path or server.get("sat_config_path", "")
            updates["sat_status"] = sat_status
        else:
            raise HTTPException(status_code=400, detail=result)

    await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"],
        action_type="server_update",
        resource_type="server",
        resource_id=server_id,
        before=before,
        after=updates,
    )
    updated = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    await sync_server_notifications(updated or {})
    return _server_response(updated)


@router.delete("/servers/{server_id}")
async def delete_server(server_id: str, current_user: dict = Depends(get_current_admin)):
    """Remove a managed server. S1/Admin only."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"status": "deletion_pending", "provisioning_state": "deleting", "updated_at": datetime.now(timezone.utc)}},
    )
    await orchestrator_delete_server(server)

    await db.managed_servers.delete_one({"id": server_id})
    # Clean up related data
    await db.server_incidents.delete_many({"server_id": server_id})
    await db.server_backups.delete_many({"server_id": server_id})
    await db.server_schedules.delete_many({"server_id": server_id})
    await db.server_metrics.delete_many({"server_id": server_id})
    await db.server_notifications.delete_many({"server_id": server_id})
    await db.mod_download_history.delete_many({"server_id": server_id})

    await log_audit(
        user_id=current_user["id"],
        action_type="server_delete",
        resource_type="server",
        resource_id=server_id,
        before={"name": server.get("name")},
    )
    return {"message": "Server deleted", "id": server_id}


# ── Server Actions ───────────────────────────────────────────────────────────

class ServerActionResponse(BaseModel):
    server_id: str
    action: str
    status: str
    message: str


@router.post("/servers/{server_id}/start")
async def start_server(server_id: str, current_user: dict = Depends(_require_servers)):
    """Start or resume a managed server container."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    now = datetime.now(timezone.utc)
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {
            "status": "starting",
            "provisioning_step": "starting_container",
            "readiness_state": "initializing",
            "startup_grace_until": _startup_grace_until(),
            "updated_at": now,
        }},
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="server_start",
        resource_type="server",
        resource_id=server_id,
    )

    try:
        updates = await orchestrator_start_server(server)
        updates["last_started"] = now
        updates["status"] = "starting"
        updates["provisioning_state"] = "starting_container"
        updates["provisioning_step"] = "starting_container"
        updates["readiness_state"] = "initializing"
        updates["startup_grace_until"] = _startup_grace_until()
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
        await sync_server_notifications({**server, **updates})
        return ServerActionResponse(
            server_id=server_id,
            action="start",
            status=str(updates.get("status") or "starting"),
            message="Server start requested. Runtime readiness checks are still in progress.",
        )
    except ProvisioningError as exc:
        error = exc.message
        await db.managed_servers.update_one(
            {"id": server_id},
            {"$set": {
                "status": "error",
                "provisioning_state": "failed",
                "provisioning_step": exc.step,
                "readiness_state": "failed",
                "last_docker_error": exc.message,
                "startup_grace_until": None,
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        await sync_server_notifications({**server, "status": "error", "readiness_state": "failed", "last_docker_error": exc.message, "startup_grace_until": None})
        # Auto-create an incident for the failure
        incident = {
            "id": f"inc_{__import__('uuid').uuid4().hex[:12]}",
            "server_id": server_id,
            "incident_type": "startup_failure",
            "severity": "high",
            "title": f"Failed to start — {server.get('name', server_id)}",
            "description": f"Docker start failed: {error}",
            "status": "open",
            "detected_at": datetime.now(timezone.utc).isoformat(),
            "auto_detected": True,
        }
        await db.server_incidents.insert_one(incident)
        raise HTTPException(status_code=500, detail=f"Server start failed: {error}")


@router.post("/servers/{server_id}/stop")
async def stop_server(server_id: str, current_user: dict = Depends(_require_servers)):
    """Stop a managed server container."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    now = datetime.now(timezone.utc)
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"status": "stopping", "startup_grace_until": None, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="server_stop",
        resource_type="server",
        resource_id=server_id,
    )

    try:
        updates = await orchestrator_stop_server(server)
        updates["last_stopped"] = datetime.now(timezone.utc)
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
        await sync_server_notifications({**server, **updates})
        return ServerActionResponse(server_id=server_id, action="stop", status="stopped", message="Server stopped successfully.")
    except ProvisioningError as exc:
        await db.managed_servers.update_one(
            {"id": server_id},
            {"$set": {"status": "error", "last_docker_error": exc.message, "updated_at": datetime.now(timezone.utc)}},
        )
        await sync_server_notifications({**server, "status": "error", "last_docker_error": exc.message})
        raise HTTPException(status_code=500, detail=exc.message)


@router.post("/servers/{server_id}/restart")
async def restart_server(server_id: str, current_user: dict = Depends(_require_servers)):
    """Restart a managed server container."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    now = datetime.now(timezone.utc)
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {
            "status": "starting",
            "readiness_state": "initializing",
            "startup_grace_until": _startup_grace_until(),
            "last_started": now,
            "updated_at": now,
        }},
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="server_restart",
        resource_type="server",
        resource_id=server_id,
    )

    try:
        updates = await orchestrator_restart_server(server)
        updates["last_started"] = now
        updates["status"] = "starting"
        updates["provisioning_state"] = "starting_container"
        updates["provisioning_step"] = "starting_container"
        updates["readiness_state"] = "initializing"
        updates["startup_grace_until"] = _startup_grace_until()
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
        await sync_server_notifications({**server, **updates})
        return ServerActionResponse(
            server_id=server_id,
            action="restart",
            status=str(updates.get("status") or "starting"),
            message="Server restart requested. Runtime readiness checks are still in progress.",
        )
    except ProvisioningError as exc:
        await db.managed_servers.update_one(
            {"id": server_id},
            {"$set": {"status": "error", "last_docker_error": exc.message, "startup_grace_until": None, "updated_at": datetime.now(timezone.utc)}},
        )
        await sync_server_notifications({**server, "status": "error", "last_docker_error": exc.message, "startup_grace_until": None})
        raise HTTPException(status_code=500, detail=exc.message)


@router.get("/servers/{server_id}/status")
async def get_server_status(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get current status and health info for a server."""
    server = await db.managed_servers.find_one(
        {"id": server_id},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "last_started": 1,
         "last_stopped": 1, "auto_restart": 1, "provisioning_state": 1,
         "provisioning_step": 1, "readiness_state": 1, "last_docker_error": 1,
         "provisioning_stages": 1, "provisioning_warnings": 1},
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return _serialize_doc(_normalize_server_contract(server))


@router.get("/servers/{server_id}/diagnostics")
async def get_server_diagnostics(server_id: str, current_user: dict = Depends(_require_servers)):
    """Return container-aware diagnostics for a managed server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    diagnostics = await orchestrator_get_diagnostics(server)
    return _serialize_doc(diagnostics)


# ── Server Config ────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/config")
async def get_server_config(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get the current server configuration."""
    server = await db.managed_servers.find_one(
        {"id": server_id}, {"_id": 0, "config": 1, "config_history": 1}
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return {
        "config": server.get("config", {}),
        "history_count": len(server.get("config_history", [])),
    }


@router.get("/servers/{server_id}/config/history")
async def get_config_history(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get configuration change history."""
    server = await db.managed_servers.find_one(
        {"id": server_id}, {"_id": 0, "config_history": 1}
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return _serialize_doc(server.get("config_history", []))


@router.get("/servers/{server_id}/notifications")
async def get_server_notifications(
    server_id: str,
    include_cleared: bool = Query(False),
    current_user: dict = Depends(_require_servers),
):
    """List operational notifications for a server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0, "id": 1})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    notifications = await list_server_notifications(server_id, include_cleared=include_cleared)
    return {
        "server_id": server_id,
        "notifications": notifications,
        "count": len(notifications),
    }


@router.post("/servers/{server_id}/notifications/{notification_id}/acknowledge")
async def acknowledge_server_notification(
    server_id: str,
    notification_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Acknowledge a server notification without clearing it."""
    notification = await db.server_notifications.find_one(
        {"server_id": server_id, "id": notification_id},
        {"_id": 0},
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    now = datetime.now(timezone.utc)
    await db.server_notifications.update_one(
        {"server_id": server_id, "id": notification_id},
        {"$set": {
            "acknowledged": True,
            "acknowledged_at": now,
            "acknowledged_by": _notification_actor(current_user),
            "updated_at": now,
        }},
    )

    updated = await db.server_notifications.find_one(
        {"server_id": server_id, "id": notification_id},
        {"_id": 0},
    )
    return {
        "server_id": server_id,
        "notification": _serialize_doc(updated),
    }


@router.post("/servers/{server_id}/notifications/{notification_id}/clear")
async def clear_server_notification(
    server_id: str,
    notification_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Clear an operational notification and resolve follow-up warnings when possible."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    notification = await db.server_notifications.find_one(
        {"server_id": server_id, "id": notification_id},
        {"_id": 0},
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    now = datetime.now(timezone.utc)
    actor = _notification_actor(current_user)

    await db.server_notifications.update_one(
        {"server_id": server_id, "id": notification_id},
        {"$set": {
            "status": "cleared",
            "cleared_at": now,
            "cleared_by": actor,
            "updated_at": now,
        }},
    )

    server_updates = {}
    if notification.get("notification_type") == "provisioning.followup":
        server_updates = {
            "provisioning_warnings": [],
            "updated_at": now,
        }
        if server.get("status") == "running":
            server_updates["readiness_state"] = "ready"
            server_updates["provisioning_state"] = "ready"
            server_updates["summary_message"] = (
                "Server is operational. Provisioning follow-up items were acknowledged and cleared."
            )
        await db.managed_servers.update_one({"id": server_id}, {"$set": server_updates})
        server = {**server, **server_updates}
        await sync_server_notifications(server)

    updated = await db.server_notifications.find_one(
        {"server_id": server_id, "id": notification_id},
        {"_id": 0},
    )
    return {
        "server_id": server_id,
        "notification": _serialize_doc(updated),
        "server": _server_response(server),
    }


@router.get("/servers/{server_id}/sat-config")
async def get_sat_config(server_id: str, current_user: dict = Depends(_require_servers)):
    """Return the discovered Server Admin Tools config for a server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    sat_path = server.get("sat_config_path")
    if not sat_path:
        discovered_path, sat_status = discover_sat_config(server.get("profile_path", ""))
        if discovered_path:
            sat_path = discovered_path
            await db.managed_servers.update_one(
                {"id": server_id},
                {"$set": {"sat_config_path": discovered_path, "sat_status": sat_status, "updated_at": datetime.now(timezone.utc)}},
            )

    if not sat_path:
        return {"available": False, "status": server.get("sat_status", "missing"), "config": None}

    try:
        config = load_sat_config(sat_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read SAT config: {exc}")

    return {"available": True, "status": "discovered", "config_path": sat_path, "config": config}


class SatConfigUpdate(BaseModel):
    config: dict


@router.put("/servers/{server_id}/sat-config")
async def update_sat_config(
    server_id: str,
    body: SatConfigUpdate,
    current_user: dict = Depends(_require_servers),
):
    """Persist a structured Server Admin Tools configuration update."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    sat_path = server.get("sat_config_path")
    if not sat_path:
        discovered_path, sat_status = discover_sat_config(server.get("profile_path", ""))
        if not discovered_path:
            raise HTTPException(status_code=409, detail=f"Server Admin Tools config is not available yet ({sat_status})")
        sat_path = discovered_path
    try:
        save_sat_config(sat_path, body.config)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"sat_config_path": sat_path, "sat_status": "discovered", "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "SAT config updated", "config_path": sat_path}


def _resolve_sat_path(server: dict) -> tuple[Optional[str], str]:
    sat_path = server.get("sat_config_path")
    sat_status = server.get("sat_status", "pending")
    if sat_path:
        return sat_path, sat_status
    return discover_sat_config(server.get("profile_path", ""))


async def _load_sat_state(server: dict) -> tuple[str, dict]:
    sat_path, sat_status = _resolve_sat_path(server)
    if not sat_path:
        raise HTTPException(status_code=409, detail=f"Server Admin Tools config is not available yet ({sat_status})")
    try:
        return sat_path, load_sat_config(sat_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read SAT config: {exc}") from exc


def _get_sat_bans(config: dict) -> list[dict]:
    bans = config.get("bans")
    if isinstance(bans, list):
        normalized = []
        for index, entry in enumerate(bans):
            if isinstance(entry, dict):
                player_id = entry.get("playerId") or entry.get("id") or entry.get("guid") or ""
                reason = entry.get("reason") or ""
            else:
                player_id = str(entry or "")
                reason = ""
            if player_id:
                normalized.append({"id": player_id, "reason": reason, "index": index})
        return normalized
    if isinstance(bans, dict):
        return [
            {"id": str(player_id), "reason": str(reason or ""), "index": index}
            for index, (player_id, reason) in enumerate(bans.items())
        ]
    return []


async def _sync_workshop_mod_metadata(server_id: str, mods: list[dict], current_user: dict) -> None:
    from services.workshop_ingest import fetch_and_store_mod

    now = datetime.now(timezone.utc).isoformat()

    for mod in mods:
        mod_id = (mod.get("mod_id") or mod.get("modId") or "").strip()
        if not mod_id:
            continue
        stored = None
        try:
            stored = await fetch_and_store_mod(mod_id)
        except Exception:
            stored = None

        canonical = {
            "mod_id": mod_id,
            "name": mod.get("name") or (stored or {}).get("name") or mod_id,
            "author": mod.get("author") or (stored or {}).get("author") or "",
            "version": mod.get("version") or (stored or {}).get("version") or "",
            "description": mod.get("description") or (stored or {}).get("description") or "",
            "tags": mod.get("tags") or (stored or {}).get("tags") or [],
            "dependencies": mod.get("dependencies") or (stored or {}).get("dependencies") or [],
            "scenario_ids": mod.get("scenario_ids") or (stored or {}).get("scenario_ids") or [],
            "thumbnail_url": mod.get("thumbnail_url") or (stored or {}).get("thumbnail_url") or "",
            "workshop_url": mod.get("workshop_url") or (stored or {}).get("workshop_url") or f"https://reforger.armaplatform.com/workshop/{mod_id}",
            "metadata_source": mod.get("metadata_source") or (stored or {}).get("metadata_source") or "server_assignment",
            "last_fetched": (stored or {}).get("last_fetched") or now,
            "last_used_by_server_id": server_id,
            "last_used_by_user_id": current_user["id"],
            "last_used_at": now,
        }
        await db.workshop_mods.update_one({"mod_id": mod_id}, {"$set": canonical}, upsert=True)
        await db.mod_download_history.update_one(
            {"mod_id": mod_id, "server_id": server_id},
            {"$set": {
                "mod_id": mod_id,
                "mod_name": canonical["name"],
                "server_id": server_id,
                "downloaded_by": current_user.get("username") or current_user.get("id", ""),
                "downloaded_by_id": current_user["id"],
                "downloaded_at": now,
            }},
            upsert=True,
        )

    # Purge workshop_mods entries that are no longer active on any server.
    # This is deferred to a background task so it does not block the HTTP
    # response — the scan touches all servers and can be slow at scale.
    asyncio.create_task(_purge_stale_workshop_mods())


async def _purge_stale_workshop_mods() -> None:
    """Background task: remove workshop_mods entries not assigned to any server."""
    try:
        active_server_mods = await db.managed_servers.find({}, {"mods": 1, "_id": 0}).to_list(None)
        globally_active_ids: set[str] = set()
        for active_server in active_server_mods:
            for mod in active_server.get("mods", []):
                mod_id = (mod.get("mod_id") or mod.get("modId") or "").strip()
                if mod_id:
                    globally_active_ids.add(mod_id)

        result = await db.workshop_mods.delete_many({
            "mod_id": {"$nin": list(globally_active_ids)},
            "manually_entered": {"$ne": True},
        })
        if result.deleted_count:
            logger.info("Purged %d stale workshop_mods entries", result.deleted_count)
    except Exception as exc:
        logger.warning("_purge_stale_workshop_mods failed: %s", exc)


# Arma Reforger / BattlEye player IDs are alphanumeric identifiers (Steam IDs,
# UIDs, etc.).  They must never contain whitespace or ASCII control characters
# that could break or hijack the RCON command protocol.
_PLAYER_ID_RE = re.compile(r'^\S{1,128}$')


def _validate_player_id(player_id: str) -> str:
    """Raise ValueError if player_id contains disallowed characters."""
    if not _PLAYER_ID_RE.match(player_id):
        raise ValueError(
            "player_id must be 1 to 128 non-whitespace characters"
        )
    # Reject any ASCII control characters (0x00-0x1F, 0x7F)
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in player_id):
        raise ValueError("player_id must not contain control characters (0x00-0x1F, 0x7F)")
    return player_id


class SatBanCreate(BaseModel):
    player_id: str
    reason: str = ""

    @field_validator("player_id")
    @classmethod
    def player_id_must_be_safe(cls, value: str) -> str:
        return _validate_player_id(value)


@router.get("/servers/{server_id}/sat/status")
async def get_sat_status(server_id: str, current_user: dict = Depends(_require_servers)):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    sat_path, sat_status = _resolve_sat_path(server)
    latest_metrics = await db.server_metrics.find_one({"server_id": server_id}, {"_id": 0}, sort=[("timestamp", -1)])
    sat_config = None
    if sat_path:
        try:
            sat_config = load_sat_config(sat_path)
        except Exception:
            sat_config = None

    return _serialize_doc({
        "server_id": server_id,
        "status": server.get("status"),
        "readiness_state": server.get("readiness_state"),
        "sat_status": sat_status,
        "sat_config_path": sat_path,
        "uptime_seconds": (latest_metrics or {}).get("uptime_seconds"),
        "player_count": (latest_metrics or {}).get("player_count"),
        "server_fps": (latest_metrics or {}).get("server_fps"),
        "avg_player_ping_ms": (latest_metrics or {}).get("avg_player_ping_ms"),
        "ban_count": len(_get_sat_bans(sat_config or {})),
        "repeated_message_count": len((sat_config or {}).get("repeatedChatMessages") or []),
        "scheduled_message_count": len((sat_config or {}).get("scheduledChatMessages") or []),
    })


@router.get("/servers/{server_id}/sat/bans")
async def get_sat_bans(server_id: str, current_user: dict = Depends(_require_servers)):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    _, config = await _load_sat_state(server)
    return {"server_id": server_id, "bans": _get_sat_bans(config)}


@router.post("/servers/{server_id}/sat/bans")
async def add_sat_ban(
    server_id: str,
    body: SatBanCreate,
    current_user: dict = Depends(_require_servers),
):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    sat_path, config = await _load_sat_state(server)

    bans = _get_sat_bans(config)
    if not any(entry["id"] == body.player_id for entry in bans):
        bans.append({"id": body.player_id, "reason": body.reason})
    config["bans"] = {entry["id"]: entry.get("reason", "") for entry in bans}
    save_sat_config(sat_path, config)

    live_sync = {"executed": False, "response": "Server is offline"}
    if server.get("status") == "running":
        live_sync["executed"], live_sync["response"] = await bercon_client.execute(
            host=get_server_runtime_host(),
            port=int((server.get("ports") or {}).get("rcon", 19999)),
            password=str(((server.get("config") or {}).get("rcon") or {}).get("password") or ""),
            command=f"#ban {body.player_id}",
        )

    return {"message": "Ban added", "bans": _get_sat_bans(config), "live_sync": live_sync}


@router.delete("/servers/{server_id}/sat/bans/{player_id}")
async def remove_sat_ban(server_id: str, player_id: str, current_user: dict = Depends(_require_servers)):
    try:
        _validate_player_id(player_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    sat_path, config = await _load_sat_state(server)

    bans = [entry for entry in _get_sat_bans(config) if entry["id"] != player_id]
    config["bans"] = {entry["id"]: entry.get("reason", "") for entry in bans}
    save_sat_config(sat_path, config)
    return {"message": "Ban removed", "bans": _get_sat_bans(config)}


@router.post("/servers/{server_id}/sat/bans/sync")
async def sync_sat_bans(server_id: str, current_user: dict = Depends(_require_servers)):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    _, config = await _load_sat_state(server)
    bans = _get_sat_bans(config)
    if server.get("status") != "running":
        return {"executed": False, "detail": "Server is offline", "bans": bans}

    responses = []
    for entry in bans:
        player_id = entry["id"]
        try:
            _validate_player_id(player_id)
        except ValueError as exc:
            responses.append({"player_id": player_id, "executed": False, "response": f"Skipped: {exc}"})
            continue
        success, response = await bercon_client.execute(
            host=get_server_runtime_host(),
            port=int((server.get("ports") or {}).get("rcon", 19999)),
            password=str(((server.get("config") or {}).get("rcon") or {}).get("password") or ""),
            command=f"#ban {player_id}",
        )
        responses.append({"player_id": player_id, "executed": success, "response": response})
    return {"executed": True, "count": len(responses), "responses": responses}


@router.post("/servers/{server_id}/sat/tools/restore-defaults")
async def restore_sat_defaults(server_id: str, current_user: dict = Depends(_require_servers)):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    sat_path, _ = _resolve_sat_path(server)
    if not sat_path:
        raise HTTPException(status_code=409, detail="Server Admin Tools config is not available yet")
    if not overlay_baseline_if_configured(sat_path):
        raise HTTPException(status_code=409, detail="SAT baseline is not configured on this host")
    config = load_sat_config(sat_path)
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"sat_config_path": sat_path, "sat_status": "configured", "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "SAT defaults restored", "config": config}


@router.post("/servers/{server_id}/sat/tools/copy-from-server")
async def copy_sat_from_server(server_id: str, current_user: dict = Depends(_require_servers)):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    sat_path, config = await _load_sat_state(server)
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"sat_config_path": sat_path, "sat_status": "discovered", "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "SAT config copied from server", "config": config}


# ── Mods Management ─────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/mods")
async def get_server_mods(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get the enabled mods list for a server."""
    server = await db.managed_servers.find_one(
        {"id": server_id}, {"_id": 0, "mods": 1}
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return server.get("mods", [])


class ModListUpdate(BaseModel):
    mods: list


@router.put("/servers/{server_id}/mods")
async def update_server_mods(
    server_id: str,
    body: ModListUpdate,
    current_user: dict = Depends(_require_servers),
):
    """Update the enabled mod list for a server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    before_mods = server.get("mods", [])
    now = datetime.now(timezone.utc)
    normalized_mods = ensure_required_mods(body.mods)
    next_config = generate_reforger_config({**server, "mods": normalized_mods})
    ok, result = await write_config_file({**server, "mods": normalized_mods, "config": next_config})
    if not ok:
        raise HTTPException(status_code=400, detail=result)
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"mods": normalized_mods, "config": next_config, "config_path": result, "updated_at": now}},
    )
    await _sync_workshop_mod_metadata(server_id, normalized_mods, current_user)
    await log_audit(
        user_id=current_user["id"],
        action_type="server_mods_update",
        resource_type="server",
        resource_id=server_id,
        before={"mods": before_mods},
        after={"mods": normalized_mods},
    )
    return {"message": "Mods updated", "count": len(normalized_mods)}


class ModRef(BaseModel):
    mod_id: Optional[str] = None
    modId: Optional[str] = None
    name: Optional[str] = None


class ModValidateRequest(BaseModel):
    mods: list[ModRef]


@router.post("/servers/{server_id}/mods/validate")
async def validate_server_mods(
    server_id: str,
    body: ModValidateRequest,
    current_user: dict = Depends(_require_servers),
):
    """Validate a mod list for conflicts, missing deps, and known issues."""
    # Verify server exists
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    issues = []

    # Check for duplicates
    seen_ids = set()
    for mod in body.mods:
        mid = mod.mod_id or mod.modId or ""
        if mid in seen_ids:
            issues.append({
                "type": "duplicate",
                "severity": "warning",
                "mod_id": mid,
                "message": f"Duplicate mod: {mod.name or mid}"
            })
        seen_ids.add(mid)

    # Check for known problematic mods
    active_issues = await db.mod_issues.find(
        {"status": "active", "confidence_score": {"$gte": 0.6}}
    ).to_list(200)
    bad_mod_ids = {i["mod_id"] for i in active_issues if "mod_id" in i}
    for mod in body.mods:
        mid = mod.mod_id or mod.modId or ""
        if mid in bad_mod_ids:
            matching_issues = [i for i in active_issues if i.get("mod_id") == mid]
            issues.append({
                "type": "known_issue",
                "severity": "high",
                "mod_id": mid,
                "message": f"Mod '{mod.name or mid}' has {len(matching_issues)} active issue(s) with high confidence"
            })

    # Check for missing dependencies (batch query to avoid N+1)
    all_mod_ids = [m.mod_id or m.modId for m in body.mods if m.mod_id or m.modId]
    workshop_docs = await db.workshop_mods.find(
        {"mod_id": {"$in": all_mod_ids}}, {"_id": 0, "mod_id": 1, "dependencies": 1}
    ).to_list(500)
    ws_lookup = {d["mod_id"]: d for d in workshop_docs}

    for mod in body.mods:
        mid = mod.mod_id or mod.modId or ""
        if not mid:
            continue
        workshop_mod = ws_lookup.get(mid)
        if workshop_mod and workshop_mod.get("dependencies"):
            for dep in workshop_mod["dependencies"]:
                dep_id = dep.get("mod_id") or dep.get("modId", "")
                if dep_id and dep_id not in seen_ids:
                    issues.append({
                        "type": "missing_dependency",
                        "severity": "warning",
                        "mod_id": mid,
                        "dependency_id": dep_id,
                        "message": f"Mod '{mod.name or mid}' depends on {dep_id} which is not in the mod list"
                    })

    return {"issues": issues, "mod_count": len(body.mods), "valid": len(issues) == 0}


# ── Mod JSON Import / Export ─────────────────────────────────────────────────

class ModJsonImportRequest(BaseModel):
    mods: list[dict]


@router.post("/servers/{server_id}/mods/import-json")
async def import_mods_json(
    server_id: str,
    body: ModJsonImportRequest,
    current_user: dict = Depends(_require_servers),
):
    """Import a JSON mod list into a server, replacing its current mod list."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    before_mods = server.get("mods", [])
    normalized: list[dict] = []
    seen_mod_ids: set = set()
    for m in body.mods:
        mod_id = m.get("mod_id") or m.get("modId") or ""
        name = m.get("name") or ""
        version = m.get("version") or ""
        if not mod_id or mod_id in seen_mod_ids:
            continue
        seen_mod_ids.add(mod_id)
        entry = {
            "mod_id": mod_id,
            "name": name,
            "version": version,
            "enabled": m.get("enabled", True),
        }
        # Preserve optional fields
        for key in ("author", "tags", "scenario_ids", "description"):
            if key in m:
                entry[key] = m[key]
        normalized.append(entry)

    now = datetime.now(timezone.utc)
    next_config = generate_reforger_config({**server, "mods": normalized})
    ok, config_path = await write_config_file({**server, "mods": normalized, "config": next_config})
    if not ok:
        raise HTTPException(status_code=400, detail=config_path)
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"mods": normalized, "config": next_config, "config_path": config_path, "updated_at": now}},
    )
    await _sync_workshop_mod_metadata(server_id, normalized, current_user)
    await log_audit(
        user_id=current_user["id"],
        action_type="server_mods_import",
        resource_type="server",
        resource_id=server_id,
        before={"mods": before_mods},
        after={"mods": normalized},
    )

    # Record download history for each imported mod
    return {"message": "Mods imported", "count": len(normalized)}


@router.get("/servers/{server_id}/mods/export-json")
async def export_mods_json(
    server_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Export the current mod list of a server as JSON."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    mods = server.get("mods", [])
    return {"server_id": server_id, "server_name": server.get("name", ""), "mods": mods}


# ── Mod Download History ─────────────────────────────────────────────────────

class RecordDownloadHistoryRequest(BaseModel):
    server_id: str
    mod_id: str
    mod_name: str = ""


@router.post("/servers/mod-download-history")
async def record_download_history(
    body: RecordDownloadHistoryRequest,
    current_user: dict = Depends(_require_servers),
):
    """Record that a mod was added to a server (upsert latest download)."""
    now = datetime.now(timezone.utc).isoformat()
    await db.mod_download_history.update_one(
        {"mod_id": body.mod_id, "server_id": body.server_id},
        {"$set": {
            "mod_id": body.mod_id,
            "mod_name": body.mod_name,
            "server_id": body.server_id,
            "downloaded_by": current_user.get("username") or current_user.get("id", ""),
            "downloaded_by_id": current_user["id"],
            "downloaded_at": now,
        }},
        upsert=True,
    )
    return {"message": "Download history recorded"}


@router.get("/servers/mod-download-history")
async def get_mod_download_history(
    mod_id: Optional[str] = Query(None),
    current_user: dict = Depends(_require_servers),
):
    """Get download history for mods — optionally filtered by mod_id."""
    query_filter = {}
    if mod_id:
        query_filter["mod_id"] = mod_id
    history = await db.mod_download_history.find(
        query_filter, {"_id": 0}
    ).sort("downloaded_at", -1).to_list(500)
    return history


# ── Workshop Live Proxy (browse/search the real Workshop) ────────────────────

@router.get("/workshop/browse")
async def browse_workshop_live(
    category: str = Query("popular", description="Category: popular, newest, subscribers, versionSize"),
    page: int = Query(1, ge=1),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    current_user: dict = Depends(_require_servers),
):
    """Browse the live Arma Reforger Workshop by category with pagination."""
    from services.workshop_proxy import browse_workshop

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    result = await browse_workshop(category=category, page=page, tags=tag_list)
    return result


@router.get("/workshop/search")
async def search_workshop_live(
    q: str = Query("", description="Search query"),
    page: int = Query(1, ge=1),
    sort: str = Query("popularity", description="Sort: popularity, newest, subscribers, versionSize"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter by"),
    current_user: dict = Depends(_require_servers),
):
    """Search the live Arma Reforger Workshop with pagination."""
    from services.workshop_proxy import search_workshop

    if not q.strip():
        return {"mods": [], "total": 0, "page": page, "per_page": 16, "total_pages": 0}
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    result = await search_workshop(query=q.strip(), page=page, sort=sort, tags=tag_list)
    return result


# ── Workshop Browser (local cache) ──────────────────────────────────────────

@router.get("/servers/workshop/search")
async def search_workshop(
    q: str = Query("", description="Search query"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(_require_servers),
):
    """Search cached workshop mod metadata."""
    query_filter = {}
    if q:
        query_filter["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"mod_id": {"$regex": q, "$options": "i"}},
            {"author": {"$regex": q, "$options": "i"}},
        ]
    total = await db.workshop_mods.count_documents(query_filter)
    mods = await db.workshop_mods.find(query_filter, {"_id": 0}) \
        .skip((page - 1) * per_page) \
        .limit(per_page) \
        .to_list(per_page)
    return {"mods": mods, "total": total, "page": page, "per_page": per_page}


@router.get("/servers/workshop/mod/{mod_id}")
async def get_workshop_mod(mod_id: str, current_user: dict = Depends(_require_servers)):
    """Get cached metadata for a specific workshop mod."""
    mod = await db.workshop_mods.find_one({"mod_id": mod_id}, {"_id": 0})
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found in cache")
    return mod


@router.post("/servers/workshop/mod", status_code=201)
async def add_workshop_mod(
    body: WorkshopModCreate,
    current_user: dict = Depends(_require_servers),
):
    """Manually add or update a workshop mod entry."""
    existing = await db.workshop_mods.find_one({"mod_id": body.mod_id})
    mod = WorkshopMod(
        mod_id=body.mod_id,
        name=body.name,
        author=body.author,
        version=body.version,
        description=body.description,
        license=body.license,
        dependencies=body.dependencies,
        scenario_ids=body.scenario_ids,
        manually_entered=True,
        metadata_source="manual",
        workshop_url=f"https://reforger.armaplatform.com/workshop/{body.mod_id}",
    )
    doc = mod.model_dump()
    for key in ("last_fetched",):
        val = doc.get(key)
        if isinstance(val, datetime):
            doc[key] = val.isoformat()

    if existing:
        await db.workshop_mods.update_one({"mod_id": body.mod_id}, {"$set": doc})
        return {**doc, "action": "updated"}
    else:
        await db.workshop_mods.insert_one(doc)
        doc.pop("_id", None)
        return {**doc, "action": "created"}


class AutoFetchModRequest(BaseModel):
    mod_id: str


@router.post("/servers/workshop/mod/fetch", status_code=201)
async def auto_fetch_workshop_mod(
    body: AutoFetchModRequest,
    current_user: dict = Depends(_require_servers),
):
    """Auto-fetch workshop mod metadata by mod_id from the Arma Reforger Workshop."""
    from services.workshop_ingest import fetch_and_store_mod

    result = await fetch_and_store_mod(body.mod_id)
    if result:
        result.pop("_id", None)
        return {**result, "action": "fetched"}
    else:
        raise HTTPException(status_code=502, detail="Failed to fetch mod metadata from workshop")


@router.post("/servers/workshop/mod/{mod_id}/refresh")
async def refresh_workshop_mod(
    mod_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Re-fetch metadata for an existing workshop mod."""
    from services.workshop_ingest import fetch_mod_metadata

    existing = await db.workshop_mods.find_one({"mod_id": mod_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Mod not found")

    result = await fetch_mod_metadata(mod_id)
    if result:
        return {"mod_id": mod_id, "refreshed": True, "metadata": result}
    else:
        return {"mod_id": mod_id, "refreshed": False, "message": "Could not refresh metadata"}


# ── Mod Presets ──────────────────────────────────────────────────────────────

@router.get("/servers/presets")
async def list_presets(current_user: dict = Depends(_require_servers)):
    """List all mod presets."""
    presets = await db.mod_presets.find({}, {"_id": 0}).to_list(200)
    return presets


@router.post("/servers/presets", status_code=201)
async def create_preset(
    body: ModPresetCreate,
    current_user: dict = Depends(_require_servers),
):
    """Create a new mod preset."""
    preset = ModPreset(
        name=body.name,
        description=body.description,
        mods=body.mods,
        scenario_id=body.scenario_id,
        created_by=current_user["id"],
    )
    doc = preset.model_dump()
    for key in ("created_at", "updated_at"):
        val = doc.get(key)
        if isinstance(val, datetime):
            doc[key] = val.isoformat()
    await db.mod_presets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/servers/presets/{preset_id}")
async def get_preset(preset_id: str, current_user: dict = Depends(_require_servers)):
    """Get a specific mod preset."""
    preset = await db.mod_presets.find_one({"id": preset_id}, {"_id": 0})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    return preset


@router.put("/servers/presets/{preset_id}")
async def update_preset(
    preset_id: str,
    body: ModPresetUpdate,
    current_user: dict = Depends(_require_servers),
):
    """Update a mod preset."""
    preset = await db.mod_presets.find_one({"id": preset_id})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.mod_presets.update_one({"id": preset_id}, {"$set": updates})
    updated = await db.mod_presets.find_one({"id": preset_id}, {"_id": 0})
    return updated


@router.delete("/servers/presets/{preset_id}")
async def delete_preset(preset_id: str, current_user: dict = Depends(_require_servers)):
    """Delete a mod preset."""
    preset = await db.mod_presets.find_one({"id": preset_id})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    await db.mod_presets.delete_one({"id": preset_id})
    return {"message": "Preset deleted", "id": preset_id}


# ── Incidents ────────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/incidents")
async def list_incidents(
    server_id: str,
    status: Optional[str] = Query(None),
    current_user: dict = Depends(_require_servers),
):
    """List incidents for a server."""
    query = {"server_id": server_id}
    if status:
        query["status"] = status
    incidents = await db.server_incidents.find(query, {"_id": 0}) \
        .sort("detected_at", -1).to_list(200)
    return incidents


@router.post("/servers/{server_id}/incidents", status_code=201)
async def create_incident(
    server_id: str,
    body: IncidentCreate,
    current_user: dict = Depends(_require_servers),
):
    """Manually log an incident for a server."""
    server = await db.managed_servers.find_one({"id": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    incident = ServerIncident(
        server_id=server_id,
        incident_type=body.incident_type,
        severity=body.severity,
        title=body.title,
        description=body.description,
    )
    doc = incident.model_dump()
    for key in ("detected_at", "resolved_at"):
        val = doc.get(key)
        if isinstance(val, datetime):
            doc[key] = val.isoformat()
        elif val is None:
            doc[key] = None

    await db.server_incidents.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ── Mod Issues ───────────────────────────────────────────────────────────────

@router.get("/servers/mod-issues")
async def list_mod_issues(
    status: Optional[str] = Query(None),
    current_user: dict = Depends(_require_servers),
):
    """List mod issues across all servers, sorted by confidence score."""
    query = {}
    if status:
        query["status"] = status
    issues = await db.mod_issues.find(query, {"_id": 0}) \
        .sort("confidence_score", -1).to_list(200)
    return issues


@router.get("/servers/mod-issues/{issue_id}")
async def get_mod_issue(issue_id: str, current_user: dict = Depends(_require_servers)):
    """Get a detailed mod issue with evidence."""
    issue = await db.mod_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Mod issue not found")
    return issue


class ModIssueResolve(BaseModel):
    status: str = "resolved"
    resolution_notes: str = ""


@router.post("/servers/mod-issues/{issue_id}/resolve")
async def resolve_mod_issue(
    issue_id: str,
    body: ModIssueResolve,
    current_user: dict = Depends(_require_servers),
):
    """Update the operator verdict for a mod issue."""
    issue = await db.mod_issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Mod issue not found")

    status = body.status or "resolved"
    if status not in {"active", "monitoring", "resolved", "false_positive"}:
        raise HTTPException(status_code=400, detail="Unsupported issue status")

    now = datetime.now(timezone.utc).isoformat()
    await db.mod_issues.update_one(
        {"id": issue_id},
        {"$set": {
            "status": status,
            "resolved_by": current_user["id"],
            "resolved_at": now,
            "resolution_notes": body.resolution_notes,
        }},
    )
    return {"message": "Issue updated", "id": issue_id, "status": status}


# Watchers

@router.get("/servers/{server_id}/watchers")
async def list_watchers(server_id: str, current_user: dict = Depends(_require_servers)):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0, "id": 1})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    watchers = await db.server_watchers.find({"server_id": server_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return _serialize_doc(watchers)


@router.post("/servers/{server_id}/watchers/seed-defaults", status_code=201)
async def seed_default_watchers(server_id: str, current_user: dict = Depends(_require_servers)):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0, "id": 1})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    created = await ensure_default_watchers(server_id, created_by=current_user["id"])
    watchers = await db.server_watchers.find({"server_id": server_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return _serialize_doc({
        "created": created,
        "created_count": len(created),
        "watchers": watchers,
    })


@router.post("/servers/{server_id}/watchers", status_code=201)
async def create_watcher(
    server_id: str,
    body: ServerWatcherCreate,
    current_user: dict = Depends(_require_servers),
):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    watcher = ServerWatcher(
        server_id=server_id,
        name=body.name,
        type=body.type,
        enabled=body.enabled,
        notify=body.notify,
        pattern=body.pattern,
        metric=body.metric,
        comparison=body.comparison,
        threshold=body.threshold,
        severity=body.severity,
        source_category=body.source_category,
        description=body.description,
        template_key=body.template_key,
        system_managed=body.system_managed,
        recommended_actions=_clean_string_list(body.recommended_actions),
        created_by=current_user["id"],
    )
    doc = _serialize_doc(watcher.model_dump())
    await db.server_watchers.insert_one(doc)
    return doc


@router.put("/servers/{server_id}/watchers/{watcher_id}")
async def update_watcher(
    server_id: str,
    watcher_id: str,
    body: ServerWatcherUpdate,
    current_user: dict = Depends(_require_servers),
):
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No watcher changes provided")
    if "recommended_actions" in updates:
        updates["recommended_actions"] = _clean_string_list(updates.get("recommended_actions"))
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.server_watchers.update_one({"id": watcher_id, "server_id": server_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Watcher not found")
    watcher = await db.server_watchers.find_one({"id": watcher_id, "server_id": server_id}, {"_id": 0})
    return _serialize_doc(watcher)


@router.delete("/servers/{server_id}/watchers/{watcher_id}")
async def delete_watcher(server_id: str, watcher_id: str, current_user: dict = Depends(_require_servers)):
    result = await db.server_watchers.delete_one({"id": watcher_id, "server_id": server_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Watcher not found")
    return {"message": "Watcher deleted", "id": watcher_id}


@router.get("/servers/{server_id}/detections")
async def list_server_detections(
    server_id: str,
    status: Optional[str] = Query(None),
    current_user: dict = Depends(_require_servers),
):
    query = {"server_id": server_id}
    if status:
        query["status"] = status
    detections = await db.server_detections.find(query, {"_id": 0}).sort("last_seen", -1).to_list(200)
    return _serialize_doc(detections)


class DetectionVerdictUpdate(BaseModel):
    status: str
    verdict_notes: str = ""


@router.post("/servers/detections/{detection_id}/verdict")
async def update_detection_verdict(
    detection_id: str,
    body: DetectionVerdictUpdate,
    current_user: dict = Depends(_require_servers),
):
    if body.status not in {"active", "monitoring", "resolved", "false_positive"}:
        raise HTTPException(status_code=400, detail="Unsupported detection status")
    result = await db.server_detections.update_one(
        {"id": detection_id},
        {"$set": {
            "status": body.status,
            "verdict_notes": body.verdict_notes,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Detection not found")
    detection = await db.server_detections.find_one({"id": detection_id}, {"_id": 0})
    return _serialize_doc(detection)


@router.get("/servers/{server_id}/reports/summary")
async def get_server_report_summary(server_id: str, current_user: dict = Depends(_require_servers)):
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    detections = await db.server_detections.find({"server_id": server_id}, {"_id": 0}).sort("last_seen", -1).to_list(100)
    incidents = await db.server_incidents.find({"server_id": server_id}, {"_id": 0}).sort("detected_at", -1).to_list(100)
    backups = await db.server_backups.find({"server_id": server_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    watchers = await db.server_watchers.find({"server_id": server_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    relevant_mod_issues = await db.mod_issues.find({"affected_servers.server_id": server_id}, {"_id": 0}).sort("last_seen", -1).to_list(100)
    notes = sorted(
        list(server.get("notes") or []),
        key=lambda note: str(note.get("created_at") or ""),
        reverse=True,
    )

    detection_summary = {
        "total": len(detections),
        "active": len([d for d in detections if d.get("status") == "active"]),
        "monitoring": len([d for d in detections if d.get("status") == "monitoring"]),
        "resolved": len([d for d in detections if d.get("status") == "resolved"]),
        "false_positive": len([d for d in detections if d.get("status") == "false_positive"]),
    }
    categories: dict[str, int] = {}
    detection_categories: dict[str, int] = {}
    detection_severity: dict[str, int] = {}
    for issue in relevant_mod_issues:
        categories[issue.get("source_category", "unknown")] = categories.get(issue.get("source_category", "unknown"), 0) + 1
    for detection in detections:
        category = str(detection.get("source_category") or "unknown")
        severity = str(detection.get("severity") or "medium")
        detection_categories[category] = detection_categories.get(category, 0) + 1
        detection_severity[severity] = detection_severity.get(severity, 0) + 1

    note_categories: dict[str, int] = {}
    for note in notes:
        category = str(note.get("category") or "general")
        note_categories[category] = note_categories.get(category, 0) + 1

    watcher_summary = {
        "total": len(watchers),
        "enabled": len([watcher for watcher in watchers if watcher.get("enabled") is not False]),
        "system_managed": len([watcher for watcher in watchers if watcher.get("system_managed")]),
    }

    return _serialize_doc({
        "server_id": server_id,
        "server": _server_summary_response(server),
        "detections": detections[:25],
        "mod_issues": relevant_mod_issues[:25],
        "incidents": incidents[:25],
        "backups": backups[:25],
        "watchers": watchers[:25],
        "notes": notes[:25],
        "summary": {
            "detections": detection_summary,
            "detection_categories": detection_categories,
            "detection_severity": detection_severity,
            "incidents": {
                "total": len(incidents),
                "open": len([i for i in incidents if i.get("status") == "open"]),
            },
            "mod_issue_categories": categories,
            "backups": len(backups),
            "watchers": watcher_summary,
            "notes": {
                "total": len(notes),
                "open": len([note for note in notes if note.get("status") not in {"resolved", "archived"}]),
                "follow_up_required": len([note for note in notes if note.get("follow_up_required")]),
                "by_category": note_categories,
            },
        },
    })


# ── Backups ──────────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/backups")
async def list_backups(server_id: str, current_user: dict = Depends(_require_servers)):
    """List backups for a server."""
    backups = await db.server_backups.find(
        {"server_id": server_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return backups


@router.post("/servers/{server_id}/backups", status_code=201)
async def create_backup(server_id: str, current_user: dict = Depends(_require_servers)):
    """Create a backup snapshot for a server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    backup = ServerBackup(
        server_id=server_id,
        backup_type="manual",
        config_snapshot=server.get("config", {}),
        mods_snapshot=server.get("mods", []),
        created_by=current_user["id"],
    )
    doc = backup.model_dump()
    for key in ("created_at",):
        val = doc.get(key)
        if isinstance(val, datetime):
            doc[key] = val.isoformat()

    await db.server_backups.insert_one(doc)
    doc.pop("_id", None)
    await log_audit(
        user_id=current_user["id"],
        action_type="backup_create",
        resource_type="server",
        resource_id=server_id,
        metadata={"backup_id": backup.id},
    )
    return doc


# ── Server Notes ─────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/notes")
async def get_server_notes(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get admin notes for a server."""
    server = await db.managed_servers.find_one(
        {"id": server_id}, {"_id": 0, "notes": 1}
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    notes = sorted(
        list(server.get("notes") or []),
        key=lambda note: str(note.get("created_at") or ""),
        reverse=True,
    )
    return notes


@router.post("/servers/{server_id}/notes", status_code=201)
async def add_server_note(
    server_id: str,
    body: ServerNoteCreate,
    current_user: dict = Depends(_require_servers),
):
    """Add an admin note to a server."""
    server = await db.managed_servers.find_one({"id": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    note = ServerNote(
        author_id=current_user["id"],
        author_name=current_user.get("username", ""),
        title=str(body.title or "").strip(),
        category=body.category,
        status=body.status,
        priority=body.priority,
        tags=_clean_string_list(body.tags),
        related_mods=_clean_string_list(body.related_mods),
        requested_actions=_clean_string_list(body.requested_actions),
        follow_up_required=bool(body.follow_up_required),
        event_at=body.event_at,
        content=body.content,
    )
    note_doc = note.model_dump()
    for key in ("created_at", "updated_at", "event_at"):
        val = note_doc.get(key)
        if isinstance(val, datetime):
            note_doc[key] = val.isoformat()

    await db.managed_servers.update_one(
        {"id": server_id},
        {"$push": {"notes": note_doc}},
    )
    return note_doc


# ── RCON Console ─────────────────────────────────────────────────────────────

class RconCommand(BaseModel):
    command: str


@router.get("/servers/{server_id}/rcon/status")
async def get_rcon_status(server_id: str, current_user: dict = Depends(_require_servers)):
    """Probe BattlEye RCON availability for a running server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.get("status") != "running":
        return {"state": "offline", "detail": "Server is not running"}

    rcon = (server.get("config") or {}).get("rcon") or {}
    status = await bercon_client.probe(
        host=get_server_runtime_host(),
        port=int((server.get("ports") or {}).get("rcon", 19999)),
        password=str(rcon.get("password") or ""),
    )
    return status


@router.post("/servers/{server_id}/rcon")
async def execute_rcon(
    server_id: str,
    body: RconCommand,
    current_user: dict = Depends(_require_servers),
):
    """Execute an RCON command on a server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    if server.get("status") != "running":
        raise HTTPException(status_code=400, detail="Server is not running")

    await log_audit(
        user_id=current_user["id"],
        action_type="rcon_command",
        resource_type="server",
        resource_id=server_id,
        metadata={"command": body.command[:500]},
    )

    ports = server.get("ports", {})
    rcon_port = int(ports.get("rcon", 19999))
    rcon_password = str(((server.get("config") or {}).get("rcon") or {}).get("password") or "")

    success, response = False, "RCON execution failed unexpectedly"
    try:
        success, response = await asyncio.wait_for(
            bercon_client.execute(
                host=get_server_runtime_host(),
                port=rcon_port,
                password=rcon_password,
                command=body.command,
            ),
            timeout=15,
        )
    except asyncio.TimeoutError:
        success, response = False, "RCON command timed out after 15 seconds"
    except Exception:
        logger.exception("RCON execution error for server %s", server_id)
        success, response = False, "RCON execution failed"

    await record_server_log_event(
        server_id,
        source="rcon:command",
        line=f"> {body.command}",
        metadata={"success": success},
    )
    if response:
        await record_server_log_event(
            server_id,
            source="rcon:response",
            line=response[:4000],
            raw=response[:4000],
            metadata={"success": success, "command": body.command[:500]},
        )

    return {
        "server_id": server_id,
        "command": body.command,
        "response": response,
        "executed": success,
    }


# ── Scheduled Actions ────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/schedules")
async def list_schedules(server_id: str, current_user: dict = Depends(_require_servers)):
    """List scheduled actions for a server."""
    schedules = await db.server_schedules.find(
        {"server_id": server_id}, {"_id": 0}
    ).to_list(100)
    return _serialize_doc(schedules)


@router.post("/servers/{server_id}/schedules", status_code=201)
async def create_schedule(
    server_id: str,
    body: ScheduledActionCreate,
    current_user: dict = Depends(_require_servers),
):
    """Create a scheduled action for a server."""
    server = await db.managed_servers.find_one({"id": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if body.action_type not in {"restart", "start", "stop", "downtime_window"}:
        raise HTTPException(status_code=400, detail="Unsupported action type")
    if body.action_type == "downtime_window" and not body.downtime_minutes:
        raise HTTPException(status_code=400, detail="Downtime schedules require downtime_minutes")

    action = ScheduledAction(
        server_id=server_id,
        action_type=body.action_type,
        schedule=body.schedule,
        timezone=body.timezone,
        enabled=body.enabled,
        downtime_minutes=body.downtime_minutes,
        created_by=current_user["id"],
    )
    doc = action.model_dump()

    from services.schedule_executor import parse_next_run
    doc["next_run"] = parse_next_run(body.schedule, body.timezone)

    await db.server_schedules.insert_one(doc)
    doc.pop("_id", None)
    return _serialize_doc(doc)


@router.put("/servers/{server_id}/schedules/{schedule_id}")
async def update_schedule(
    server_id: str,
    schedule_id: str,
    body: ScheduledActionUpdate,
    current_user: dict = Depends(_require_servers),
):
    schedule = await db.server_schedules.find_one({"id": schedule_id, "server_id": server_id}, {"_id": 0})
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No schedule changes provided")

    from services.schedule_executor import parse_next_run
    action_type = updates.get("action_type", schedule.get("action_type"))
    if action_type not in {"restart", "start", "stop", "downtime_window"}:
        raise HTTPException(status_code=400, detail="Unsupported action type")
    if action_type == "downtime_window" and not updates.get("downtime_minutes", schedule.get("downtime_minutes")):
        raise HTTPException(status_code=400, detail="Downtime schedules require downtime_minutes")

    schedule_expr = updates.get("schedule", schedule.get("schedule"))
    timezone_name = updates.get("timezone", schedule.get("timezone", "UTC"))
    updates["next_run"] = parse_next_run(schedule_expr, timezone_name)
    updates["updated_at"] = datetime.now(timezone.utc)
    await db.server_schedules.update_one({"id": schedule_id, "server_id": server_id}, {"$set": updates})
    updated = await db.server_schedules.find_one({"id": schedule_id, "server_id": server_id}, {"_id": 0})
    return _serialize_doc(updated)


@router.delete("/servers/{server_id}/schedules/{schedule_id}")
async def delete_schedule(
    server_id: str,
    schedule_id: str,
    current_user: dict = Depends(_require_servers),
):
    result = await db.server_schedules.delete_one({"id": schedule_id, "server_id": server_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"message": "Schedule deleted", "id": schedule_id}


# ── Webhooks ─────────────────────────────────────────────────────────────────

@router.get("/servers/webhooks")
async def list_webhooks(current_user: dict = Depends(_require_servers)):
    """List configured notification webhooks."""
    webhooks = await db.server_webhooks.find({}, {"_id": 0}).to_list(50)
    return webhooks


@router.post("/servers/webhooks", status_code=201)
async def create_webhook(
    body: WebhookConfigCreate,
    current_user: dict = Depends(_require_servers),
):
    """Create a notification webhook."""
    webhook = WebhookConfig(
        name=body.name,
        url=body.url,
        events=body.events,
        enabled=body.enabled,
        created_by=current_user["id"],
    )
    doc = webhook.model_dump()
    for key in ("created_at",):
        val = doc.get(key)
        if isinstance(val, datetime):
            doc[key] = val.isoformat()
    await db.server_webhooks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/servers/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: str, current_user: dict = Depends(_require_servers)):
    """Delete a notification webhook."""
    webhook = await db.server_webhooks.find_one({"id": webhook_id})
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.server_webhooks.delete_one({"id": webhook_id})
    return {"message": "Webhook deleted", "id": webhook_id}


@router.post("/servers/webhooks/{webhook_id}/test")
async def test_webhook(webhook_id: str, current_user: dict = Depends(_require_servers)):
    """Send a test payload to a webhook URL (server-side to avoid CORS)."""
    webhook = await db.server_webhooks.find_one({"id": webhook_id}, {"_id": 0})
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    import httpx
    payload = {
        "event": "test",
        "message": "Test notification from 25VID Server Management",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook["url"], json=payload)
            return {"message": "Test sent", "status_code": resp.status_code}
    except Exception:
        return {"message": "Test failed: could not reach webhook URL", "status_code": None}


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/metrics")
async def get_server_metrics(
    server_id: str,
    period: str = Query("1h", pattern="^(1h|6h|24h|7d|30d)$"),
    resolution: str = Query("raw", pattern="^(raw|1m|5m|1h)$"),
    current_user: dict = Depends(_require_servers),
):
    """Get performance metrics for a server with time range and resolution."""
    from services.server_metrics_collector import get_metrics_range

    server = await db.managed_servers.find_one({"id": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    metrics = await get_metrics_range(server_id, period=period, resolution=resolution)
    latest = None
    if metrics:
        latest = metrics[-1]

    return {
        "server_id": server_id,
        "period": period,
        "resolution": resolution,
        "metrics": metrics,
        "latest": latest,
        "count": len(metrics),
    }


@router.get("/servers/{server_id}/metrics/summary")
async def get_server_metrics_summary(
    server_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Get latest metrics plus 24h trend summary for a server."""
    from services.server_metrics_collector import get_metrics_summary

    server = await db.managed_servers.find_one({"id": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    summary = await get_metrics_summary(server_id)
    return {"server_id": server_id, **summary}


@router.get("/servers/{server_id}/logs/recent")
async def get_server_logs(
    server_id: str,
    tail: int = Query(200, ge=1, le=5000),
    since: Optional[str] = Query(None),
    current_user: dict = Depends(_require_servers),
):
    """Get recent merged logs for a server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    entries = await get_recent_server_log_entries(server, tail=tail, since=_parse_log_since(since))
    logs = "\n".join(entry.get("raw") or entry.get("line") or "" for entry in entries)
    return {
        "server_id": server_id,
        "logs": logs,
        "entries": entries,
        "lines": len(entries),
    }


# ── WebSocket: Live Log Streaming ────────────────────────────────────────────

async def _authenticate_ws(websocket: WebSocket) -> Optional[dict]:
    """Extract and verify JWT from WebSocket query param or cookie."""
    import jwt as pyjwt
    from config import JWT_SECRET, JWT_ALGORITHM, COOKIE_NAME

    token = websocket.query_params.get("token")
    if not token:
        token = websocket.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        return user
    except Exception:
        return None


_ISO_TS_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}')
_NANO_FRAC_RE = re.compile(r'(\.\d{6})\d+')


def _stable_hash(text: str) -> str:
    return stable_hash(text)


def _parse_log_line(raw_line: str, fallback_index: int) -> dict:
    return build_log_entry(raw_line, fallback_index)


def _build_log_entries(logs: str) -> list[dict]:
    return build_log_entries(logs)


def _parse_log_since(value: Optional[str]) -> Optional[int]:
    return parse_log_since(value)


@router.websocket("/ws/servers/{server_id}/logs")
async def ws_server_logs(websocket: WebSocket, server_id: str):
    """Stream merged logs in real-time via WebSocket.

    Query params:
      - token: JWT auth token
      - tail: number of initial history lines (default 100)
      - since: unix timestamp or ISO timestamp for reconnect backfill
    """
    from middleware.rbac import has_permission, Permission

    user = await _authenticate_ws(websocket)
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return

    if not has_permission(user.get("role", ""), Permission.MANAGE_SERVERS):
        await websocket.close(code=4003, reason="Insufficient permissions")
        return

    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        await websocket.close(code=4004, reason="Server not found")
        return

    await websocket.accept()

    tail = int(websocket.query_params.get("tail", "100"))
    since = _parse_log_since(websocket.query_params.get("since"))
    seen_cursors: set[str] = set()

    try:
        await websocket.send_json({
            "type": "status",
            "state": "connected",
            "server_id": server_id,
        })

        initial_entries = await get_recent_server_log_entries(server, tail=tail, since=since)
        for entry in initial_entries:
            seen_cursors.add(entry["cursor"])
            await websocket.send_json({
                "type": "log",
                "cursor": entry["cursor"],
                "timestamp": entry["timestamp"],
                "line": entry["line"],
                "raw": entry["raw"],
                "source": entry.get("source", "docker"),
                "stream": entry.get("stream", entry.get("source", "docker")),
            })
            since = max(since or 0, _parse_log_since(entry["timestamp"]) or 0)

        async for entry in stream_server_log_entries(server, tail=0, since=since):
            if entry["cursor"] in seen_cursors:
                continue
            seen_cursors.add(entry["cursor"])
            if len(seen_cursors) > 4000:
                seen_cursors.clear()
                seen_cursors.add(entry["cursor"])
            await websocket.send_json({
                "type": "log",
                "cursor": entry["cursor"],
                "timestamp": entry["timestamp"],
                "line": entry["line"],
                "raw": entry["raw"],
                "source": entry.get("source", "docker"),
                "stream": entry.get("stream", entry.get("source", "docker")),
            })
            since = max(since or 0, _parse_log_since(entry["timestamp"]) or 0)

    except WebSocketDisconnect:
        logger.debug("Log stream disconnected for server %s", server_id)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.error("Log stream error for %s: %s", server_id, exc)
        try:
            await websocket.close(code=1011, reason="Internal error")
        except Exception:
            pass


@router.websocket("/ws/servers/{server_id}/rcon")
async def ws_server_rcon(websocket: WebSocket, server_id: str):
    """Interactive RCON console via WebSocket.

    Client sends JSON: {"command": "..."}
    Server responds: {"type": "response", "command": "...", "response": "...", "success": true}
    """
    from middleware.rbac import has_permission, Permission
    from services.audit_service import log_audit as ws_log_audit

    user = await _authenticate_ws(websocket)
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return

    if not has_permission(user.get("role", ""), Permission.MANAGE_SERVERS):
        await websocket.close(code=4003, reason="Insufficient permissions")
        return

    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        await websocket.close(code=4004, reason="Server not found")
        return

    if server.get("status") != "running":
        await websocket.close(code=4000, reason="Server is not running")
        return

    await websocket.accept()

    ports = server.get("ports", {})
    rcon_port = int(ports.get("rcon", 19999))
    rcon_password = str(((server.get("config") or {}).get("rcon") or {}).get("password") or "")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                import json
                msg = json.loads(raw)
                command = msg.get("command", "").strip()
            except Exception:
                command = raw.strip()

            if not command:
                continue

            # Audit log the command
            await ws_log_audit(
                user_id=user["id"],
                action_type="rcon_command",
                resource_type="server",
                resource_id=server_id,
                metadata={"command": command[:500], "via": "websocket"},
            )

            success, response = False, "RCON execution failed unexpectedly"
            try:
                success, response = await asyncio.wait_for(
                    bercon_client.execute(
                        host=get_server_runtime_host(),
                        port=rcon_port,
                        password=rcon_password,
                        command=command,
                    ),
                    timeout=15,
                )
            except asyncio.TimeoutError:
                success, response = False, "RCON command timed out after 15 seconds"
            except Exception:
                logger.exception("WS RCON execution error for %s", server_id)
                success, response = False, "RCON execution failed"

            await record_server_log_event(
                server_id,
                source="rcon:command",
                line=f"> {command}",
                metadata={"success": success, "via": "websocket"},
            )
            if response:
                await record_server_log_event(
                    server_id,
                    source="rcon:response",
                    line=response[:4000],
                    raw=response[:4000],
                    metadata={"success": success, "command": command[:500], "via": "websocket"},
                )

            await websocket.send_json({
                "type": "response",
                "command": command,
                "response": response,
                "success": success,
            })

    except WebSocketDisconnect:
        logger.debug("RCON console disconnected for server %s", server_id)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.error("RCON console error for %s: %s", server_id, exc)
        try:
            await websocket.close(code=1011, reason="Internal error")
        except Exception:
            pass


# ── BattleMetrics Proxy Endpoints ────────────────────────────────────────────

_BM_API_BASE = "https://api.battlemetrics.com"
# Optional: set BATTLEMETRICS_API_KEY env var for higher rate limits.
# The public API works without authentication for basic server queries.
_BM_API_KEY = os.environ.get("BATTLEMETRICS_API_KEY", "")
_BM_TIMEOUT = 15


def _bm_headers() -> dict:
    """Build request headers for BattleMetrics API calls."""
    headers = {"Accept": "application/json"}
    if _BM_API_KEY:
        headers["Authorization"] = f"Bearer {_BM_API_KEY}"
    return headers


def _sanitize_bm_server(server_data: dict) -> dict:
    """Extract safe fields from a BattleMetrics server JSON:API resource.

    The Arma Reforger details live under ``attributes.details.reforger``
    and mods are objects ``{modId, name, version}`` rather than flat arrays.
    """
    attrs = server_data.get("attributes", {})
    details = attrs.get("details", {})
    reforger = details.get("reforger", {})

    # Mods come as [{modId, name, version}, ...]
    raw_mods = reforger.get("mods") or []
    mods = [
        {
            "mod_id": m.get("modId", ""),
            "name": m.get("name", ""),
            "version": m.get("version", ""),
        }
        for m in raw_mods
        if isinstance(m, dict)
    ]

    return {
        "bm_id": server_data.get("id", ""),
        "name": attrs.get("name", ""),
        "ip": attrs.get("ip", ""),
        "port": attrs.get("port"),
        "players": attrs.get("players", 0),
        "max_players": attrs.get("maxPlayers", 0),
        "status": attrs.get("status", "unknown"),
        "country": attrs.get("country", ""),
        "rank": attrs.get("rank"),
        "scenario": reforger.get("scenarioName", ""),
        "version": details.get("version", ""),
        "password": details.get("password", False),
        "official": details.get("official", False),
        "battleye": reforger.get("battlEye", False),
        "mods": mods,
    }


@router.get("/servers/battlemetrics/search")
async def battlemetrics_search(
    q: str = Query("", description="Search query for server name"),
    page_key: Optional[str] = Query(None, alias="pageKey", description="Cursor for next page"),
    per_page: int = Query(25, ge=1, le=100, description="Results per page"),
    country: Optional[str] = Query(None, description="Country code filter"),
    current_user: dict = Depends(_require_servers),
):
    """Search BattleMetrics for Arma Reforger servers.

    Proxied to avoid CORS issues and to keep any API key server-side.
    Uses cursor-based pagination via ``pageKey`` (forward from ``links.next``).
    """
    import httpx

    if page_key:
        # Follow the cursor URL directly (already contains all filters)
        url = page_key
        params = None
    else:
        url = f"{_BM_API_BASE}/servers"
        params: dict = {
            "filter[game]": "reforger",
            "page[size]": str(per_page),
            "sort": "-players",
        }
        if q:
            params["filter[search]"] = q
        if country:
            params["filter[countries][]"] = country

    try:
        async with httpx.AsyncClient(timeout=_BM_TIMEOUT) as client:
            resp = await client.get(
                url,
                params=params,
                headers=_bm_headers(),
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"BattleMetrics API error: {exc.response.status_code}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach BattleMetrics API: {exc}",
        )

    data = resp.json()
    servers = [_sanitize_bm_server(s) for s in data.get("data", [])]
    links = data.get("links", {})

    return {
        "servers": servers,
        "next_page_key": links.get("next"),
        "has_next": "next" in links,
    }


@router.get("/servers/battlemetrics/{bm_server_id}")
async def battlemetrics_server_detail(
    bm_server_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Get detailed info about a BattleMetrics Arma Reforger server."""
    import httpx

    if not re.fullmatch(r"\d{1,20}", bm_server_id):
        raise HTTPException(status_code=400, detail="Invalid BattleMetrics server ID")

    try:
        async with httpx.AsyncClient(timeout=_BM_TIMEOUT) as client:
            server_resp = await client.get(
                f"{_BM_API_BASE}/servers/{bm_server_id}",
                headers=_bm_headers(),
            )
            server_resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"BattleMetrics API error: {exc.response.status_code}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach BattleMetrics API: {exc}",
        )

    payload = server_resp.json()
    server_data = payload.get("data", {})
    return _sanitize_bm_server(server_data)
