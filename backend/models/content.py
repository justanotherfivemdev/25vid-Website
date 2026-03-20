from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
from datetime import datetime, timezone
import uuid


class Announcement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    priority: str = "normal"
    badge_url: Optional[str] = None
    author_id: str
    author_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnnouncementCreate(BaseModel):
    title: str
    content: str
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    badge_url: Optional[str] = None


class Discussion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    title: str
    content: str
    author_id: str
    author_name: str
    replies: List[dict] = Field(default_factory=list)
    pinned: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DiscussionCreate(BaseModel):
    category: str
    title: str
    content: str


class ReplyCreate(BaseModel):
    content: str


class GalleryImage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    image_url: str
    category: str = "operation"
    uploaded_by: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GalleryImageCreate(BaseModel):
    title: str
    image_url: str
    category: Literal["operation", "training", "team", "equipment"] = "operation"

    @field_validator("image_url")
    @classmethod
    def reject_external_urls(cls, v: str) -> str:
        normalised = v.strip().lower()
        if normalised.startswith("http://") or normalised.startswith("https://"):
            raise ValueError("External image URLs are not allowed. Please upload a file instead.")
        return v.strip()


class Training(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    instructor: str
    schedule: str
    duration: str
    image_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TrainingCreate(BaseModel):
    title: str
    description: str
    instructor: str
    schedule: str
    duration: str
    image_url: Optional[str] = None
