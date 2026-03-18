import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request

from database import db
from models.research import ResearchQueryRequest
from middleware.auth import get_current_user
from services.map_service import upsert_map_event

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_research_agent():
    from backend.services.research_agent import (
        run_research_query,
        result_to_campaign_intel,
        result_to_map_events,
        result_to_intel_briefing,
    )
    return run_research_query, result_to_campaign_intel, result_to_map_events, result_to_intel_briefing


@router.post("/research-agent/query")
async def research_agent_query(
    data: ResearchQueryRequest,
    current_user: dict = Depends(get_current_user),
):
    query = data.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    try:
        run_query, to_campaign_intel, to_map_events, to_intel_briefing = _get_research_agent()
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Research agent service unavailable: {exc}",
        )

    try:
        result = await run_query(query)
    except Exception as exc:
        logger.error("Research agent error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Research agent error: {exc}")

    created_briefing_id: Optional[str] = None
    created_map_event_ids: list = []

    if data.attach_to_campaign_id:
        campaign = await db.campaigns.find_one({"id": data.attach_to_campaign_id})
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        briefing_doc = to_campaign_intel(
            result,
            campaign_id=data.attach_to_campaign_id,
            author_id=current_user["id"],
            author_name=current_user.get("username", "Research Agent"),
        )
        await db.intel_briefings.insert_one(briefing_doc)
        briefing_doc.pop("_id", None)
        await upsert_map_event("intel", briefing_doc, briefing_doc["id"])
        created_briefing_id = briefing_doc["id"]

    elif data.post_to_intel_board:
        briefing_doc = to_intel_briefing(
            result,
            author_id=current_user["id"],
            author_name=current_user.get("username", "Research Agent"),
        )
        await db.intel_briefings.insert_one(briefing_doc)
        briefing_doc.pop("_id", None)
        await upsert_map_event("intel", briefing_doc, briefing_doc["id"])
        created_briefing_id = briefing_doc["id"]

    if data.add_to_threat_map:
        now = datetime.now(timezone.utc).isoformat()
        map_events = to_map_events(result)
        for evt in map_events:
            await db.map_events.update_one(
                {"id": evt["id"]},
                {"$set": evt, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
            created_map_event_ids.append(evt["id"])

    return {
        "result": result,
        "created_briefing_id": created_briefing_id,
        "created_map_event_ids": created_map_event_ids,
    }


@router.post("/research-agent/attach-to-campaign/{campaign_id}")
async def research_agent_attach_campaign(
    campaign_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    body = await request.json()
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        run_query, to_campaign_intel, _, _ = _get_research_agent()
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Research agent service unavailable: {exc}")

    try:
        result = await run_query(query)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Research agent error: {exc}")

    briefing_doc = to_campaign_intel(
        result,
        campaign_id=campaign_id,
        author_id=current_user["id"],
        author_name=current_user.get("username", "Research Agent"),
    )
    await db.intel_briefings.insert_one(briefing_doc)
    briefing_doc.pop("_id", None)
    await upsert_map_event("intel", briefing_doc, briefing_doc["id"])

    return {
        "message": "Intel attached to campaign",
        "briefing_id": briefing_doc["id"],
        "result": result,
    }


@router.post("/research-agent/post-briefing")
async def research_agent_post_briefing(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    body = await request.json()
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    try:
        run_query, _, _, to_intel_briefing = _get_research_agent()
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Research agent service unavailable: {exc}")

    try:
        result = await run_query(query)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Research agent error: {exc}")

    briefing_doc = to_intel_briefing(
        result,
        author_id=current_user["id"],
        author_name=current_user.get("username", "Research Agent"),
    )
    await db.intel_briefings.insert_one(briefing_doc)
    briefing_doc.pop("_id", None)
    await upsert_map_event("intel", briefing_doc, briefing_doc["id"])

    return {
        "message": "Intel briefing posted to board",
        "briefing_id": briefing_doc["id"],
        "result": result,
    }
