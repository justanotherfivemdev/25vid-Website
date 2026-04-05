"""Unified diagnostics API routes."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends

from database import db
from middleware.rbac import Permission, require_permission

logger = logging.getLogger(__name__)
router = APIRouter()

_require_servers = require_permission(Permission.MANAGE_SERVERS)


@router.get("/diagnostics/summary")
async def diagnostics_summary(
    current_user: dict = Depends(_require_servers),
):
    """Return combined summary stats from log monitor and mod issues."""
    total_errors = await db.log_occurrences.count_documents({})
    critical_errors = await db.log_occurrences.count_documents({"severity": "critical"})
    high_errors = await db.log_occurrences.count_documents({"severity": "high"})
    error_type_count = await db.log_error_types.count_documents({})
    unresolved_alerts = await db.log_alerts.count_documents({"resolved": False})

    active_mod_issues = await db.mod_issues.count_documents({"status": "active"})
    monitoring_mod_issues = await db.mod_issues.count_documents({"status": "monitoring"})
    total_mod_issues = await db.mod_issues.count_documents({})
    troublesome_mods = await db.mod_issues.count_documents({"troublesome": True})
    curated_error_types = await db.log_error_types.count_documents({"reviewed_by": {"$ne": ""}})

    mods_pipeline = [
        {"$match": {"status": {"$in": ["active", "monitoring"]}}},
        {"$group": {"_id": "$mod_id"}},
        {"$count": "count"},
    ]
    mods_result = await db.mod_issues.aggregate(mods_pipeline).to_list(1)
    mods_with_issues = mods_result[0]["count"] if mods_result else 0

    return {
        "total_errors": total_errors,
        "critical_errors": critical_errors,
        "high_errors": high_errors,
        "error_type_count": error_type_count,
        "unresolved_alerts": unresolved_alerts,
        "active_mod_issues": active_mod_issues,
        "monitoring_mod_issues": monitoring_mod_issues,
        "total_mod_issues": total_mod_issues,
        "mods_with_issues": mods_with_issues,
        "troublesome_mods": troublesome_mods,
        "curated_error_types": curated_error_types,
    }


@router.get("/diagnostics/troublesome-mods")
async def diagnostics_troublesome_mods(
    current_user: dict = Depends(_require_servers),
):
    """Return an aggregated list of mods flagged as troublesome."""
    issue_pipeline = [
        {
            "$match": {
                "troublesome": True,
                "mod_id": {"$nin": ["", "unattributed"]},
            }
        },
        {
            "$group": {
                "_id": "$mod_id",
                "mod_name": {"$last": "$mod_name"},
                "issue_count": {"$sum": 1},
                "total_occurrences": {"$sum": "$occurrence_count"},
                "last_seen": {"$max": "$last_seen"},
                "reason": {"$last": "$troublesome_reason"},
                "source_categories": {"$addToSet": "$source_category"},
                "designated_areas": {"$addToSet": "$designated_area"},
                "attribution_types": {"$addToSet": "$attribution_type"},
            }
        },
    ]
    error_type_pipeline = [
        {
            "$match": {
                "troublesome": True,
                "linked_mod_guid": {"$ne": ""},
            }
        },
        {
            "$group": {
                "_id": "$linked_mod_guid",
                "mod_name": {"$last": "$linked_mod_name"},
                "error_type_count": {"$sum": 1},
                "pattern_occurrences": {"$sum": "$total_occurrences"},
                "last_seen": {"$max": "$last_seen"},
                "designated_areas": {"$addToSet": "$designated_area"},
                "attribution_types": {"$addToSet": "$attribution_type"},
            }
        },
    ]

    issue_rows = await db.mod_issues.aggregate(issue_pipeline).to_list(500)
    error_rows = await db.log_error_types.aggregate(error_type_pipeline).to_list(500)

    combined: dict[str, dict] = {}
    for row in issue_rows:
        mod_id = str(row.get("_id") or "")
        if not mod_id:
            continue
        combined[mod_id] = {
            "mod_id": mod_id,
            "mod_name": row.get("mod_name") or mod_id,
            "issue_count": int(row.get("issue_count") or 0),
            "error_type_count": 0,
            "total_occurrences": int(row.get("total_occurrences") or 0),
            "pattern_occurrences": 0,
            "last_seen": row.get("last_seen"),
            "reason": row.get("reason") or "",
            "source_categories": sorted({value for value in (row.get("source_categories") or []) if value}),
            "designated_areas": sorted({value for value in (row.get("designated_areas") or []) if value}),
            "attribution_types": sorted({value for value in (row.get("attribution_types") or []) if value}),
        }

    for row in error_rows:
        mod_id = str(row.get("_id") or "")
        if not mod_id:
            continue
        entry = combined.setdefault(
            mod_id,
            {
                "mod_id": mod_id,
                "mod_name": row.get("mod_name") or mod_id,
                "issue_count": 0,
                "error_type_count": 0,
                "total_occurrences": 0,
                "pattern_occurrences": 0,
                "last_seen": row.get("last_seen"),
                "reason": "",
                "source_categories": [],
                "designated_areas": [],
                "attribution_types": [],
            },
        )
        entry["mod_name"] = entry.get("mod_name") or row.get("mod_name") or mod_id
        entry["error_type_count"] += int(row.get("error_type_count") or 0)
        entry["pattern_occurrences"] += int(row.get("pattern_occurrences") or 0)
        last_seen = row.get("last_seen")
        if last_seen and (not entry.get("last_seen") or last_seen > entry["last_seen"]):
            entry["last_seen"] = last_seen
        entry["designated_areas"] = sorted(
            {value for value in set(entry.get("designated_areas") or []).union(row.get("designated_areas") or []) if value}
        )
        entry["attribution_types"] = sorted(
            {value for value in set(entry.get("attribution_types") or []).union(row.get("attribution_types") or []) if value}
        )

    items = sorted(
        combined.values(),
        key=lambda item: (
            -(int(item.get("issue_count") or 0) + int(item.get("error_type_count") or 0)),
            -(int(item.get("total_occurrences") or 0) + int(item.get("pattern_occurrences") or 0)),
            str(item.get("mod_name") or ""),
        ),
    )
    for item in items:
        if isinstance(item.get("last_seen"), datetime):
            item["last_seen"] = item["last_seen"].isoformat()
    return items


@router.get("/diagnostics/mod/{mod_id}")
async def diagnostics_mod_detail(
    mod_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Return all errors and issues for a given mod in one response."""
    mod_issues = await db.mod_issues.find(
        {"mod_id": mod_id},
        {"_id": 0},
    ).sort("confidence_score", -1).to_list(100)

    recent_errors = await db.log_occurrences.find(
        {"mod_guid": mod_id},
        {"_id": 0},
    ).sort("timestamp", -1).limit(50).to_list(50)

    mod_info = await db.log_mods.find_one({"guid": mod_id}, {"_id": 0})

    for item in recent_errors:
        for key in ("timestamp", "created_at"):
            value = item.get(key)
            if isinstance(value, datetime):
                item[key] = value.isoformat()

    if mod_info and isinstance(mod_info.get("first_seen"), datetime):
        mod_info["first_seen"] = mod_info["first_seen"].isoformat()

    return {
        "mod_id": mod_id,
        "mod_info": mod_info,
        "issues": mod_issues,
        "recent_errors": recent_errors,
        "issue_count": len(mod_issues),
        "error_count": len(recent_errors),
    }
