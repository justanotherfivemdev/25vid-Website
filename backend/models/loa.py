from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid


class LOARequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: str
    start_date: str
    end_date: str
    reason: str
    notes: Optional[str] = None
    status: Literal["pending", "approved", "denied", "active", "returned", "expired"] = "pending"
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    return_date: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class LOASubmit(BaseModel):
    start_date: str
    end_date: str
    reason: str
    notes: Optional[str] = None


class LOAReview(BaseModel):
    status: Literal["approved", "denied"]
    notes: Optional[str] = None


class LOAAdminCreate(BaseModel):
    user_id: str
    start_date: str
    end_date: str
    reason: str
    notes: Optional[str] = None
