from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, List
from datetime import datetime, timezone
import uuid


class SharedPost(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    post_type: Literal["announcement", "coordination", "joint_operation", "planning"] = "announcement"
    author_id: str
    author_name: str
    author_unit: Optional[str] = None
    visibility: Literal["all", "25th_only", "partners_only"] = "all"
    is_pinned: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None


class SharedPostCreate(BaseModel):
    title: str
    content: str
    post_type: Literal["announcement", "coordination", "joint_operation", "planning"] = "announcement"
    visibility: Literal["all", "25th_only", "partners_only"] = "all"
    is_pinned: bool = False


class LiaisonContact(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str
    unit: str
    discord_username: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class LiaisonContactCreate(BaseModel):
    name: str
    role: str
    unit: str
    discord_username: Optional[str] = None
    notes: Optional[str] = None
