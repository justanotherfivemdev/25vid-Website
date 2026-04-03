"""Server Management Portal API routes.

Provides endpoints for managing Docker-based game servers, workshop mods,
mod presets, incidents, mod issue tracking, backups, scheduled actions,
webhooks, and admin notes.  All endpoints require MANAGE_SERVERS permission
(S4 Logistics and S1/Admin).
"""

import json
import logging
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
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
from services.rcon_bridge import bercon_client
from services.sat_config_service import discover_sat_config, load_sat_config, save_sat_config
from models.server import (
    ManagedServer, ServerCreate, ServerUpdate,
    WorkshopMod, WorkshopModCreate,
    ModPreset, ModPresetCreate, ModPresetUpdate,
    ServerIncident, IncidentCreate,
    ModIssue,
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


def _server_response(server: dict) -> dict:
    """Prepare a server document for API response (redact secrets)."""
    if not server:
        return server
    doc = _serialize_doc(dict(server))
    doc.pop("_id", None)
    if "environment" in doc:
        doc["environment"] = _redact_env(doc["environment"])
    return doc


def _validate_mission_header(config: dict) -> None:
    """Ensure missionHeader is a JSON-serializable object when provided."""
    game = config.get("game") if isinstance(config.get("game"), dict) else config
    mission_header = game.get("missionHeader") if game else None
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
            created_by=current_user["id"],
            status="initializing",
            provisioning_state="allocating",
            provisioning_step="allocating",
            readiness_state="initializing",
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

    try:
        updates = await orchestrator_provision_server(doc)
        updates["config"] = generate_reforger_config({**doc, **updates})
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.managed_servers.update_one({"id": doc["id"]}, {"$set": updates})
        # Partial success: container is running but later stages (e.g. SAT
        # config discovery, mod validation) may have failed.  The server is
        # operational with degraded capabilities rather than fully failed.
        status = updates.get("status", "")
        if status == "provisioning_partial":
            logger.warning(
                "Provisioning partially succeeded for %s: %s",
                doc["id"], updates.get("last_docker_error", ""),
            )
    except ProvisioningError as exc:
        failure_updates = {
            "status": "provisioning_failed",
            "provisioning_state": "failed",
            "provisioning_step": exc.step,
            "readiness_state": "failed",
            "last_docker_error": exc.message,
            "provisioning_stages": exc.stages,
            "updated_at": datetime.now(timezone.utc),
        }
        await db.managed_servers.update_one({"id": doc["id"]}, {"$set": failure_updates})
        logger.error("Provisioning failed for %s at %s: %s", doc["id"], exc.step, exc.message)

    await log_audit(
        user_id=current_user["id"],
        action_type="server_create",
        resource_type="server",
        resource_id=doc["id"],
        after={"name": doc["name"], "docker_image": doc["docker_image"]},
    )
    created = await db.managed_servers.find_one({"id": doc["id"]}, {"_id": 0})
    return _server_response(created)


@router.get("/servers/{server_id}")
async def get_server(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get full details for a single managed server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return _server_response(server)


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
        {"$set": {"status": "starting", "provisioning_step": "starting_container", "updated_at": now}},
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
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
        return ServerActionResponse(
            server_id=server_id,
            action="start",
            status=str(updates.get("status") or "running"),
            message="Server started successfully.",
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
                "updated_at": datetime.now(timezone.utc),
            }},
        )
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
        {"$set": {"status": "stopping", "updated_at": now}},
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
        return ServerActionResponse(server_id=server_id, action="stop", status="stopped", message="Server stopped successfully.")
    except ProvisioningError as exc:
        await db.managed_servers.update_one(
            {"id": server_id},
            {"$set": {"status": "error", "last_docker_error": exc.message, "updated_at": datetime.now(timezone.utc)}},
        )
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
        {"$set": {"status": "starting", "last_started": now, "updated_at": now}},
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
        updates["updated_at"] = datetime.now(timezone.utc)
        await db.managed_servers.update_one({"id": server_id}, {"$set": updates})
        return ServerActionResponse(
            server_id=server_id,
            action="restart",
            status=str(updates.get("status") or "running"),
            message="Server restarted successfully.",
        )
    except ProvisioningError as exc:
        await db.managed_servers.update_one(
            {"id": server_id},
            {"$set": {"status": "error", "last_docker_error": exc.message, "updated_at": datetime.now(timezone.utc)}},
        )
        raise HTTPException(status_code=500, detail=exc.message)


@router.get("/servers/{server_id}/status")
async def get_server_status(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get current status and health info for a server."""
    server = await db.managed_servers.find_one(
        {"id": server_id},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "last_started": 1,
         "last_stopped": 1, "auto_restart": 1, "provisioning_state": 1,
         "provisioning_step": 1, "readiness_state": 1, "last_docker_error": 1,
         "provisioning_stages": 1},
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return _serialize_doc(server)


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

    now = datetime.now(timezone.utc).isoformat()
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"mods": normalized, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="server_mods_import",
        resource_type="server",
        resource_id=server_id,
        before={"mods": before_mods},
        after={"mods": normalized},
    )

    # Record download history for each imported mod
    for mod in normalized:
        await db.mod_download_history.update_one(
            {"mod_id": mod["mod_id"], "server_id": server_id},
            {"$set": {
                "mod_id": mod["mod_id"],
                "mod_name": mod.get("name", ""),
                "server_id": server_id,
                "downloaded_by": current_user.get("username") or current_user.get("id", ""),
                "downloaded_by_id": current_user["id"],
                "downloaded_at": now,
            }},
            upsert=True,
        )

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
    resolution_notes: str = ""


@router.post("/servers/mod-issues/{issue_id}/resolve")
async def resolve_mod_issue(
    issue_id: str,
    body: ModIssueResolve,
    current_user: dict = Depends(_require_servers),
):
    """Mark a mod issue as resolved."""
    issue = await db.mod_issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Mod issue not found")

    now = datetime.now(timezone.utc).isoformat()
    await db.mod_issues.update_one(
        {"id": issue_id},
        {"$set": {
            "status": "resolved",
            "resolved_by": current_user["id"],
            "resolved_at": now,
            "resolution_notes": body.resolution_notes,
        }},
    )
    return {"message": "Issue resolved", "id": issue_id}


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
    return server.get("notes", [])


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
        content=body.content,
    )
    note_doc = note.model_dump()
    for key in ("created_at",):
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
        host="127.0.0.1",
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

    success, response = await bercon_client.execute(
        host="127.0.0.1",
        port=rcon_port,
        password=rcon_password,
        command=body.command,
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
    period: str = Query("1h", regex="^(1h|6h|24h|7d)$"),
    resolution: str = Query("raw", regex="^(raw|1m|5m|1h)$"),
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
    current_user: dict = Depends(_require_servers),
):
    """Get recent container logs for a server."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    container_name = server.get("container_name") or server.get("name", "")
    logs = await _docker.get_container_logs(container_name, tail=tail)
    return {
        "server_id": server_id,
        "logs": logs,
        "lines": len(logs.splitlines()) if logs else 0,
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


@router.websocket("/ws/servers/{server_id}/logs")
async def ws_server_logs(websocket: WebSocket, server_id: str):
    """Stream container logs in real-time via WebSocket.

    Query params:
      - token: JWT auth token
      - tail: number of initial history lines (default 100)
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

    container_name = server.get("container_name") or server.get("name", "")
    tail = int(websocket.query_params.get("tail", "100"))
    last_log_len = 0

    try:
        # Send initial log history
        initial_logs = await _docker.get_container_logs(container_name, tail=tail)
        if initial_logs:
            for line in initial_logs.splitlines():
                await websocket.send_json({
                    "type": "log",
                    "line": line,
                    "stream": "stdout",
                })
            last_log_len = len(initial_logs)

        # Poll for new logs every 2 seconds
        while True:
            await asyncio.sleep(2)
            new_logs = await _docker.get_container_logs(container_name, tail=50)
            if new_logs and len(new_logs) != last_log_len:
                lines = new_logs.splitlines()
                # Send only lines that are likely new
                for line in lines[-20:]:
                    await websocket.send_json({
                        "type": "log",
                        "line": line,
                        "stream": "stdout",
                    })
                last_log_len = len(new_logs)

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

            success, response = await bercon_client.execute(
                host="127.0.0.1",
                port=rcon_port,
                password=rcon_password,
                command=command,
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
