"""Community intelligence events — real-world or fictional/milsim events
that can be created by admins and community members."""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, List
from datetime import datetime, timezone
import uuid

CREDIBILITY_VALUES = ("confirmed", "probable", "possible", "doubtful")
CredibilityType = Literal["confirmed", "probable", "possible", "doubtful"]


class CommunityEventLocation(BaseModel):
    latitude: float
    longitude: float
    placeName: Optional[str] = None
    country: Optional[str] = None


class CommunityEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: f"cev_{uuid.uuid4().hex[:12]}")
    title: str
    summary: str = ""
    category: str = "conflict"
    threatLevel: Literal["critical", "high", "medium", "low", "info"] = "medium"
    location: CommunityEventLocation
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    source: str = "community"
    sourceUrl: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)
    rawContent: Optional[str] = None

    # Community-specific fields
    event_nature: Literal["real", "fictional"] = "real"
    created_by: str = ""
    created_by_username: str = ""
    approved: bool = False
    visible: bool = True

    # Layer/overlay grouping
    layer: Optional[str] = None  # e.g. "infrastructure", "economic", "military"
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    operation_id: Optional[str] = None
    source_document_ids: List[str] = Field(default_factory=list)
    generation_provider: Optional[str] = None
    generation_status: Optional[str] = None
    generation_signature: Optional[str] = None
    is_simulated: bool = False
    map_worthy: Optional[bool] = None
    location_precision: Optional[str] = None

    # Admin intelligence override fields
    admin_description: Optional[str] = None
    admin_source: Optional[str] = None  # e.g. "Internal Intelligence"
    credibility: Optional[CredibilityType] = None
    admin_modified_by: Optional[str] = None
    admin_modified_at: Optional[str] = None

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class CommunityEventCreate(BaseModel):
    title: str
    summary: str = ""
    category: str = "conflict"
    threatLevel: Literal["critical", "high", "medium", "low", "info"] = "medium"
    location: CommunityEventLocation
    sourceUrl: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)
    rawContent: Optional[str] = None
    event_nature: Literal["real", "fictional"] = "real"
    layer: Optional[str] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    operation_id: Optional[str] = None
    source_document_ids: List[str] = Field(default_factory=list)
    generation_provider: Optional[str] = None
    generation_status: Optional[str] = None
    generation_signature: Optional[str] = None
    is_simulated: bool = False
    map_worthy: Optional[bool] = None
    location_precision: Optional[str] = None


class CommunityEventUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    category: Optional[str] = None
    threatLevel: Optional[Literal["critical", "high", "medium", "low", "info"]] = None
    location: Optional[CommunityEventLocation] = None
    sourceUrl: Optional[str] = None
    keywords: Optional[List[str]] = None
    rawContent: Optional[str] = None
    event_nature: Optional[Literal["real", "fictional"]] = None
    layer: Optional[str] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    operation_id: Optional[str] = None
    source_document_ids: Optional[List[str]] = None
    generation_provider: Optional[str] = None
    generation_status: Optional[str] = None
    generation_signature: Optional[str] = None
    is_simulated: Optional[bool] = None
    map_worthy: Optional[bool] = None
    location_precision: Optional[str] = None
    visible: Optional[bool] = None
    approved: Optional[bool] = None
    # Admin override fields
    admin_description: Optional[str] = None
    admin_source: Optional[str] = None
    credibility: Optional[CredibilityType] = None
