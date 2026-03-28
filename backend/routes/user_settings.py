"""
Routes for per-user settings (e.g. push-to-talk key binding).

Provides:
  - GET  /api/user/settings  → retrieve current user settings
  - PUT  /api/user/settings  → update user settings
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from middleware.auth import get_current_user
from models.user_settings import UserSettings

router = APIRouter()
logger = logging.getLogger("user_settings")

# Keys that must never be bound (OS / browser-critical)
BLOCKED_KEY_CODES = frozenset({
    "MetaLeft", "MetaRight",   # Windows / Command key
    "OSLeft", "OSRight",       # Alternative names for Meta
})


class UpdateSettingsRequest(BaseModel):
    push_to_talk_key: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Keyboard event.code value for push-to-talk key",
    )


@router.get("/user/settings")
async def get_user_settings(current_user: dict = Depends(get_current_user)):
    """Return the authenticated user's settings (or defaults)."""
    doc = await db.user_settings.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    if doc:
        return doc

    # Return defaults if no document exists yet
    defaults = UserSettings(user_id=current_user["id"])
    return defaults.model_dump()


@router.put("/user/settings")
async def update_user_settings(
    body: UpdateSettingsRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update push-to-talk key binding for the current user."""
    key_code = body.push_to_talk_key.strip()

    if key_code in BLOCKED_KEY_CODES:
        raise HTTPException(
            status_code=400,
            detail=f"Key '{key_code}' is blocked because it conflicts with OS or browser shortcuts.",
        )

    now = datetime.now(timezone.utc)
    await db.user_settings.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "push_to_talk_key": key_code,
                "updated_at": now.isoformat(),
            },
            "$setOnInsert": {"user_id": current_user["id"]},
        },
        upsert=True,
    )

    return {
        "user_id": current_user["id"],
        "push_to_talk_key": key_code,
        "updated_at": now.isoformat(),
    }
