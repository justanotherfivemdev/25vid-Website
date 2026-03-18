from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


class SiteContent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default="site_content")
    hero: dict
    about: dict
    operationalSuperiority: dict
    lethality: dict
    gallery: dict
    footer: dict
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HistoryEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    year: str
    description: str
    image_url: Optional[str] = None
    image_position: str = "center"
    image_overlay_opacity: int = 60
    text_contrast_mode: str = "auto"
    campaign_type: str = "campaign"
    sort_order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HistoryEntryCreate(BaseModel):
    title: str
    year: str
    description: str
    image_url: Optional[str] = None
    image_position: str = "center"
    image_overlay_opacity: int = 60
    text_contrast_mode: str = "auto"
    campaign_type: str = "campaign"
    sort_order: int = 0


class MemberOfTheWeek(BaseModel):
    user_id: str
    username: str
    reason: str = ""
    avatar_url: Optional[str] = None
    rank: Optional[str] = None
    set_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
