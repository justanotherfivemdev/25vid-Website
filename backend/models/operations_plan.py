"""
Pydantic models for the Operations Planner feature.

Covers tactical map uploads, plan units (military symbols), and full
operations plan documents.  Coordinates use normalised values (0 → 1)
so that symbol placement remains valid when the underlying map image is
resized or swapped for a higher-resolution version.
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


# ── Operations Plan ─────────────────────────────────────────────────────────

class OperationsPlan(BaseModel):
    """Top-level document stored in ``operations_plans``."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    map_id: str
    units: List[PlanUnit] = Field(default_factory=list)
    is_published: bool = False
    visibility_scope: Literal["all_members", "staff_only"] = "all_members"
    # ── Collaboration fields ─────────────────────────────────────────────
    is_live_session_active: bool = False
    live_session_id: Optional[str] = None
    allow_live_viewing: bool = False
    version: int = 1
    last_synced_at: Optional[datetime] = None
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
    is_published: bool = False
    visibility_scope: Literal["all_members", "staff_only"] = "all_members"
    allow_live_viewing: bool = False


class OperationsPlanUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    map_id: Optional[str] = None
    units: Optional[List[PlanUnitCreate]] = None
    is_published: Optional[bool] = None
    visibility_scope: Optional[Literal["all_members", "staff_only"]] = None
    allow_live_viewing: Optional[bool] = None
