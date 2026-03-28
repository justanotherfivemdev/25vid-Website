"""
User settings model.

Stores per-user preferences such as push-to-talk key bindings.
Collection: user_settings
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class UserSettings(BaseModel):
    user_id: str
    push_to_talk_key: str = Field(default="CapsLock", description="event.code value for PTT key")
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
