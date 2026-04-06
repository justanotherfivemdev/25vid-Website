"""Unified diagnostics API routes."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from middleware.rbac import Permission, require_permission

logger = logging.getLogger(__name__)
router = APIRouter()

_require_servers = require_permission(Permission.MANAGE_SERVERS)

# ---------------------------------------------------------------------------
# AI diagnostics analysis – uses the same OPENAI_API_KEY as research_agent
# ---------------------------------------------------------------------------
_OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
_DIAGNOSTICS_AI_MODEL: str = os.environ.get(
    "DIAGNOSTICS_AI_MODEL", "gpt-4o-mini"
).strip() or "gpt-4o-mini"

_DIAGNOSTICS_SYSTEM_PROMPT = """\
You are a concise game-server diagnostics assistant for Arma Reforger dedicated \
servers.  Given an error pattern, its metadata, and recent occurrences, produce a \
short, plain-English analysis that a non-technical server administrator can understand.

You will receive contextual metadata for the error including its current curation \
state (review_status, attribution_type, actionability), any linked mod, occurrence \
frequency, and source streams.  Use this to produce more precise guidance.

Respond in **valid JSON** with exactly these keys (no markdown fences):
{
  "summary": "1-2 sentence plain-English explanation of what this error means.",
  "root_cause": "Most likely root cause in plain English.",
  "impact": "How this error affects the server or players.",
  "recommended_actions": ["action 1", "action 2"],
  "severity_assessment": "one of: harmless | low | moderate | high | critical",
  "is_safe_to_ignore": true or false,
  "suggested_review_status": "one of: active | monitoring | resolved | false_positive",
  "suggested_actionability": "one of: actionable | monitor | known_safe",
  "suggested_attribution": "one of: unknown | mod | backend | base_game | engine | rcon | battleye | config | network | performance"
}

Keep each field brief (1-3 sentences max).  Focus on practical guidance.  \
The suggested_* fields should reflect your best judgement on how operators should \
classify this error — for example, a benign engine-level warning should suggest \
\"false_positive\" review_status and \"known_safe\" actionability.
"""


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


# ---------------------------------------------------------------------------
# AI-powered error pattern analysis
# ---------------------------------------------------------------------------

class AIAnalysisRequest(BaseModel):
    error_type_id: str = Field(..., max_length=200)


@router.post("/diagnostics/ai-analyze")
async def ai_analyze_error_pattern(
    body: AIAnalysisRequest,
    current_user: dict = Depends(_require_servers),
):
    """Use OpenAI to produce a plain-English analysis of an error pattern."""
    if not _OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI analysis is not available – OPENAI_API_KEY is not configured.",
        )

    # Fetch the error type document
    error_type = await db.log_error_types.find_one(
        {"id": body.error_type_id}, {"_id": 0}
    )
    if not error_type:
        raise HTTPException(status_code=404, detail="Error type not found")

    # Fetch a handful of recent occurrences for context
    recent_occs = (
        await db.log_occurrences.find(
            {"error_type_id": body.error_type_id}, {"_id": 0, "raw": 1, "message": 1}
        )
        .sort("timestamp", -1)
        .limit(5)
        .to_list(5)
    )
    sample_messages = [
        (occ.get("raw") or occ.get("message") or "")[:400] for occ in recent_occs
    ]

    user_prompt = (
        f"Error label: {error_type.get('label', 'Unknown')}\n"
        f"Severity: {error_type.get('severity', 'unknown')}\n"
        f"Category: {error_type.get('category', 'unknown')}\n"
        f"Attribution: {error_type.get('attribution_type', 'unknown')}\n"
        f"Current review status: {error_type.get('review_status', 'active')}\n"
        f"Current actionability: {error_type.get('actionability', 'actionable')}\n"
        f"Source streams: {', '.join(error_type.get('source_streams', [])) or 'unknown'}\n"
        f"Linked mod: {error_type.get('linked_mod_name', '') or 'none'}"
        f"{' (' + error_type.get('linked_mod_guid', '') + ')' if error_type.get('linked_mod_guid') else ''}\n"
        f"Normalised pattern: {error_type.get('normalised_message', '')}\n"
        f"Example raw message: {(error_type.get('example_raw') or '')[:600]}\n"
        f"Total occurrences: {error_type.get('total_occurrences', 0)}\n"
        f"First seen: {error_type.get('first_seen', 'unknown')}\n"
        f"Last seen: {error_type.get('last_seen', 'unknown')}\n"
        f"Curation notes: {error_type.get('curation_notes', '')}\n"
        f"\nRecent occurrence samples:\n"
        + "\n---\n".join(sample_messages[:5])
    )

    headers = {
        "Authorization": f"Bearer {_OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _DIAGNOSTICS_AI_MODEL,
        "messages": [
            {"role": "system", "content": _DIAGNOSTICS_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 800,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
            )
        if resp.status_code != 200:
            logger.warning("OpenAI API error %s: %s", resp.status_code, resp.text[:300])
            raise HTTPException(
                status_code=502,
                detail="AI service returned an error. Please try again later.",
            )

        data = resp.json()
        raw_content = (
            data.get("choices", [{}])[0].get("message", {}).get("content", "")
        )

        # Strip markdown fences if present (handles ```json etc.)
        cleaned = raw_content.strip()
        if cleaned.startswith("```"):
            first_newline = cleaned.find("\n")
            if first_newline != -1:
                cleaned = cleaned[first_newline + 1:]
            else:
                cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            analysis = json.loads(cleaned)
        except json.JSONDecodeError:
            analysis = {
                "summary": cleaned[:500] if cleaned else "Unable to parse AI response.",
                "root_cause": "",
                "impact": "",
                "recommended_actions": [],
                "severity_assessment": "unknown",
                "is_safe_to_ignore": False,
            }

        return {
            "analysis": analysis,
            "error_type_id": body.error_type_id,
            "model": _DIAGNOSTICS_AI_MODEL,
        }

    except httpx.HTTPError as exc:
        logger.warning("OpenAI request failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Could not reach AI service. Please try again later.",
        )
