"""CRUD routes for community intelligence events.

Supports both real-world and fictional/milsim events created by
admins and community members.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from database import db
from middleware.auth import get_current_user
from models.community_event import (
    CommunityEvent,
    CommunityEventCreate,
    CommunityEventUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter()

COLLECTION = "community_events"


@router.get("/community-events")
async def list_community_events(
    event_nature: Optional[str] = None,
    category: Optional[str] = None,
    layer: Optional[str] = None,
    threat_level: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List community events with optional filters."""
    query: dict = {"visible": True}

    if event_nature and event_nature in ("real", "fictional"):
        query["event_nature"] = event_nature
    if category:
        query["category"] = category
    if layer:
        query["layer"] = layer
    if threat_level:
        query["threatLevel"] = threat_level

    events = (
        await db[COLLECTION]
        .find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(500)
    )
    return {"events": events, "count": len(events)}


@router.post("/community-events", status_code=201)
async def create_community_event(
    body: CommunityEventCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new community event."""
    event = CommunityEvent(
        **body.model_dump(),
        created_by=current_user.get("id", ""),
        created_by_username=current_user.get("username", ""),
        approved=current_user.get("role") == "admin",
    )
    doc = event.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    await db[COLLECTION].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/community-events/{event_id}")
async def update_community_event(
    event_id: str,
    body: CommunityEventUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a community event. Admins can update any; others only their own."""
    existing = await db[COLLECTION].find_one({"id": event_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")

    is_admin = current_user.get("role") == "admin"
    is_owner = existing.get("created_by") == current_user.get("id")
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized to edit this event")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "location" in updates and updates["location"] is not None:
        updates["location"] = updates["location"].model_dump() if hasattr(updates["location"], "model_dump") else updates["location"]
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db[COLLECTION].update_one({"id": event_id}, {"$set": updates})
    updated = await db[COLLECTION].find_one({"id": event_id}, {"_id": 0})
    return updated


@router.delete("/community-events/{event_id}")
async def delete_community_event(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a community event. Admins can delete any; others only their own."""
    existing = await db[COLLECTION].find_one({"id": event_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")

    is_admin = current_user.get("role") == "admin"
    is_owner = existing.get("created_by") == current_user.get("id")
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db[COLLECTION].delete_one({"id": event_id})
    return {"deleted": True, "id": event_id}


@router.post("/community-events/{event_id}/approve")
async def approve_community_event(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Approve a community event (admin only)."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    result = await db[COLLECTION].update_one(
        {"id": event_id},
        {"$set": {"approved": True, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"approved": True, "id": event_id}
