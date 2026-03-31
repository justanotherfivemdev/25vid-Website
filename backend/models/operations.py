from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone
import uuid


class Operation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    operation_type: str
    date: str
    time: str
    max_participants: Optional[int] = None
    logo_url: Optional[str] = None
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    is_public_recruiting: bool = False
    activity_state: Literal["planned", "ongoing", "completed"] = "planned"
    rsvps: List[dict] = Field(default_factory=list)
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Discord sync fields
    external_id: Optional[str] = None
    attendees: List[dict] = Field(default_factory=list)


class OperationCreate(BaseModel):
    title: str
    description: str
    operation_type: str
    date: str
    time: str
    max_participants: Optional[int] = None
    logo_url: Optional[str] = None
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    is_public_recruiting: bool = False
    activity_state: Literal["planned", "ongoing", "completed"] = "planned"


class RSVPSubmit(BaseModel):
    status: Literal["attending", "tentative", "not_attending"] = "attending"
    role_notes: Optional[str] = None


# --- Discord Attendance Sync models ---

class SyncOperationCreator(BaseModel):
    discord_id: str
    name: str


class SyncOperationInfo(BaseModel):
    external_id: str
    title: str
    description: Optional[str] = ""
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    created_by: Optional[SyncOperationCreator] = None


class SyncAttendee(BaseModel):
    discord_id: str
    display_name: str
    status: Literal["accepted", "declined", "tentative"]


class SyncAttendancePayload(BaseModel):
    operation: SyncOperationInfo
    attendance: List[SyncAttendee] = Field(default_factory=list)
