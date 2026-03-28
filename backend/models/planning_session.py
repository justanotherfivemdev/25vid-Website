"""
Pydantic models for the collaborative planning session system.

A PlanningSession is a live, real-time collaborative editing session
attached to an OperationsPlan.  Multiple staff users can join concurrently,
and their unit-placement changes are broadcast over WebSocket.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone
import uuid
import secrets


class SessionParticipant(BaseModel):
    """A user currently connected to a planning session."""
    user_id: str
    username: str
    role: str = "member"
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PlanningSession(BaseModel):
    """Stored in the ``planning_sessions`` collection."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    join_code: str = Field(default_factory=lambda: secrets.token_hex(4).upper())
    created_by: str
    status: Literal["active", "locked", "closed"] = "active"
    participants: List[SessionParticipant] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closed_at: Optional[datetime] = None


class SessionCreate(BaseModel):
    plan_id: str


class SessionJoin(BaseModel):
    join_code: str


# ── WebSocket event types ────────────────────────────────────────────────────

class WSEvent(BaseModel):
    """Envelope for all WebSocket messages."""
    type: Literal[
        "UNIT_CREATE", "UNIT_UPDATE", "UNIT_DELETE",
        "PLAN_UPDATE", "SESSION_JOIN", "SESSION_LEAVE",
        "SESSION_LOCK", "SESSION_CLOSE", "SYNC_STATE",
        "CURSOR_MOVE",
    ]
    payload: dict = Field(default_factory=dict)
    sender_id: Optional[str] = None
    sender_name: Optional[str] = None
    timestamp: Optional[str] = None
