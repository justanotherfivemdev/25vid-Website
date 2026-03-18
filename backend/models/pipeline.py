from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, List
from datetime import datetime, timezone
import uuid

PIPELINE_STAGES = [
    "applicant", "accepted_recruit", "bct_in_progress",
    "probationary", "active_member", "rejected", "dropped", "archived",
]


class PipelineTransition(BaseModel):
    from_stage: str
    to_stage: str
    changed_by: str
    changed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    notes: Optional[str] = None


class PipelineStatusUpdate(BaseModel):
    stage: Literal[
        "applicant", "accepted_recruit", "bct_in_progress",
        "probationary", "active_member", "rejected", "dropped", "archived",
    ]
    notes: Optional[str] = None


class PipelineNote(BaseModel):
    author: str
    text: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
