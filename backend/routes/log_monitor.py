"""Log monitoring API routes.

Provides:
  POST  /log                            - Secured ingest endpoint for external log collectors
  GET   /log-monitor/errors             - Query occurrences with filtering and curation metadata
  GET   /log-monitor/error-types        - List known error types with counts and review state
  GET   /log-monitor/error-types/{id}   - Inspect a single curated error type
  PATCH /log-monitor/error-types/{id}   - Update curation for an error type
  GET   /log-monitor/mods               - List tracked mods
  GET   /log-monitor/alerts             - List active alerts
  GET   /log-monitor/stats              - Aggregated error counts per day
  PATCH /log-monitor/mods/{guid}        - Update mod name/version
  PATCH /log-monitor/alerts/{id}        - Resolve an alert
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from config import LOG_COLLECTOR_API_KEY
from database import db
from middleware.rbac import Permission, require_permission
from services.log_monitor import (
    ERROR_ACTIONABILITY,
    ERROR_ATTRIBUTION_TYPES,
    ERROR_DESIGNATED_AREAS,
    ERROR_REVIEW_STATUSES,
    derive_error_type_defaults,
    ingest_log_line,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_require_servers = require_permission(Permission.MANAGE_SERVERS)

_MAX_SEARCH_LEN = 200


def _safe_regex(raw: str) -> str:
    """Escape and cap a user-supplied string for safe use in ``$regex``."""
    return re.escape(raw)[:_MAX_SEARCH_LEN]


def _serialise_datetimes(doc: dict, keys: tuple[str, ...]) -> dict:
    for key in keys:
        if isinstance(doc.get(key), datetime):
            doc[key] = doc[key].isoformat()
    return doc


def _normalise_error_type_doc(item: dict) -> dict:
    defaults = derive_error_type_defaults(item)
    normalised = {**defaults, **item}
    normalised.setdefault("linked_mod_guid", "")
    normalised.setdefault("linked_mod_name", "")
    normalised.setdefault("troublesome", False)
    normalised.setdefault("curation_notes", "")
    normalised.setdefault("reviewed_by", "")
    normalised.setdefault("reviewed_at", None)
    normalised.setdefault("source_streams", [])
    return _serialise_datetimes(normalised, ("first_seen", "last_seen", "reviewed_at"))


async def _load_error_type_map(error_type_ids: list[str]) -> dict[str, dict]:
    if not error_type_ids:
        return {}
    cursor = db.log_error_types.find(
        {"id": {"$in": error_type_ids}},
        {"_id": 0},
    )
    docs = await cursor.to_list(len(error_type_ids))
    return {doc["id"]: _normalise_error_type_doc(doc) for doc in docs if doc.get("id")}


def _empty_page(page: int, per_page: int) -> dict:
    return {
        "items": [],
        "total": 0,
        "page": page,
        "per_page": per_page,
        "pages": 1,
    }


class LogLinePayload(BaseModel):
    server_id: str = Field(..., min_length=1, max_length=200)
    line: str = Field(..., min_length=1, max_length=10000)
    source_stream: Optional[str] = Field("docker", max_length=40)


class ModUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    version: Optional[str] = Field(None, max_length=100)


class ErrorTypeCurationUpdate(BaseModel):
    review_status: Optional[str] = Field(None, max_length=40)
    attribution_type: Optional[str] = Field(None, max_length=40)
    designated_area: Optional[str] = Field(None, max_length=40)
    actionability: Optional[str] = Field(None, max_length=40)
    linked_mod_guid: Optional[str] = Field(None, max_length=64)
    linked_mod_name: Optional[str] = Field(None, max_length=200)
    troublesome: Optional[bool] = None
    curation_notes: Optional[str] = Field(None, max_length=4000)


@router.post("/log")
async def receive_log_line(payload: LogLinePayload, request: Request):
    """Receive a log line from an external collector."""
    api_key = request.headers.get("X-API-Key", "")
    if not LOG_COLLECTOR_API_KEY or api_key != LOG_COLLECTOR_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    server = await db.managed_servers.find_one(
        {"id": payload.server_id},
        {"_id": 0, "id": 1},
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    occ_id = await ingest_log_line(
        payload.server_id,
        payload.line,
        source_stream=(payload.source_stream or "docker"),
    )
    return {
        "accepted": True,
        "error_detected": occ_id is not None,
        "occurrence_id": occ_id,
    }


@router.get("/log-monitor/errors")
async def list_errors(
    server: Optional[str] = Query(None, description="Filter by server_id"),
    mod: Optional[str] = Query(None, description="Filter by mod GUID"),
    error_type: Optional[str] = Query(None, alias="type", description="Filter by error_type_id"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    category: Optional[str] = Query(None, description="Filter by category"),
    source_stream: Optional[str] = Query(None, description="Filter by source stream"),
    review_status: Optional[str] = Query(None, description="Filter by operator review status"),
    attribution_type: Optional[str] = Query(None, description="Filter by attribution type"),
    designated_area: Optional[str] = Query(None, description="Filter by designated diagnostics area"),
    actionability: Optional[str] = Query(None, description="Filter by actionability"),
    troublesome: Optional[bool] = Query(None, description="Filter by troublesome-linked items"),
    search: Optional[str] = Query(None, alias="q", description="Full-text search in message"),
    date_from: Optional[str] = Query(None, alias="from", description="ISO date start"),
    date_to: Optional[str] = Query(None, alias="to", description="ISO date end"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(_require_servers),
):
    """Return paginated occurrences with optional filters."""
    query: dict[str, Any] = {}

    if server:
        query["server_id"] = server
    if mod:
        query["mod_guid"] = mod.upper()
    if severity:
        query["severity"] = severity
    if category:
        query["category"] = category
    if source_stream:
        query["source_stream"] = source_stream
    if search:
        safe = _safe_regex(search)
        query["message"] = {"$regex": safe, "$options": "i"}

    ts_filter: dict[str, Any] = {}
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

    metadata_query: dict[str, Any] = {}
    if error_type:
        metadata_query["id"] = error_type
    if review_status:
        metadata_query["review_status"] = review_status
    if attribution_type:
        metadata_query["attribution_type"] = attribution_type
    if designated_area:
        metadata_query["designated_area"] = designated_area
    if actionability:
        metadata_query["actionability"] = actionability
    if troublesome is not None:
        metadata_query["troublesome"] = troublesome

    if metadata_query:
        matching_types = await db.log_error_types.find(
            metadata_query,
            {"_id": 0, "id": 1},
        ).to_list(5000)
        matching_ids = [doc["id"] for doc in matching_types if doc.get("id")]
        if not matching_ids:
            return _empty_page(page, per_page)
        query["error_type_id"] = {"$in": matching_ids}
    elif error_type:
        query["error_type_id"] = error_type

    total = await db.log_occurrences.count_documents(query)
    if total == 0:
        return _empty_page(page, per_page)

    skip = (page - 1) * per_page
    cursor = (
        db.log_occurrences.find(query, {"_id": 0})
        .sort("timestamp", -1)
        .skip(skip)
        .limit(per_page)
    )
    items = await cursor.to_list(per_page)
    type_map = await _load_error_type_map(
        sorted({str(item.get("error_type_id") or "") for item in items if item.get("error_type_id")})
    )

    for item in items:
        _serialise_datetimes(item, ("timestamp", "created_at"))
        meta = type_map.get(str(item.get("error_type_id") or ""))
        if meta:
            item["review_status"] = meta.get("review_status")
            item["attribution_type"] = meta.get("attribution_type")
            item["designated_area"] = meta.get("designated_area")
            item["actionability"] = meta.get("actionability")
            item["linked_mod_guid"] = meta.get("linked_mod_guid")
            item["linked_mod_name"] = meta.get("linked_mod_name")
            item["troublesome"] = meta.get("troublesome", False)
            item["curation_notes"] = meta.get("curation_notes", "")

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
    }


@router.get("/log-monitor/error-types")
async def list_error_types(
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    review_status: Optional[str] = Query(None),
    attribution_type: Optional[str] = Query(None),
    designated_area: Optional[str] = Query(None),
    actionability: Optional[str] = Query(None),
    troublesome: Optional[bool] = Query(None),
    linked_mod_guid: Optional[str] = Query(None),
    search: Optional[str] = Query(None, alias="q"),
    current_user: dict = Depends(_require_servers),
):
    """Return all known error types with occurrence counts and curation metadata."""
    query: dict[str, Any] = {}
    if category:
        query["category"] = category
    if severity:
        query["severity"] = severity
    if review_status:
        query["review_status"] = review_status
    if attribution_type:
        query["attribution_type"] = attribution_type
    if designated_area:
        query["designated_area"] = designated_area
    if actionability:
        query["actionability"] = actionability
    if troublesome is not None:
        query["troublesome"] = troublesome
    if linked_mod_guid:
        query["linked_mod_guid"] = linked_mod_guid.upper()
    if search:
        safe = _safe_regex(search)
        query["$or"] = [
            {"label": {"$regex": safe, "$options": "i"}},
            {"normalised_message": {"$regex": safe, "$options": "i"}},
            {"curation_notes": {"$regex": safe, "$options": "i"}},
            {"linked_mod_name": {"$regex": safe, "$options": "i"}},
        ]

    cursor = db.log_error_types.find(query, {"_id": 0}).sort("total_occurrences", -1)
    items = await cursor.to_list(500)
    return [_normalise_error_type_doc(item) for item in items]


@router.get("/log-monitor/error-types/{error_type_id}")
async def get_error_type(
    error_type_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Return a single curated error type."""
    item = await db.log_error_types.find_one({"id": error_type_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Error type not found")
    return _normalise_error_type_doc(item)


@router.patch("/log-monitor/error-types/{error_type_id}")
async def update_error_type_curation(
    error_type_id: str,
    body: ErrorTypeCurationUpdate,
    current_user: dict = Depends(_require_servers),
):
    """Update curation metadata for a log error type."""
    update_fields: dict[str, Any] = {}
    if body.review_status is not None:
        if body.review_status not in ERROR_REVIEW_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported review status")
        update_fields["review_status"] = body.review_status
    if body.attribution_type is not None:
        if body.attribution_type not in ERROR_ATTRIBUTION_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported attribution type")
        update_fields["attribution_type"] = body.attribution_type
    if body.designated_area is not None:
        if body.designated_area not in ERROR_DESIGNATED_AREAS:
            raise HTTPException(status_code=400, detail="Unsupported designated area")
        update_fields["designated_area"] = body.designated_area
    if body.actionability is not None:
        if body.actionability not in ERROR_ACTIONABILITY:
            raise HTTPException(status_code=400, detail="Unsupported actionability")
        update_fields["actionability"] = body.actionability
    if body.linked_mod_guid is not None:
        update_fields["linked_mod_guid"] = body.linked_mod_guid.strip().upper()
    if body.linked_mod_name is not None:
        update_fields["linked_mod_name"] = body.linked_mod_name.strip()
    if body.troublesome is not None:
        update_fields["troublesome"] = body.troublesome
    if body.curation_notes is not None:
        update_fields["curation_notes"] = body.curation_notes.strip()

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    if update_fields.get("review_status") == "false_positive" and "actionability" not in update_fields:
        update_fields["actionability"] = "known_safe"
    if update_fields.get("troublesome") and "designated_area" not in update_fields:
        update_fields["designated_area"] = "troublesome-mods"
    if update_fields.get("linked_mod_guid") and not update_fields.get("linked_mod_name"):
        mod_doc = await db.log_mods.find_one(
            {"guid": update_fields["linked_mod_guid"]},
            {"_id": 0, "name": 1},
        )
        if mod_doc and mod_doc.get("name"):
            update_fields["linked_mod_name"] = str(mod_doc.get("name") or "")
    if update_fields.get("linked_mod_guid") == "":
        update_fields["linked_mod_name"] = ""

    update_fields["reviewed_at"] = datetime.now(timezone.utc)
    update_fields["reviewed_by"] = current_user.get("username", current_user.get("id", ""))

    result = await db.log_error_types.update_one(
        {"id": error_type_id},
        {"$set": update_fields},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Error type not found")

    item = await db.log_error_types.find_one({"id": error_type_id}, {"_id": 0})
    return _normalise_error_type_doc(item or {})


@router.get("/log-monitor/mods")
async def list_mods(
    search: Optional[str] = Query(None, alias="q"),
    current_user: dict = Depends(_require_servers),
):
    """Return all mods seen in log errors."""
    query: dict[str, Any] = {}
    if search:
        safe = _safe_regex(search)
        query["$or"] = [
            {"guid": {"$regex": safe, "$options": "i"}},
            {"name": {"$regex": safe, "$options": "i"}},
        ]
    cursor = db.log_mods.find(query, {"_id": 0}).sort("first_seen", -1)
    items = await cursor.to_list(500)
    for item in items:
        _serialise_datetimes(item, ("first_seen",))
    return items


@router.patch("/log-monitor/mods/{guid}")
async def update_mod(
    guid: str,
    body: ModUpdate,
    current_user: dict = Depends(_require_servers),
):
    """Update name and/or version of a tracked mod."""
    update_fields: dict[str, Any] = {}
    if body.name is not None:
        update_fields["name"] = body.name
    if body.version is not None:
        update_fields["version"] = body.version
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.log_mods.update_one({"guid": guid.upper()}, {"$set": update_fields})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Mod not found")
    return {"updated": True}


@router.get("/log-monitor/alerts")
async def list_alerts(
    resolved: Optional[bool] = Query(None),
    server: Optional[str] = Query(None),
    current_user: dict = Depends(_require_servers),
):
    """Return log alerts."""
    query: dict[str, Any] = {}
    if resolved is not None:
        query["resolved"] = resolved
    if server:
        query["server_id"] = server

    cursor = db.log_alerts.find(query, {"_id": 0}).sort("last_triggered", -1)
    items = await cursor.to_list(200)
    for item in items:
        _serialise_datetimes(item, ("created_at", "last_triggered", "resolved_at"))
    return items


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


@router.get("/log-monitor/stats")
async def error_stats(
    server: Optional[str] = Query(None),
    days: int = Query(14, ge=1, le=90),
    current_user: dict = Depends(_require_servers),
):
    """Return error counts grouped by day for the chart."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    match_stage: dict[str, Any] = {"timestamp": {"$gte": cutoff}}
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
            "date": row["_id"],
            "count": row["count"],
            "critical": row["critical"],
            "high": row["high"],
            "medium": row["medium"],
            "low": row["low"],
        }
        for row in result
    ]


@router.get("/log-monitor/servers")
async def list_servers_for_filter(
    current_user: dict = Depends(_require_servers),
):
    """Return a minimal list of servers for the log monitor filter UI."""
    cursor = db.managed_servers.find(
        {},
        {"_id": 0, "id": 1, "name": 1, "status": 1},
    ).sort("name", 1)
    return await cursor.to_list(200)
