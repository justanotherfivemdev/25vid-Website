"""
Pydantic models for the Operations Planner feature.

Covers tactical map uploads, plan units (military symbols), drawings,
movement paths, path assignments, ORBAT hierarchy, and full operations
plan documents.

Coordinates use normalised values (0 → 1) so that symbol placement
remains valid when the underlying map image is resized or swapped for
a higher-resolution version.

The Operations Planner serves as the unified tactical planning system,
consolidating ORBAT creation, mortar calculations, and Reforger map
support into a single workflow.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone
import uuid


# ── Tactical Map (uploaded image) ────────────────────────────────────────────

class TacticalMap(BaseModel):
    """Metadata stored in the ``tactical_maps`` collection."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    original_filename: str
    width: int
    height: int
    file_size: int = 0
    content_type: str = "image/png"
    uploaded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TacticalMapResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    width: int
    height: int
    content_type: str
    image_url: str
    uploaded_by: str
    created_at: datetime


# ── Plan Unit (military symbol placed on the map) ───────────────────────────

class PlanUnit(BaseModel):
    """A single military symbol placement inside a plan."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    symbol_code: str = Field(
        ...,
        description="MIL-STD-2525D / APP-6D SIDC (Symbol Identification Code)",
    )
    name: str = ""
    affiliation: Literal["friendly", "hostile", "neutral", "unknown"] = "friendly"
    # Normalised position on map (0 → 1).  (0,0)=top-left, (1,1)=bottom-right.
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    rotation: float = 0.0
    scale: float = 1.0
    z_index: int = 0
    notes: str = ""
    # User-supplied geo coordinates for Global Threat Map integration
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
    location_name: str = ""


class PlanUnitCreate(BaseModel):
    symbol_code: str
    name: str = ""
    affiliation: Literal["friendly", "hostile", "neutral", "unknown"] = "friendly"
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    rotation: float = 0.0
    scale: float = 1.0
    z_index: int = 0
    notes: str = ""
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
    location_name: str = ""


# ── Drawing (vector shapes drawn on the map) ────────────────────────────────

class DrawingStyle(BaseModel):
    """Visual style for a drawing element."""
    color: str = "#C9A227"
    fill_color: Optional[str] = None
    stroke_width: float = 2.0
    opacity: float = 1.0
    line_dash: Optional[List[float]] = None


class PlanDrawing(BaseModel):
    """A drawn shape / annotation on the map (line, arrow, polygon, circle, freehand)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    drawing_type: Literal[
        "line", "arrow", "polyline", "polygon", "circle", "freehand",
        "phase_line", "boundary", "engagement_area", "objective",
    ] = "line"
    # Normalised coordinates as list of [x, y] pairs (0→1)
    coordinates: List[List[float]] = Field(default_factory=list)
    # For circles: center [x, y] and radius (normalised)
    radius: Optional[float] = None
    style: DrawingStyle = Field(default_factory=DrawingStyle)
    label: str = ""
    notes: str = ""
    z_index: int = 0


class PlanDrawingCreate(BaseModel):
    drawing_type: Literal[
        "line", "arrow", "polyline", "polygon", "circle", "freehand",
        "phase_line", "boundary", "engagement_area", "objective",
    ] = "line"
    coordinates: List[List[float]] = Field(default_factory=list)
    radius: Optional[float] = None
    style: DrawingStyle = Field(default_factory=DrawingStyle)
    label: str = ""
    notes: str = ""
    z_index: int = 0


# ── Movement Path ───────────────────────────────────────────────────────────

class MovementPath(BaseModel):
    """A movement path that units can be assigned to for animation."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    # Normalised waypoint coordinates [[x, y], ...]
    coordinates: List[List[float]] = Field(default_factory=list)
    # Duration in seconds for full traversal
    duration: float = 60.0
    style: DrawingStyle = Field(default_factory=lambda: DrawingStyle(color="#3B82F6", stroke_width=3.0))
    notes: str = ""


class MovementPathCreate(BaseModel):
    name: str = ""
    coordinates: List[List[float]] = Field(default_factory=list)
    duration: float = 60.0
    style: DrawingStyle = Field(default_factory=lambda: DrawingStyle(color="#3B82F6", stroke_width=3.0))
    notes: str = ""


# ── Path Assignment (links a unit to a movement path) ───────────────────────

class PathAssignment(BaseModel):
    """Associates a unit with a movement path for animation."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    unit_id: str
    path_id: str
    start_time: float = 0.0  # seconds offset from plan start
    mode: Literal["linked", "unlinked"] = "linked"


class PathAssignmentCreate(BaseModel):
    unit_id: str
    path_id: str
    start_time: float = 0.0
    mode: Literal["linked", "unlinked"] = "linked"


# ── ORBAT (Order of Battle) hierarchy ───────────────────────────────────────

class OrbatUnit(BaseModel):
    """A unit in the ORBAT hierarchy tree.  Children form the org chart."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    designation: str = ""
    echelon: str = "company"  # team|squad|platoon|company|battalion|regiment|brigade|division
    branch: str = "infantry"  # infantry|armor|artillery|aviation|engineer|signal|medical|logistics|recon|hq|other
    callsign: str = ""
    commander: str = ""
    personnel: str = ""
    notes: str = ""
    children: List["OrbatUnit"] = Field(default_factory=list)


# Forward-reference resolution for recursive model
OrbatUnit.model_rebuild()


# ── Mortar Firing Solution (saved context) ──────────────────────────────────

class MortarSolution(BaseModel):
    """A saved mortar calculation snapshot attached to a plan."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    faction: str = "NATO"
    ammo: str = ""
    mortar_grid: str = ""
    mortar_elevation: float = 0.0
    target_grid: str = ""
    distance: Optional[float] = None
    azimuth_mils: Optional[int] = None
    notes: str = ""


# ── Operations Plan ─────────────────────────────────────────────────────────

class OperationsPlan(BaseModel):
    """Top-level document stored in ``operations_plans``."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    map_id: str
    units: List[PlanUnit] = Field(default_factory=list)
    # ── Drawing / tactical overlays ──────────────────────────────────────
    drawings: List[PlanDrawing] = Field(default_factory=list)
    movement_paths: List[MovementPath] = Field(default_factory=list)
    path_assignments: List[PathAssignment] = Field(default_factory=list)
    # ── ORBAT hierarchy (integrated unit org chart) ──────────────────────
    orbat: List[OrbatUnit] = Field(default_factory=list)
    # ── Mortar solutions (saved calculations) ────────────────────────────
    mortar_solutions: List[MortarSolution] = Field(default_factory=list)
    # ── Publication ──────────────────────────────────────────────────────
    is_published: bool = False
    visibility_scope: Literal["all_members", "staff_only"] = "all_members"
    # ── Collaboration fields ─────────────────────────────────────────────
    is_live_session_active: bool = False
    live_session_id: Optional[str] = None
    allow_live_viewing: bool = False
    version: int = 1
    last_synced_at: Optional[datetime] = None
    # ── Threat Map integration ────────────────────────────────────────────
    threat_map_link: Optional[str] = None  # optional link to a threat map event
    geo_lat: Optional[float] = None  # optional geo coordinates for map overlay
    geo_lng: Optional[float] = None
    # ── Audit ────────────────────────────────────────────────────────────
    created_by: str
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OperationsPlanCreate(BaseModel):
    title: str
    description: str = ""
    map_id: str
    units: List[PlanUnitCreate] = Field(default_factory=list)
    drawings: List[PlanDrawingCreate] = Field(default_factory=list)
    movement_paths: List[MovementPathCreate] = Field(default_factory=list)
    path_assignments: List[PathAssignmentCreate] = Field(default_factory=list)
    is_published: bool = False
    visibility_scope: Literal["all_members", "staff_only"] = "all_members"
    allow_live_viewing: bool = False
    threat_map_link: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None


class OperationsPlanUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    map_id: Optional[str] = None
    units: Optional[List[PlanUnitCreate]] = None
    drawings: Optional[List[PlanDrawingCreate]] = None
    movement_paths: Optional[List[MovementPathCreate]] = None
    path_assignments: Optional[List[PathAssignmentCreate]] = None
    is_published: Optional[bool] = None
    visibility_scope: Optional[Literal["all_members", "staff_only"]] = None
    allow_live_viewing: Optional[bool] = None
    threat_map_link: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None
