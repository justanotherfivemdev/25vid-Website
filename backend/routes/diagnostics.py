"""Unified diagnostics API routes.

Provides:
  GET  /diagnostics/summary      — Combined stats from log monitor and mod issues
  GET  /diagnostics/mod/{mod_id} — All errors and issues for a given mod
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from middleware.rbac import require_permission, Permission

logger = logging.getLogger(__name__)
router = APIRouter()

_require_servers = require_permission(Permission.MANAGE_SERVERS)


@router.get("/diagnostics/summary")
async def diagnostics_summary(
    current_user: dict = Depends(_require_servers),
):
    """Return combined summary stats from log monitor and mod issues."""
    # Aggregate log monitor stats
    total_errors = await db.log_occurrences.count_documents({})
    critical_errors = await db.log_occurrences.count_documents({"severity": "critical"})
    high_errors = await db.log_occurrences.count_documents({"severity": "high"})
    error_type_count = await db.log_error_types.count_documents({})
    unresolved_alerts = await db.log_alerts.count_documents({"resolved": False})

    # Aggregate mod issues stats
    active_mod_issues = await db.mod_issues.count_documents({"status": "active"})
    monitoring_mod_issues = await db.mod_issues.count_documents({"status": "monitoring"})
    total_mod_issues = await db.mod_issues.count_documents({})

    # Count unique mods with issues
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
    }


@router.get("/diagnostics/mod/{mod_id}")
async def diagnostics_mod_detail(
    mod_id: str,
    current_user: dict = Depends(_require_servers),
):
    """Return all errors and issues for a given mod in one response."""
    # Get mod issues for this mod
    mod_issues = await db.mod_issues.find(
        {"mod_id": mod_id}, {"_id": 0}
    ).sort("confidence_score", -1).to_list(100)

    # Get log occurrences for this mod (by GUID)
    recent_errors = await db.log_occurrences.find(
        {"mod_guid": mod_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(50).to_list(50)

    # Get mod info from log_mods
    mod_info = await db.log_mods.find_one({"guid": mod_id}, {"_id": 0})

    # Serialise datetimes
    for item in recent_errors:
        for key in ("timestamp", "created_at"):
            if isinstance(item.get(key), datetime):
                item[key] = item[key].isoformat()

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
