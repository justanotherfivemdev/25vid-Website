from pydantic import BaseModel
from typing import Optional


class ResearchQueryRequest(BaseModel):
    query: str
    attach_to_campaign_id: Optional[str] = None
    post_to_intel_board: bool = False
    add_to_threat_map: bool = False
