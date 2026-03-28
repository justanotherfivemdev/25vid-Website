"""
Routes for the Operations Events (event-sourcing / timeline) system.

Provides:
  - POST /api/operations-events           → record a new event
  - GET  /api/operations-events/{plan_id} → list events for a plan (timeline)
  - GET  /api/operations-events/{plan_id}/versions → list version snapshots
  - POST /api/operations-events/{plan_id}/rollback → rollback plan to a version

Events are also created automatically by the WebSocket planning session
handler (planning_sessions.py) whenever a unit change is made.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from database import db
from middleware.auth import get_current_user
from middleware.rbac import require_permission, has_permission, Permission
from models.operations_event import OperationsEvent, OperationsEventCreate

router = APIRouter()
logger = logging.getLogger("operations_events")


# ── Helper: record an event (used by both REST and WS) ──────────────────────

async def record_event(
    plan_id: str,
    event_type: str,
    user_id: str,
    username: str,
    payload: dict,
    session_id: str = None,
) -> dict:
    """Persist an event to operations_events and return the doc."""
    # Get current version count for this plan
    count = await db.operations_events.count_documents({"plan_id": plan_id})
    version = count + 1

    event = OperationsEvent(
        plan_id=plan_id,
        session_id=session_id,
        event_type=event_type,
        user_id=user_id,
        username=username,
        payload=payload,
        version=version,
    )
    doc = event.model_dump()
    doc["timestamp"] = doc["timestamp"].isoformat()
    await db.operations_events.insert_one(doc)
    return doc


# ── REST endpoints ───────────────────────────────────────────────────────────

@router.post("/operations-events")
async def create_event(
    data: OperationsEventCreate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Manually record an operations event (outside of a WebSocket session)."""
    plan = await db.operations_plans.find_one({"id": data.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    doc = await record_event(
        plan_id=data.plan_id,
        event_type=data.event_type,
        user_id=current_user["id"],
        username=current_user.get("username", "Unknown"),
        payload=data.payload,
    )
    return doc


@router.get("/operations-events/{plan_id}")
async def list_events(
    plan_id: str,
    after: Optional[str] = Query(None, description="ISO timestamp to filter events after"),
    limit: int = Query(5000, ge=1, le=10000),
    current_user: dict = Depends(get_current_user),
):
    """List all events for a plan (for timeline replay).

    Events are returned in chronological order.
    """
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

    events = (
        await db.operations_events.find(query, {"_id": 0})
        .sort("timestamp", 1)
        .to_list(limit)
    )
    return events


@router.get("/operations-events/{plan_id}/versions")
async def list_versions(
    plan_id: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Get a summary of version checkpoints for a plan.

    Returns a list of version numbers with their timestamps and event types,
    suitable for displaying a version history sidebar.
    """
    plan = await db.operations_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    pipeline = [
        {"$match": {"plan_id": plan_id}},
        {"$sort": {"version": 1}},
        {"$project": {
            "_id": 0,
            "id": 1,
            "version": 1,
            "event_type": 1,
            "username": 1,
            "timestamp": 1,
        }},
    ]
    versions = await db.operations_events.aggregate(pipeline).to_list(5000)
    return versions


@router.post("/operations-events/{plan_id}/rollback")
async def rollback_to_version(
    plan_id: str,
    target_version: int = Query(..., ge=0, description="Version number to rollback to (0 = empty plan)"),
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Rollback a plan to a specific version by replaying events.

    This reconstructs the plan state by replaying all events up to and
    including the target_version, then saves the result as the current plan
    state.  Events beyond the target version are deleted.
    """
    plan = await db.operations_plans.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if target_version == 0:
        # Rollback to empty state
        units = []
    else:
        # Fetch events up to target version
        events = (
            await db.operations_events.find(
                {"plan_id": plan_id, "version": {"$lte": target_version}},
                {"_id": 0},
            )
            .sort("version", 1)
            .to_list(10000)
        )
        if not events:
            raise HTTPException(status_code=400, detail="No events found for this version")

        # Replay events to reconstruct state
        units = _replay_events(events)

    # Update the plan
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.operations_plans.update_one(
        {"id": plan_id},
        {"$set": {
            "units": units,
            "version": target_version,
            "updated_at": now_iso,
            "updated_by": current_user["id"],
            "last_synced_at": now_iso,
        }},
    )

    # Delete events beyond target version
    await db.operations_events.delete_many(
        {"plan_id": plan_id, "version": {"$gt": target_version}}
    )

    # Record a rollback meta-event
    await record_event(
        plan_id=plan_id,
        event_type="PLAN_METADATA_UPDATE",
        user_id=current_user["id"],
        username=current_user.get("username", "Unknown"),
        payload={"action": "rollback", "target_version": target_version},
    )

    return {"message": f"Rolled back to version {target_version}", "unit_count": len(units)}


# ── Event replay engine ─────────────────────────────────────────────────────

def _replay_events(events: list) -> list:
    """Replay a list of chronological events and return the resulting units.

    This is the core of the event-sourcing system: given a list of events
    in order, reconstruct the complete unit state.
    """
    units_by_id: dict = {}

    for ev in events:
        et = ev.get("event_type", "")
        payload = ev.get("payload", {})

        if et == "UNIT_CREATE":
            unit = payload.get("unit", {})
            uid = unit.get("id")
            if uid:
                units_by_id[uid] = unit

        elif et in ("UNIT_UPDATE", "UNIT_MOVE"):
            uid = payload.get("unit_id")
            changes = payload.get("changes", {})
            if uid and uid in units_by_id:
                units_by_id[uid].update(changes)

        elif et == "UNIT_DELETE":
            uid = payload.get("unit_id")
            if uid:
                units_by_id.pop(uid, None)

        # PLAN_METADATA_UPDATE doesn't affect unit state

    return list(units_by_id.values())
