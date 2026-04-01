"""Server Management Portal API routes.

Provides endpoints for managing Docker-based game servers, workshop mods,
mod presets, incidents, mod issue tracking, backups, scheduled actions,
webhooks, and admin notes.  All endpoints require MANAGE_SERVERS permission
(S4 Logistics and S1/Admin).
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from database import db
from middleware.auth import get_current_user, get_current_admin
from middleware.rbac import require_permission, Permission
from services.audit_service import log_audit
from services.mongo_sanitize import sanitize_mongo_payload
from models.server import (
    ManagedServer, ServerCreate, ServerUpdate,
    WorkshopMod, WorkshopModCreate,
    ModPreset, ModPresetCreate, ModPresetUpdate,
    ServerIncident, IncidentCreate,
    ModIssue,
    ServerBackup,
    ScheduledAction, ScheduledActionCreate,
    WebhookConfig, WebhookConfigCreate,
    ServerNote, ServerNoteCreate,
    SERVER_STATUSES,
)

logger = logging.getLogger(__name__)
router = APIRouter()

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
    doc = dict(server)
    doc.pop("_id", None)
    if "environment" in doc:
        doc["environment"] = _redact_env(doc["environment"])
    return doc


# ── Server Lifecycle ─────────────────────────────────────────────────────────

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
    """Create a new managed server definition. S1/Admin only."""
    server = ManagedServer(
        name=body.name,
        description=body.description,
        docker_image=body.docker_image,
        container_name=f"25vid-gs-{body.name.lower().replace(' ', '-')[:30]}",
        config=body.config,
        mods=body.mods,
        ports=body.ports,
        environment=sanitize_mongo_payload(body.environment),
        tags=body.tags,
        auto_restart=body.auto_restart,
        max_restart_attempts=body.max_restart_attempts,
        created_by=current_user["id"],
    )
    doc = server.model_dump()
    # Convert datetime fields to ISO strings for MongoDB
    for key in ("created_at", "updated_at", "last_started", "last_stopped"):
        val = doc.get(key)
        if isinstance(val, datetime):
            doc[key] = val.isoformat()
        elif val is None:
            doc[key] = None

    await db.managed_servers.insert_one(doc)
    await log_audit(
        user_id=current_user["id"],
        action_type="server_create",
        resource_type="server",
        resource_id=server.id,
        after={"name": server.name, "docker_image": server.docker_image},
    )
    return _server_response(doc)


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

    before = {k: server.get(k) for k in updates}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    if "environment" in updates:
        updates["environment"] = sanitize_mongo_payload(updates["environment"])

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

    await db.managed_servers.delete_one({"id": server_id})
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
    """Start a managed server container."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    now = datetime.now(timezone.utc).isoformat()
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"status": "starting", "last_started": now, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="server_start",
        resource_type="server",
        resource_id=server_id,
    )
    # NOTE: Actual Docker orchestration will be handled by the server agent
    # in a future phase.  For now, update the status record.
    return ServerActionResponse(
        server_id=server_id,
        action="start",
        status="starting",
        message="Server start initiated. The server agent will handle container orchestration.",
    )


@router.post("/servers/{server_id}/stop")
async def stop_server(server_id: str, current_user: dict = Depends(_require_servers)):
    """Stop a managed server container."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    now = datetime.now(timezone.utc).isoformat()
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"status": "stopping", "last_stopped": now, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="server_stop",
        resource_type="server",
        resource_id=server_id,
    )
    return ServerActionResponse(
        server_id=server_id,
        action="stop",
        status="stopping",
        message="Server stop initiated.",
    )


@router.post("/servers/{server_id}/restart")
async def restart_server(server_id: str, current_user: dict = Depends(_require_servers)):
    """Restart a managed server container."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    now = datetime.now(timezone.utc).isoformat()
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
    return ServerActionResponse(
        server_id=server_id,
        action="restart",
        status="starting",
        message="Server restart initiated.",
    )


@router.get("/servers/{server_id}/status")
async def get_server_status(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get current status and health info for a server."""
    server = await db.managed_servers.find_one(
        {"id": server_id},
        {"_id": 0, "id": 1, "name": 1, "status": 1, "last_started": 1,
         "last_stopped": 1, "auto_restart": 1},
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return server


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
    return server.get("config_history", [])


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
    now = datetime.now(timezone.utc).isoformat()
    await db.managed_servers.update_one(
        {"id": server_id},
        {"$set": {"mods": body.mods, "updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="server_mods_update",
        resource_type="server",
        resource_id=server_id,
        before={"mods": before_mods},
        after={"mods": body.mods},
    )
    return {"message": "Mods updated", "count": len(body.mods)}


# ── Workshop Browser ─────────────────────────────────────────────────────────

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


@router.post("/servers/{server_id}/rcon")
async def execute_rcon(
    server_id: str,
    body: RconCommand,
    current_user: dict = Depends(_require_servers),
):
    """Execute an RCON command on a server. Actual RCON will be wired in a future phase."""
    server = await db.managed_servers.find_one({"id": server_id}, {"_id": 0})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    await log_audit(
        user_id=current_user["id"],
        action_type="rcon_command",
        resource_type="server",
        resource_id=server_id,
        metadata={"command": body.command[:500]},
    )
    # NOTE: Actual RCON communication will be implemented via the server agent.
    return {
        "server_id": server_id,
        "command": body.command,
        "response": "RCON bridge not yet connected. Command logged for audit.",
        "executed": False,
    }


# ── Scheduled Actions ────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/schedules")
async def list_schedules(server_id: str, current_user: dict = Depends(_require_servers)):
    """List scheduled actions for a server."""
    schedules = await db.server_schedules.find(
        {"server_id": server_id}, {"_id": 0}
    ).to_list(100)
    return schedules


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

    action = ScheduledAction(
        server_id=server_id,
        action_type=body.action_type,
        schedule=body.schedule,
        enabled=body.enabled,
        created_by=current_user["id"],
    )
    doc = action.model_dump()
    for key in ("last_run", "next_run", "created_at"):
        val = doc.get(key)
        if isinstance(val, datetime):
            doc[key] = val.isoformat()
        elif val is None:
            doc[key] = None

    await db.server_schedules.insert_one(doc)
    doc.pop("_id", None)
    return doc


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


# ── Metrics (stub) ───────────────────────────────────────────────────────────

@router.get("/servers/{server_id}/metrics")
async def get_server_metrics(server_id: str, current_user: dict = Depends(_require_servers)):
    """Get performance metrics for a server. Will be populated by the metrics collector."""
    server = await db.managed_servers.find_one({"id": server_id})
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Return recent metrics from the collection (populated by background collector)
    metrics = await db.server_metrics.find(
        {"server_id": server_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(100).to_list(100)

    return {
        "server_id": server_id,
        "metrics": metrics,
        "latest": metrics[0] if metrics else None,
    }
