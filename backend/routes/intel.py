import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.intel import IntelBriefingCreate, IntelBriefingUpdate
from middleware.auth import get_current_user, get_current_admin
from services.map_service import upsert_map_event, remove_map_event

router = APIRouter()


def _fix_dates(b):
    if isinstance(b.get("created_at"), str):
        b["created_at"] = datetime.fromisoformat(b["created_at"])
    if b.get("updated_at") and isinstance(b["updated_at"], str):
        b["updated_at"] = datetime.fromisoformat(b["updated_at"])


@router.get("/intel")
async def get_intel_briefings(
    category: Optional[str] = None,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    classification: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user.get("role") != "admin":
        query["visibility_scope"] = {"$ne": "admin_only"}
    if category:
        query["category"] = category
    if classification:
        query["classification"] = classification
    if tag:
        query["tags"] = tag
    if search:
        safe = re.escape(search)[:100]
        query["$or"] = [
            {"title": {"$regex": safe, "$options": "i"}},
            {"content": {"$regex": safe, "$options": "i"}}
        ]
    briefings = await db.intel_briefings.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    b_ids = [b["id"] for b in briefings]
    ack_pipeline = [
        {"$match": {"briefing_id": {"$in": b_ids}}},
        {"$group": {"_id": "$briefing_id", "count": {"$sum": 1}}}
    ]
    ack_counts = {r["_id"]: r["count"] for r in await db.intel_acknowledgments.aggregate(ack_pipeline).to_list(500)}
    user_acks = set()
    async for a in db.intel_acknowledgments.find({"briefing_id": {"$in": b_ids}, "user_id": current_user["id"]}, {"briefing_id": 1, "_id": 0}):
        user_acks.add(a["briefing_id"])
    for b in briefings:
        _fix_dates(b)
        b["ack_count"] = ack_counts.get(b["id"], 0)
        b["user_acknowledged"] = b["id"] in user_acks
    return briefings


@router.get("/intel/tags")
async def get_intel_tags(current_user: dict = Depends(get_current_user)):
    pipeline = []
    if current_user.get("role") != "admin":
        pipeline.append({"$match": {"visibility_scope": {"$ne": "admin_only"}}})
    pipeline.extend([
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags"}},
        {"$sort": {"_id": 1}},
    ])
    results = await db.intel_briefings.aggregate(pipeline).to_list(200)
    return [r["_id"] for r in results]


@router.get("/intel/{briefing_id}")
async def get_intel_briefing(briefing_id: str, current_user: dict = Depends(get_current_user)):
    briefing = await db.intel_briefings.find_one({"id": briefing_id}, {"_id": 0})
    if not briefing:
        raise HTTPException(status_code=404, detail="Briefing not found")
    if current_user.get("role") != "admin" and briefing.get("visibility_scope") == "admin_only":
        raise HTTPException(status_code=404, detail="Briefing not found")
    _fix_dates(briefing)
    ack_count = await db.intel_acknowledgments.count_documents({"briefing_id": briefing_id})
    user_ack = await db.intel_acknowledgments.find_one({"briefing_id": briefing_id, "user_id": current_user["id"]})
    briefing["ack_count"] = ack_count
    briefing["user_acknowledged"] = user_ack is not None
    return briefing


@router.post("/intel/{briefing_id}/acknowledge")
async def acknowledge_briefing(briefing_id: str, current_user: dict = Depends(get_current_user)):
    exists = await db.intel_briefings.find_one({"id": briefing_id})
    if not exists:
        raise HTTPException(status_code=404, detail="Briefing not found")
    already = await db.intel_acknowledgments.find_one({"briefing_id": briefing_id, "user_id": current_user["id"]})
    if already:
        return {"message": "Already acknowledged", "ack_count": await db.intel_acknowledgments.count_documents({"briefing_id": briefing_id})}
    doc = {
        "briefing_id": briefing_id,
        "user_id": current_user["id"],
        "username": current_user["username"],
        "rank": current_user.get("rank", ""),
        "company": current_user.get("company", ""),
        "acknowledged_at": datetime.now(timezone.utc).isoformat()
    }
    await db.intel_acknowledgments.insert_one(doc)
    count = await db.intel_acknowledgments.count_documents({"briefing_id": briefing_id})
    return {"message": "Acknowledged", "ack_count": count}


@router.delete("/intel/{briefing_id}/acknowledge")
async def unacknowledge_briefing(briefing_id: str, current_user: dict = Depends(get_current_user)):
    await db.intel_acknowledgments.delete_one({"briefing_id": briefing_id, "user_id": current_user["id"]})
    count = await db.intel_acknowledgments.count_documents({"briefing_id": briefing_id})
    return {"message": "Unacknowledged", "ack_count": count}


@router.get("/admin/intel/{briefing_id}/acknowledgments")
async def get_briefing_acknowledgments(briefing_id: str, current_user: dict = Depends(get_current_admin)):
    acks = await db.intel_acknowledgments.find({"briefing_id": briefing_id}, {"_id": 0}).sort("acknowledged_at", -1).to_list(500)
    for a in acks:
        if isinstance(a.get("acknowledged_at"), str):
            a["acknowledged_at"] = datetime.fromisoformat(a["acknowledged_at"])
    return acks


@router.post("/admin/intel")
async def create_intel_briefing(data: IntelBriefingCreate, current_user: dict = Depends(get_current_admin)):
    briefing_dict = data.model_dump()
    briefing_dict["id"] = str(uuid.uuid4())
    briefing_dict["author_id"] = current_user["id"]
    briefing_dict["author_name"] = current_user["username"]
    briefing_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    briefing_dict["updated_at"] = None
    await db.intel_briefings.insert_one(briefing_dict)
    await upsert_map_event("intel", briefing_dict, briefing_dict["id"])
    briefing_dict.pop("_id", None)
    briefing_dict["created_at"] = datetime.fromisoformat(briefing_dict["created_at"])
    return briefing_dict


@router.put("/admin/intel/{briefing_id}")
async def update_intel_briefing(briefing_id: str, data: IntelBriefingUpdate, current_user: dict = Depends(get_current_admin)):
    existing = await db.intel_briefings.find_one({"id": briefing_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Briefing not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.intel_briefings.update_one({"id": briefing_id}, {"$set": updates})
    updated = await db.intel_briefings.find_one({"id": briefing_id}, {"_id": 0})
    if isinstance(updated.get("created_at"), str):
        updated["created_at"] = datetime.fromisoformat(updated["created_at"])
    if updated.get("updated_at") and isinstance(updated["updated_at"], str):
        updated["updated_at"] = datetime.fromisoformat(updated["updated_at"])
    if updated:
        await upsert_map_event("intel", updated, briefing_id)
    return updated


@router.delete("/admin/intel/{briefing_id}")
async def delete_intel_briefing(briefing_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.intel_briefings.delete_one({"id": briefing_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Briefing not found")
    await db.intel_acknowledgments.delete_many({"briefing_id": briefing_id})
    await remove_map_event("intel", briefing_id)
    return {"message": "Briefing deleted"}
