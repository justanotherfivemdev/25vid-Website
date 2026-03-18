from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone
import uuid


class IntelBriefing(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    category: str
    classification: str = "routine"
    visibility_scope: Literal["members", "admin_only"] = "members"
    tags: List[str] = Field(default_factory=list)
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
    author_id: str = ""
    author_name: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None


class IntelBriefingCreate(BaseModel):
    title: str
    content: str
    category: str
    classification: str = "routine"
    visibility_scope: Literal["members", "admin_only"] = "members"
    tags: List[str] = Field(default_factory=list)
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None


class IntelBriefingUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    classification: Optional[str] = None
    visibility_scope: Optional[Literal["members", "admin_only"]] = None
    tags: Optional[List[str]] = None
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
    theater: Optional[str] = None
    region_label: Optional[str] = None
    grid_ref: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    severity: Optional[Literal["low", "medium", "high", "critical"]] = None
