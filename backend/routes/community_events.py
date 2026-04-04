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
from middleware.rbac import Permission, has_permission
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
    campaign_id: Optional[str] = None,
    operation_id: Optional[str] = None,
    source_document_id: Optional[str] = None,
    generation_status: Optional[str] = None,
    include_hidden: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """List community events with optional filters.

    By default only approved & visible events are returned.
    Admins also see unapproved events; creators see their own pending items.
    """
    role = current_user.get("role", "member")
    is_admin = current_user.get("role") == "admin"
    can_review_hidden = (
        is_admin
        or has_permission(role, Permission.MANAGE_OPERATIONS)
        or has_permission(role, Permission.MANAGE_CAMPAIGNS)
    )
    user_id = current_user.get("id", "")

    if can_review_hidden and include_hidden:
        query: dict = {}
    elif can_review_hidden:
        query = {"visible": True}
    else:
        # Non-admins see approved events OR their own unapproved events
        query = {
            "visible": True,
            "$or": [
                {"approved": True},
                {"created_by": user_id},
            ],
        }

    if event_nature and event_nature in ("real", "fictional"):
        query["event_nature"] = event_nature
    if category:
        query["category"] = category
    if layer:
        query["layer"] = layer
    if threat_level:
        query["threatLevel"] = threat_level
    if campaign_id:
        query["campaign_id"] = campaign_id
    if operation_id:
        query["operation_id"] = operation_id
    if source_document_id:
        query["source_document_ids"] = source_document_id
    if generation_status:
        query["generation_status"] = generation_status

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

    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    # Only admins may set moderation and admin override fields; strip them for regular users
    if not is_admin:
        updates.pop("approved", None)
        updates.pop("visible", None)
        updates.pop("admin_description", None)
        updates.pop("admin_source", None)
        updates.pop("credibility", None)
    else:
        # Track which admin made the override
        if any(k in updates for k in ("admin_description", "admin_source", "credibility")):
            updates["admin_modified_by"] = current_user.get("username", "admin")
            updates["admin_modified_at"] = datetime.now(timezone.utc).isoformat()
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
        {
            "$set": {
                "approved": True,
                "visible": True,
                "generation_status": "published",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"approved": True, "id": event_id}
