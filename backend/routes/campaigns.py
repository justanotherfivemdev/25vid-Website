import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.campaign import CampaignCreate, CampaignUpdate
from middleware.auth import get_current_user, get_current_admin
from services.map_service import upsert_map_event, remove_map_event

router = APIRouter()


def _fix_dates(c):
    if isinstance(c.get("created_at"), str):
        c["created_at"] = datetime.fromisoformat(c["created_at"])
    if c.get("updated_at") and isinstance(c["updated_at"], str):
        c["updated_at"] = datetime.fromisoformat(c["updated_at"])


@router.get("/campaigns")
async def get_campaigns(current_user: dict = Depends(get_current_user)):
    campaigns = await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for c in campaigns:
        _fix_dates(c)
    return campaigns


@router.get("/campaigns/active")
async def get_active_campaign(current_user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"status": "active"}, {"_id": 0})
    if not campaign:
        return None
    _fix_dates(campaign)
    return campaign


@router.get("/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, current_user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _fix_dates(campaign)
    return campaign


@router.post("/admin/campaigns")
async def create_campaign(data: CampaignCreate, current_user: dict = Depends(get_current_admin)):
    d = data.model_dump()
    d["id"] = str(uuid.uuid4())
    d["created_by"] = current_user["id"]
    d["created_at"] = datetime.now(timezone.utc).isoformat()
    d["updated_at"] = None
    for p in d.get("phases", []):
        if not p.get("id"):
            p["id"] = str(uuid.uuid4())
    for o in d.get("objectives", []):
        if not o.get("id"):
            o["id"] = str(uuid.uuid4())
    await db.campaigns.insert_one(d)
    await upsert_map_event("campaign", d, d["id"])
    d.pop("_id", None)
    _fix_dates(d)
    return d


@router.put("/admin/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, data: CampaignUpdate, current_user: dict = Depends(get_current_admin)):
    existing = await db.campaigns.find_one({"id": campaign_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    for p in updates.get("phases", []):
        if not p.get("id"):
            p["id"] = str(uuid.uuid4())
    for o in updates.get("objectives", []):
        if not o.get("id"):
            o["id"] = str(uuid.uuid4())
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.campaigns.update_one({"id": campaign_id}, {"$set": updates})
    updated = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if updated:
        await upsert_map_event("campaign", updated, campaign_id)
    _fix_dates(updated)
    return updated


@router.delete("/admin/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.campaigns.delete_one({"id": campaign_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await remove_map_event("campaign", campaign_id)
    return {"message": "Campaign deleted"}
