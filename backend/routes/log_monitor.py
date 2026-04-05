"""Log monitoring API routes.

Provides:
  POST /log              — Secured ingest endpoint for external log collectors
  GET  /log-monitor/errors       — Query occurrences with filtering
  GET  /log-monitor/error-types  — List known error types with counts
  GET  /log-monitor/mods         — List tracked mods
  GET  /log-monitor/alerts       — List active alerts
  GET  /log-monitor/stats        — Aggregated error counts per day
  PATCH /log-monitor/mods/{guid} — Update mod name/version
  PATCH /log-monitor/alerts/{id} — Resolve an alert
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from config import LOG_COLLECTOR_API_KEY
from database import db
from middleware.auth import get_current_user
from middleware.rbac import require_permission, Permission
from services.log_monitor import ingest_log_line

logger = logging.getLogger(__name__)
router = APIRouter()

_require_servers = require_permission(Permission.MANAGE_SERVERS)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class LogLinePayload(BaseModel):
    server_id: str = Field(..., min_length=1, max_length=200)
    line: str = Field(..., min_length=1, max_length=10000)


class ModUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    version: Optional[str] = Field(None, max_length=100)


# ---------------------------------------------------------------------------
# POST /api/log — External log ingestion (API-key secured)
# ---------------------------------------------------------------------------


@router.post("/log")
async def receive_log_line(payload: LogLinePayload, request: Request):
    """Receive a log line from an external collector.

    Secured via ``X-API-Key`` header matching ``LOG_COLLECTOR_API_KEY``.
    """
    api_key = request.headers.get("X-API-Key", "")
    if not LOG_COLLECTOR_API_KEY or api_key != LOG_COLLECTOR_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    # Validate the server_id exists
    server = await db.managed_servers.find_one(
        {"id": payload.server_id}, {"_id": 0, "id": 1}
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    occ_id = await ingest_log_line(payload.server_id, payload.line)
    return {
        "accepted": True,
        "error_detected": occ_id is not None,
        "occurrence_id": occ_id,
    }


# ---------------------------------------------------------------------------
# GET /api/log-monitor/errors — Query occurrences
# ---------------------------------------------------------------------------


@router.get("/log-monitor/errors")
async def list_errors(
    server: Optional[str] = Query(None, description="Filter by server_id"),
    mod: Optional[str] = Query(None, description="Filter by mod GUID"),
    error_type: Optional[str] = Query(None, alias="type", description="Filter by error_type_id"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, alias="q", description="Full-text search in message"),
    date_from: Optional[str] = Query(None, alias="from", description="ISO date start"),
    date_to: Optional[str] = Query(None, alias="to", description="ISO date end"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(_require_servers),
):
    """Return paginated occurrences with optional filters."""
    query: dict = {}

    if server:
        query["server_id"] = server
    if mod:
        query["mod_guid"] = mod
    if error_type:
        query["error_type_id"] = error_type
    if severity:
        query["severity"] = severity
    if category:
        query["category"] = category
    if search:
        query["message"] = {"$regex": search, "$options": "i"}

    # Date range
    ts_filter: dict = {}
    if date_from:
        try:
            ts_filter["$gte"] = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        except ValueError:
            pass
    if date_to:
        try:
            ts_filter["$lte"] = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        except ValueError:
            pass
    if ts_filter:
        query["timestamp"] = ts_filter

    total = await db.log_occurrences.count_documents(query)
    skip = (page - 1) * per_page

    cursor = (
        db.log_occurrences.find(query, {"_id": 0})
        .sort("timestamp", -1)
        .skip(skip)
        .limit(per_page)
    )
    items = await cursor.to_list(per_page)

    # Serialise datetimes
    for item in items:
        for key in ("timestamp", "created_at"):
            if isinstance(item.get(key), datetime):
                item[key] = item[key].isoformat()

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


# ---------------------------------------------------------------------------
# GET /api/log-monitor/error-types — Error categories with counts
# ---------------------------------------------------------------------------


@router.get("/log-monitor/error-types")
async def list_error_types(
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    search: Optional[str] = Query(None, alias="q"),
    current_user: dict = Depends(_require_servers),
):
    """Return all known error types with occurrence counts."""
    query: dict = {}
    if category:
        query["category"] = category
    if severity:
        query["severity"] = severity
    if search:
        query["$or"] = [
            {"label": {"$regex": search, "$options": "i"}},
            {"normalised_message": {"$regex": search, "$options": "i"}},
        ]

    cursor = db.log_error_types.find(query, {"_id": 0}).sort("total_occurrences", -1)
    items = await cursor.to_list(500)

    for item in items:
        for key in ("first_seen", "last_seen"):
            if isinstance(item.get(key), datetime):
                item[key] = item[key].isoformat()

    return items


# ---------------------------------------------------------------------------
# GET /api/log-monitor/mods — Tracked mods
# ---------------------------------------------------------------------------


@router.get("/log-monitor/mods")
async def list_mods(
    search: Optional[str] = Query(None, alias="q"),
    current_user: dict = Depends(_require_servers),
):
    """Return all mods seen in log errors."""
    query: dict = {}
    if search:
        query["$or"] = [
            {"guid": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
        ]
    cursor = db.log_mods.find(query, {"_id": 0}).sort("first_seen", -1)
    items = await cursor.to_list(500)

    for item in items:
        if isinstance(item.get("first_seen"), datetime):
            item["first_seen"] = item["first_seen"].isoformat()

    return items


# ---------------------------------------------------------------------------
# PATCH /api/log-monitor/mods/{guid} — Update mod info
# ---------------------------------------------------------------------------


@router.patch("/log-monitor/mods/{guid}")
async def update_mod(
    guid: str,
    body: ModUpdate,
    current_user: dict = Depends(_require_servers),
):
    """Update name and/or version of a tracked mod."""
    update_fields: dict = {}
    if body.name is not None:
        update_fields["name"] = body.name
    if body.version is not None:
        update_fields["version"] = body.version
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.log_mods.update_one({"guid": guid}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Mod not found")
    return {"updated": True}


# ---------------------------------------------------------------------------
# GET /api/log-monitor/alerts — Active alerts
# ---------------------------------------------------------------------------


@router.get("/log-monitor/alerts")
async def list_alerts(
    resolved: Optional[bool] = Query(None),
    server: Optional[str] = Query(None),
    current_user: dict = Depends(_require_servers),
):
    """Return log alerts."""
    query: dict = {}
    if resolved is not None:
        query["resolved"] = resolved
    if server:
        query["server_id"] = server

    cursor = db.log_alerts.find(query, {"_id": 0}).sort("last_triggered", -1)
    items = await cursor.to_list(200)

    for item in items:
        for key in ("created_at", "last_triggered"):
            if isinstance(item.get(key), datetime):
                item[key] = item[key].isoformat()

    return items


# ---------------------------------------------------------------------------
# PATCH /api/log-monitor/alerts/{alert_id} — Resolve an alert
# ---------------------------------------------------------------------------


@router.patch("/log-monitor/alerts/{alert_id}")
async def resolve_alert(
    alert_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Mark an alert as resolved."""
    result = await db.log_alerts.update_one(
        {"id": alert_id},
        {
            "$set": {
                "resolved": True,
                "resolved_at": datetime.now(timezone.utc),
                "resolved_by": current_user.get("username", current_user.get("id", "")),
            },
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"resolved": True}


# ---------------------------------------------------------------------------
# GET /api/log-monitor/stats — Errors per day
# ---------------------------------------------------------------------------


@router.get("/log-monitor/stats")
async def error_stats(
    server: Optional[str] = Query(None),
    days: int = Query(14, ge=1, le=90),
    current_user: dict = Depends(_require_servers),
):
    """Return error counts grouped by day for the chart."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    match_stage: dict = {"timestamp": {"$gte": cutoff}}
    if server:
        match_stage["server_id"] = server

    pipeline = [
        {"$match": match_stage},
        {
            "$group": {
                "_id": {
                    "$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}
                },
                "count": {"$sum": 1},
                "critical": {
                    "$sum": {"$cond": [{"$eq": ["$severity", "critical"]}, 1, 0]}
                },
                "high": {
                    "$sum": {"$cond": [{"$eq": ["$severity", "high"]}, 1, 0]}
                },
                "medium": {
                    "$sum": {"$cond": [{"$eq": ["$severity", "medium"]}, 1, 0]}
                },
                "low": {
                    "$sum": {"$cond": [{"$eq": ["$severity", "low"]}, 1, 0]}
                },
            },
        },
        {"$sort": {"_id": 1}},
    ]
    result = await db.log_occurrences.aggregate(pipeline).to_list(days + 1)

    return [
        {
            "date": r["_id"],
            "count": r["count"],
            "critical": r["critical"],
            "high": r["high"],
            "medium": r["medium"],
            "low": r["low"],
        }
        for r in result
    ]


# ---------------------------------------------------------------------------
# GET /api/log-monitor/servers — Quick list of servers for filter dropdown
# ---------------------------------------------------------------------------


@router.get("/log-monitor/servers")
async def list_servers_for_filter(
    current_user: dict = Depends(_require_servers),
):
    """Return a minimal list of servers for the log monitor filter UI."""
    cursor = db.managed_servers.find(
        {}, {"_id": 0, "id": 1, "name": 1, "status": 1}
    ).sort("name", 1)
    return await cursor.to_list(200)
