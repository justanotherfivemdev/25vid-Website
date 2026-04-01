"""Data models for the Server Management Portal.

Covers managed game servers, workshop mods, mod presets, incidents,
mod issue tracking, backups, scheduled actions, webhooks, and admin notes.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid


# ── Managed Server ───────────────────────────────────────────────────────────

SERVER_STATUSES = [
    "created", "starting", "running", "stopping",
    "stopped", "error", "crash_loop",
]


class ManagedServer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    docker_image: str = "rouhim/arma-reforger-server"
    container_name: str = ""
    status: str = "created"
    config: Dict = Field(default_factory=dict)
    config_history: List[Dict] = Field(default_factory=list)
    mods: List[Dict] = Field(default_factory=list)
    ports: Dict = Field(default_factory=lambda: {
        "game": 2001,
        "query": 17777,
        "rcon": 19999,
    })
    environment: Dict = Field(default_factory=dict)
    volumes: Dict = Field(default_factory=dict)
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_started: Optional[datetime] = None
    last_stopped: Optional[datetime] = None
    health_check_interval: int = 15
    auto_restart: bool = True
    max_restart_attempts: int = 3
    tags: List[str] = Field(default_factory=list)
    notes: List[Dict] = Field(default_factory=list)


class ServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    docker_image: str = "rouhim/arma-reforger-server"
    config: Dict = Field(default_factory=dict)
    mods: List[Dict] = Field(default_factory=list)
    ports: Dict = Field(default_factory=lambda: {
        "game": 2001,
        "query": 17777,
        "rcon": 19999,
    })
    environment: Dict = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    auto_restart: bool = True
    max_restart_attempts: int = 3


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict] = None
    mods: Optional[List[Dict]] = None
    ports: Optional[Dict] = None
    environment: Optional[Dict] = None
    tags: Optional[List[str]] = None
    auto_restart: Optional[bool] = None
    max_restart_attempts: Optional[int] = None


# ── Workshop Mod ─────────────────────────────────────────────────────────────

class WorkshopMod(BaseModel):
    model_config = ConfigDict(extra="ignore")
    mod_id: str
    name: str
    author: str = ""
    version: str = ""
    description: str = ""
    license: str = ""
    dependencies: List[Dict] = Field(default_factory=list)
    scenario_ids: List[str] = Field(default_factory=list)
    thumbnail_url: str = ""
    workshop_url: str = ""
    last_fetched: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    manually_entered: bool = False
    metadata_source: str = "manual"


class WorkshopModCreate(BaseModel):
    mod_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    author: str = ""
    version: str = ""
    description: str = ""
    license: str = ""
    dependencies: List[Dict] = Field(default_factory=list)
    scenario_ids: List[str] = Field(default_factory=list)


# ── Mod Preset ───────────────────────────────────────────────────────────────

class ModPreset(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    mods: List[Dict] = Field(default_factory=list)
    scenario_id: str = ""
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ModPresetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    mods: List[Dict] = Field(default_factory=list)
    scenario_id: str = ""


class ModPresetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    mods: Optional[List[Dict]] = None
    scenario_id: Optional[str] = None


# ── Server Incident ──────────────────────────────────────────────────────────

INCIDENT_TYPES = [
    "crash", "config_error", "startup_failure",
    "performance", "mod_error",
]

INCIDENT_STATUSES = ["open", "investigating", "resolved"]


class ServerIncident(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"inc_{uuid.uuid4().hex[:12]}")
    server_id: str
    incident_type: str = "crash"
    severity: str = "medium"
    title: str = ""
    description: str = ""
    status: str = "open"
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None
    resolution_notes: str = ""
    related_mod_issues: List[str] = Field(default_factory=list)
    log_excerpts: List[str] = Field(default_factory=list)
    auto_detected: bool = False


class IncidentCreate(BaseModel):
    server_id: str
    incident_type: str = "crash"
    severity: str = "medium"
    title: str = Field(min_length=1)
    description: str = ""


# ── Mod Issue ────────────────────────────────────────────────────────────────

class ModIssue(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"mi_{uuid.uuid4().hex[:12]}")
    mod_id: str
    mod_name: str
    error_signature: str = ""
    error_pattern: str = ""
    occurrence_count: int = 0
    first_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    confidence_score: float = 0.0
    attribution_method: str = "manual"
    affected_servers: List[Dict] = Field(default_factory=list)
    evidence: List[Dict] = Field(default_factory=list)
    recommended_actions: List[str] = Field(default_factory=list)
    status: str = "active"
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: str = ""


# ── Server Backup ────────────────────────────────────────────────────────────

class ServerBackup(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"bk_{uuid.uuid4().hex[:12]}")
    server_id: str
    backup_type: str = "manual"
    file_path: str = ""
    size_bytes: int = 0
    config_snapshot: Dict = Field(default_factory=dict)
    mods_snapshot: List[Dict] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = ""


# ── Scheduled Action ─────────────────────────────────────────────────────────

class ScheduledAction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"sched_{uuid.uuid4().hex[:12]}")
    server_id: str
    action_type: str = "restart"
    schedule: str = ""
    enabled: bool = True
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ScheduledActionCreate(BaseModel):
    server_id: str
    action_type: str = "restart"
    schedule: str = Field(min_length=1)
    enabled: bool = True


# ── Webhook Config ───────────────────────────────────────────────────────────

class WebhookConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"wh_{uuid.uuid4().hex[:12]}")
    name: str
    url: str
    events: List[str] = Field(default_factory=list)
    enabled: bool = True
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WebhookConfigCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1)
    events: List[str] = Field(default_factory=list)
    enabled: bool = True


# ── Admin Note ───────────────────────────────────────────────────────────────

class ServerNote(BaseModel):
    id: str = Field(default_factory=lambda: f"note_{uuid.uuid4().hex[:12]}")
    author_id: str = ""
    author_name: str = ""
    content: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ServerNoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
