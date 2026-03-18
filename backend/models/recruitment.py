from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid


class OpenBillet(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    company: Optional[str] = None
    platoon: Optional[str] = None
    description: str
    requirements: Optional[str] = None
    is_open: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OpenBilletUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    platoon: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    is_open: Optional[bool] = None


class PublicApplicationCreate(BaseModel):
    billet_id: Optional[str] = None
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
    applicant_name: str
    applicant_email: EmailStr
    discord_username: Optional[str] = None
    timezone: Optional[str] = None
    experience: str
    availability: str
    why_join: str


class ApplicationReviewUpdate(BaseModel):
    status: Optional[Literal["pending", "reviewing", "accepted", "rejected"]] = None
    admin_notes: Optional[str] = None


class RecruitApplication(BaseModel):
    """Application submitted by an authenticated recruit"""
    billet_id: Optional[str] = None
    campaign_id: Optional[str] = None
    objective_id: Optional[str] = None
    operation_id: Optional[str] = None
    discord_username: Optional[str] = None
    timezone: Optional[str] = None
    experience: str
    availability: str
    why_join: str
