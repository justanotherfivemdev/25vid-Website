"""
Routes for collaborative planning sessions.

Provides:
  - REST endpoints for session lifecycle (create / join / leave / close / lock)
  - WebSocket endpoint for real-time unit sync

Architecture choice: WebSocket-based sync (Option A) with a JSON event
envelope.  Conflict strategy: last-write-wins — the most recent unit update
from any participant is authoritative.  This is simple, predictable, and
adequate for the expected concurrency (2-8 simultaneous editors).

The system also persists every unit change to MongoDB so that reconnecting
clients receive the latest state.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Set

from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
import jwt as pyjwt

from database import db
from config import JWT_SECRET, JWT_ALGORITHM, COOKIE_NAME
from middleware.auth import get_current_user
from middleware.rbac import require_permission, has_permission, Permission
from models.planning_session import (
    PlanningSession,
    SessionCreate,
    SessionJoin,
    SessionParticipant,
)

router = APIRouter()
logger = logging.getLogger("planning_sessions")

# ── In-memory connection registry ────────────────────────────────────────────
# Maps session_id → set of (WebSocket, user_id, username)

_active_connections: Dict[str, List[tuple]] = {}


def _get_conns(session_id: str) -> List[tuple]:
    return _active_connections.setdefault(session_id, [])


async def _broadcast(session_id: str, message: dict, exclude_ws=None):
    """Send a JSON message to all connected clients in a session."""
    conns = _get_conns(session_id)
    dead = []
    for ws, uid, uname in conns:
        if ws is exclude_ws:
            continue
        try:
            await ws.send_json(message)
        except Exception:
            dead.append((ws, uid, uname))
    # Remove dead connections
    for d in dead:
        if d in conns:
            conns.remove(d)


# ── REST endpoints ───────────────────────────────────────────────────────────

@router.post("/sessions")
async def create_session(
    data: SessionCreate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Create a new live planning session for a plan."""
    # Check plan exists
    plan = await db.operations_plans.find_one({"id": data.plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Check no active session already exists for this plan
    existing = await db.planning_sessions.find_one(
        {"plan_id": data.plan_id, "status": "active"}, {"_id": 0}
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An active session already exists for this plan",
        )

    session = PlanningSession(
        plan_id=data.plan_id,
        created_by=current_user["id"],
    )
    doc = session.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("closed_at"):
        doc["closed_at"] = doc["closed_at"].isoformat()
    # Serialise participant timestamps
    for p in doc.get("participants", []):
        if isinstance(p.get("joined_at"), datetime):
            p["joined_at"] = p["joined_at"].isoformat()
    await db.planning_sessions.insert_one(doc)

    # Update the plan to reflect active session
    await db.operations_plans.update_one(
        {"id": data.plan_id},
        {"$set": {
            "is_live_session_active": True,
            "live_session_id": session.id,
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    return {
        "id": session.id,
        "plan_id": session.plan_id,
        "join_code": session.join_code,
        "status": session.status,
        "created_by": session.created_by,
    }


@router.post("/sessions/join")
async def join_session(
    data: SessionJoin,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Join an active session by join code."""
    session = await db.planning_sessions.find_one(
        {"join_code": data.join_code, "status": "active"}, {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="No active session found with that code")

    # Add participant if not already present
    user_id = current_user["id"]
    existing_ids = [p["user_id"] for p in session.get("participants", [])]
    if user_id not in existing_ids:
        participant = {
            "user_id": user_id,
            "username": current_user.get("username", "Unknown"),
            "role": current_user.get("role", "member"),
            "joined_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.planning_sessions.update_one(
            {"id": session["id"]},
            {"$push": {"participants": participant}},
        )

    return {
        "session_id": session["id"],
        "plan_id": session["plan_id"],
        "join_code": session["join_code"],
        "status": session["status"],
    }


@router.post("/sessions/{session_id}/leave")
async def leave_session(
    session_id: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Leave a session (remove self from participants)."""
    session = await db.planning_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.planning_sessions.update_one(
        {"id": session_id},
        {"$pull": {"participants": {"user_id": current_user["id"]}}},
    )

    # Broadcast leave event
    await _broadcast(session_id, {
        "type": "SESSION_LEAVE",
        "payload": {
            "user_id": current_user["id"],
            "username": current_user.get("username", "Unknown"),
        },
    })

    return {"message": "Left session"}


@router.post("/sessions/{session_id}/close")
async def close_session(
    session_id: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Close a session (end collaboration)."""
    session = await db.planning_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.planning_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "closed", "closed_at": now_iso}},
    )

    # Clear live flags on the plan
    await db.operations_plans.update_one(
        {"id": session["plan_id"]},
        {"$set": {
            "is_live_session_active": False,
            "live_session_id": None,
            "last_synced_at": now_iso,
        }},
    )

    # Broadcast close
    await _broadcast(session_id, {
        "type": "SESSION_CLOSE",
        "payload": {"closed_by": current_user.get("username", "Unknown")},
    })

    # Disconnect all
    conns = _get_conns(session_id)
    for ws, uid, uname in conns:
        try:
            await ws.close(code=1000, reason="Session closed")
        except Exception:
            pass
    _active_connections.pop(session_id, None)

    return {"message": "Session closed"}


@router.post("/sessions/{session_id}/lock")
async def lock_session(
    session_id: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Lock a session (read-only, no more edits)."""
    session = await db.planning_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.planning_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "locked"}},
    )

    await _broadcast(session_id, {
        "type": "SESSION_LOCK",
        "payload": {"locked_by": current_user.get("username", "Unknown")},
    })

    return {"message": "Session locked"}


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get session details."""
    session = await db.planning_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ── WebSocket endpoint ───────────────────────────────────────────────────────

async def _authenticate_ws(websocket: WebSocket) -> dict | None:
    """Extract and verify JWT from WebSocket query param or cookie."""
    token = websocket.query_params.get("token")
    if not token:
        token = websocket.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        return user
    except Exception:
        return None


@router.websocket("/ws/operations/{session_id}")
async def ws_planning(websocket: WebSocket, session_id: str):
    """
    Real-time planning WebSocket.

    Event flow:
      1. Client connects with JWT token (query param or cookie)
      2. Server validates auth + session membership
      3. Server sends SYNC_STATE with current plan units
      4. Client sends UNIT_CREATE / UNIT_UPDATE / UNIT_DELETE / PLAN_UPDATE
      5. Server persists change → broadcasts to all other participants
    """
    # ── Auth ──
    user = await _authenticate_ws(websocket)
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return

    user_id = user["id"]
    username = user.get("username", "Unknown")
    role = user.get("role", "member")

    # ── Session validation ──
    session = await db.planning_sessions.find_one({"id": session_id}, {"_id": 0})
    if not session or session["status"] == "closed":
        await websocket.close(code=4004, reason="Session not found or closed")
        return

    can_edit = has_permission(role, Permission.MANAGE_PLANS)
    is_locked = session["status"] == "locked"

    # Allow live viewers (non-staff) if plan has allow_live_viewing=True
    plan = await db.operations_plans.find_one({"id": session["plan_id"]}, {"_id": 0})
    if not plan:
        await websocket.close(code=4004, reason="Plan not found")
        return

    if not can_edit:
        if not plan.get("allow_live_viewing"):
            await websocket.close(code=4003, reason="Live viewing not enabled")
            return

    await websocket.accept()

    # Register connection
    conns = _get_conns(session_id)
    conn_tuple = (websocket, user_id, username)
    conns.append(conn_tuple)

    try:
        # Send initial state
        await websocket.send_json({
            "type": "SYNC_STATE",
            "payload": {
                "plan_id": plan["id"],
                "units": plan.get("units", []),
                "title": plan.get("title", ""),
                "description": plan.get("description", ""),
                "version": plan.get("version", 1),
                "participants": [
                    {"user_id": uid, "username": uname}
                    for _, uid, uname in conns
                ],
                "is_locked": is_locked,
                "can_edit": can_edit and not is_locked,
            },
        })

        # Broadcast join
        await _broadcast(session_id, {
            "type": "SESSION_JOIN",
            "payload": {"user_id": user_id, "username": username},
        }, exclude_ws=websocket)

        # ── Message loop ──
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event_type = msg.get("type", "")
            payload = msg.get("payload", {})
            now_iso = datetime.now(timezone.utc).isoformat()

            # Read-only users and locked sessions can't make changes
            if not can_edit or is_locked:
                if event_type in ("UNIT_CREATE", "UNIT_UPDATE", "UNIT_DELETE", "PLAN_UPDATE"):
                    await websocket.send_json({
                        "type": "ERROR",
                        "payload": {"message": "Read-only mode"},
                    })
                    continue

            # ── UNIT_CREATE ──
            if event_type == "UNIT_CREATE":
                unit = payload.get("unit", {})
                if unit:
                    await db.operations_plans.update_one(
                        {"id": plan["id"]},
                        {
                            "$push": {"units": unit},
                            "$set": {"last_synced_at": now_iso},
                            "$inc": {"version": 1},
                        },
                    )
                    await _broadcast(session_id, {
                        "type": "UNIT_CREATE",
                        "payload": {"unit": unit},
                        "sender_id": user_id,
                        "sender_name": username,
                        "timestamp": now_iso,
                    }, exclude_ws=websocket)

            # ── UNIT_UPDATE ──
            elif event_type == "UNIT_UPDATE":
                unit_id = payload.get("unit_id")
                changes = payload.get("changes", {})
                if unit_id and changes:
                    # Last-write-wins: update the specific unit in the array
                    set_fields = {f"units.$.{k}": v for k, v in changes.items()}
                    set_fields["last_synced_at"] = now_iso
                    await db.operations_plans.update_one(
                        {"id": plan["id"], "units.id": unit_id},
                        {"$set": set_fields, "$inc": {"version": 1}},
                    )
                    await _broadcast(session_id, {
                        "type": "UNIT_UPDATE",
                        "payload": {"unit_id": unit_id, "changes": changes},
                        "sender_id": user_id,
                        "sender_name": username,
                        "timestamp": now_iso,
                    }, exclude_ws=websocket)

            # ── UNIT_DELETE ──
            elif event_type == "UNIT_DELETE":
                unit_id = payload.get("unit_id")
                if unit_id:
                    await db.operations_plans.update_one(
                        {"id": plan["id"]},
                        {
                            "$pull": {"units": {"id": unit_id}},
                            "$set": {"last_synced_at": now_iso},
                            "$inc": {"version": 1},
                        },
                    )
                    await _broadcast(session_id, {
                        "type": "UNIT_DELETE",
                        "payload": {"unit_id": unit_id},
                        "sender_id": user_id,
                        "sender_name": username,
                        "timestamp": now_iso,
                    }, exclude_ws=websocket)

            # ── PLAN_UPDATE (metadata) ──
            elif event_type == "PLAN_UPDATE":
                allowed_keys = {"title", "description", "allow_live_viewing", "visibility_scope"}
                update_fields = {k: v for k, v in payload.items() if k in allowed_keys}
                if update_fields:
                    update_fields["last_synced_at"] = now_iso
                    update_fields["updated_by"] = user_id
                    await db.operations_plans.update_one(
                        {"id": plan["id"]},
                        {"$set": update_fields, "$inc": {"version": 1}},
                    )
                    await _broadcast(session_id, {
                        "type": "PLAN_UPDATE",
                        "payload": update_fields,
                        "sender_id": user_id,
                        "sender_name": username,
                        "timestamp": now_iso,
                    }, exclude_ws=websocket)

            # ── CURSOR_MOVE (ephemeral, not persisted) ──
            elif event_type == "CURSOR_MOVE":
                await _broadcast(session_id, {
                    "type": "CURSOR_MOVE",
                    "payload": payload,
                    "sender_id": user_id,
                    "sender_name": username,
                }, exclude_ws=websocket)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"WS error for user {user_id} in session {session_id}: {e}")
    finally:
        # Cleanup connection
        conns = _get_conns(session_id)
        if conn_tuple in conns:
            conns.remove(conn_tuple)

        # Broadcast leave
        try:
            await _broadcast(session_id, {
                "type": "SESSION_LEAVE",
                "payload": {"user_id": user_id, "username": username},
            })
        except Exception:
            pass

        # Remove participant from DB
        await db.planning_sessions.update_one(
            {"id": session_id},
            {"$pull": {"participants": {"user_id": user_id}}},
        )
