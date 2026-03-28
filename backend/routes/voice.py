"""
Routes for the Voice Comms system.

Provides:
  - POST /api/voice/upload         → upload a voice clip (push-to-talk recording)
  - GET  /api/voice/{plan_id}      → list voice clips for a plan
  - GET  /api/voice/file/{clip_id} → stream a specific voice clip

Audio is stored in /uploads/voice/ as WebM/Opus files (efficient browser
codec).  Clips are timestamped so the replay system can sync playback
with the timeline.
"""

import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.responses import FileResponse

from database import db
from config import UPLOAD_DIR
from middleware.auth import get_current_user
from middleware.rbac import require_permission, has_permission, Permission
from models.voice_log import VoiceLog

router = APIRouter()
logger = logging.getLogger("voice")

# ── Upload directory ─────────────────────────────────────────────────────────

VOICE_UPLOAD_DIR = UPLOAD_DIR / "voice"
VOICE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Constraints
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg",
    "audio/mp4", "audio/x-m4a", "audio/opus",
}
MAX_AUDIO_SIZE = 10 * 1024 * 1024  # 10 MB per clip


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/voice/upload")
async def upload_voice_clip(
    file: UploadFile = File(...),
    plan_id: str = Form(...),
    session_id: str = Form(None),
    duration: float = Form(0.0),
    current_user: dict = Depends(get_current_user),
):
    """Upload a recorded voice clip for an operations plan."""
    # Validate plan exists
    plan = await db.operations_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Validate file type
    content_type = file.content_type or "audio/webm"
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid audio type '{content_type}'. Allowed: {', '.join(ALLOWED_AUDIO_TYPES)}",
        )

    # Read and validate size
    data = await file.read()
    if len(data) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Audio file too large ({len(data)} bytes). Maximum: {MAX_AUDIO_SIZE} bytes.",
        )

    # Determine extension
    ext_map = {
        "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/wav": ".wav",
        "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a",
        "audio/opus": ".opus",
    }
    ext = ext_map.get(content_type, ".webm")

    # Safe filename
    clip_id = str(uuid.uuid4())
    safe_name = f"{clip_id}{ext}"
    file_path = VOICE_UPLOAD_DIR / safe_name

    # Write to disk
    with open(file_path, "wb") as fh:
        fh.write(data)

    # Store metadata
    voice_log = VoiceLog(
        id=clip_id,
        plan_id=plan_id,
        session_id=session_id,
        user_id=current_user["id"],
        username=current_user.get("username", "Unknown"),
        audio_file_path=f"voice/{safe_name}",
        original_filename=file.filename or "clip",
        content_type=content_type,
        file_size=len(data),
        duration=duration,
    )
    doc = voice_log.model_dump()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.voice_logs.insert_one(doc)

    return {
        "id": clip_id,
        "plan_id": plan_id,
        "audio_url": f"/api/uploads/voice/{safe_name}",
        "duration": duration,
        "username": current_user.get("username", "Unknown"),
        "timestamp": doc["timestamp"],
    }


@router.get("/voice/{plan_id}")
async def list_voice_clips(
    plan_id: str,
    after: str = Query(None, description="ISO timestamp to filter clips after"),
    current_user: dict = Depends(get_current_user),
):
    """List voice clips for a plan (for playback / replay)."""
    # Verify plan access
    plan = await db.operations_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    role = current_user.get("role", "member")
    can_manage = has_permission(role, Permission.MANAGE_PLANS)
    if not can_manage:
        if not plan.get("is_published"):
            is_live_viewable = plan.get("is_live_session_active") and plan.get("allow_live_viewing")
            if not is_live_viewable:
                raise HTTPException(status_code=403, detail="Plan not accessible")

    query = {"plan_id": plan_id}
    if after:
        query["timestamp"] = {"$gt": after}

    clips = (
        await db.voice_logs.find(query, {"_id": 0})
        .sort("timestamp", 1)
        .to_list(1000)
    )

    # Enrich with audio URLs
    for c in clips:
        c["audio_url"] = f"/api/uploads/{c.get('audio_file_path', '')}"

    return clips


@router.get("/voice/file/{clip_id}")
async def get_voice_file(
    clip_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Stream a specific voice clip file."""
    clip = await db.voice_logs.find_one({"id": clip_id}, {"_id": 0})
    if not clip:
        raise HTTPException(status_code=404, detail="Voice clip not found")

    file_path = UPLOAD_DIR / clip["audio_file_path"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    return FileResponse(
        path=str(file_path),
        media_type=clip.get("content_type", "audio/webm"),
        filename=clip.get("original_filename", "clip.webm"),
    )
