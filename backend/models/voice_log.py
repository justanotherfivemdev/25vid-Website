"""
Pydantic models for the Voice Comms system.

Voice logs are audio clips recorded during planning sessions.  Each clip
is tied to an operation plan and timestamped so it can be played back in
sync with the timeline replay system.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid


class VoiceLog(BaseModel):
    """Stored in the ``voice_logs`` collection."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    session_id: Optional[str] = None
    user_id: str
    username: str = ""
    # Relative path under /uploads/voice/
    audio_file_path: str
    original_filename: str = ""
    content_type: str = "audio/webm"
    file_size: int = 0
    duration: float = 0.0  # seconds
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VoiceLogResponse(BaseModel):
    id: str
    plan_id: str
    session_id: Optional[str] = None
    user_id: str
    username: str
    audio_url: str
    duration: float
    timestamp: datetime
