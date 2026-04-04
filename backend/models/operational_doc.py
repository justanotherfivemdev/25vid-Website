from datetime import datetime, timezone
from typing import List, Literal, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


DocumentType = Literal["opord", "aar"]
ParseStatus = Literal["pending", "parsed", "parser_unavailable", "failed"]
GenerationStatus = Literal[
    "not_applicable",
    "pending",
    "generated",
    "published",
    "hidden",
    "skipped",
    "cooldown",
    "failed",
]


class OperationDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: f"odoc_{uuid.uuid4().hex[:12]}")
    title: str = ""
    document_type: DocumentType
    campaign_id: str
    campaign_name: str = ""
    operation_id: Optional[str] = None
    operation_title: str = ""
    original_filename: str
    stored_filename: str
    file_path: str
    content_type: str
    extension: str
    file_size: int = 0
    checksum: str
    extracted_text: str = ""
    parse_status: ParseStatus = "pending"
    parse_error: Optional[str] = None
    uploaded_by: str = ""
    uploaded_by_username: str = ""
    generated_event_ids: List[str] = Field(default_factory=list)
    generated_event_count: int = 0
    generation_status: GenerationStatus = "not_applicable"
    generation_provider: Optional[str] = None
    generation_error: Optional[str] = None
    generation_signature: Optional[str] = None
    last_generated_at: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
