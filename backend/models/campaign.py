from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid


class CampaignObjective(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    status: str = "pending"
    grid_ref: str = ""
    grid_ref_type: str = "none"
    assigned_to: str = ""
    priority: str = "secondary"
    notes: str = ""
    region_label: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    linked_operation_id: Optional[str] = None
    is_public_recruiting: bool = False


class CampaignPhase(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    status: str = "planned"
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CampaignCreate(BaseModel):
    name: str
    description: str = ""
    theater: str = ""
    status: str = "planning"
    phases: List[dict] = Field(default_factory=list)
    objectives: List[dict] = Field(default_factory=list)
    situation: str = ""
    commander_notes: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    region: str = ""
    map_description: str = ""
    threat_level: str = "medium"


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    theater: Optional[str] = None
    status: Optional[str] = None
    phases: Optional[List[dict]] = None
    objectives: Optional[List[dict]] = None
    situation: Optional[str] = None
    commander_notes: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    region: Optional[str] = None
    map_description: Optional[str] = None
    threat_level: Optional[str] = None
