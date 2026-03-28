"""
Pydantic models for the Operations Events (event-sourcing) system.

Every change to an operation plan is recorded as an event.  This enables:
  - Full timeline replay of planning sessions
  - Version history with undo / rollback
  - After-action review playback
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal
from datetime import datetime, timezone
import uuid


EVENT_TYPES = (
    "UNIT_CREATE",
    "UNIT_MOVE",
    "UNIT_UPDATE",
    "UNIT_DELETE",
    "PLAN_METADATA_UPDATE",
)


class OperationsEvent(BaseModel):
    """A single recorded event in the operations_events collection."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    session_id: Optional[str] = None
    event_type: Literal[
        "UNIT_CREATE", "UNIT_MOVE", "UNIT_UPDATE",
        "UNIT_DELETE", "PLAN_METADATA_UPDATE",
    ]
    user_id: str
    username: str = ""
    # The change payload — structure depends on event_type
    payload: dict = Field(default_factory=dict)
    # Monotonically increasing version within the plan
    version: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OperationsEventCreate(BaseModel):
    """Client-submitted event (used for manual recording outside WS)."""
    plan_id: str
    event_type: Literal[
        "UNIT_CREATE", "UNIT_MOVE", "UNIT_UPDATE",
        "UNIT_DELETE", "PLAN_METADATA_UPDATE",
    ]
    payload: dict = Field(default_factory=dict)
