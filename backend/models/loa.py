from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid


def _validate_date_format(v: str) -> str:
    """Ensure the value is a valid YYYY-MM-DD date string."""
    try:
        datetime.strptime(v, "%Y-%m-%d")
    except (ValueError, TypeError):
        raise ValueError("Date must be in YYYY-MM-DD format")
    return v


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

    @field_validator("start_date", "end_date")
    @classmethod
    def check_date_format(cls, v: str) -> str:
        return _validate_date_format(v)


class LOASubmit(BaseModel):
    start_date: str
    end_date: str
    reason: str
    notes: Optional[str] = None

    @field_validator("start_date", "end_date")
    @classmethod
    def check_date_format(cls, v: str) -> str:
        return _validate_date_format(v)


class LOAReview(BaseModel):
    status: Literal["approved", "denied"]
    notes: Optional[str] = None


class LOAAdminCreate(BaseModel):
    user_id: str
    start_date: str
    end_date: str
    reason: str
    notes: Optional[str] = None

    @field_validator("start_date", "end_date")
    @classmethod
    def check_date_format(cls, v: str) -> str:
        return _validate_date_format(v)
