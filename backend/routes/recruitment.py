import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.recruitment import (
    OpenBillet, OpenBilletUpdate,
    PublicApplicationCreate, ApplicationReviewUpdate,
    RecruitApplication,
)
from middleware.auth import get_current_user, get_current_admin
from middleware.rbac import require_permission, Permission
from services.auth_service import normalize_email

router = APIRouter()


@router.get("/recruitment/billets")
async def get_open_billets():
    billets = await db.open_billets.find(
        {"is_open": True},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return billets


@router.get("/admin/recruitment/billets")
async def get_all_billets(current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    billets = await db.open_billets.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return billets


@router.post("/admin/recruitment/billets")
async def create_billet(billet: OpenBillet, current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    billet_dict = billet.model_dump()
    billet_dict["created_at"] = billet_dict["created_at"].isoformat()
    await db.open_billets.insert_one(billet_dict)
    return {"message": "Billet created", "id": billet.id}


@router.put("/admin/recruitment/billets/{billet_id}")
async def update_billet(billet_id: str, updates: OpenBilletUpdate, current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.open_billets.update_one(
        {"id": billet_id},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Billet not found")
    return {"message": "Billet updated"}


@router.delete("/admin/recruitment/billets/{billet_id}")
async def delete_billet(billet_id: str, current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    result = await db.open_billets.delete_one({"id": billet_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Billet not found")
    return {"message": "Billet deleted"}


@router.post("/recruitment/apply")
async def submit_application(application: PublicApplicationCreate):
    app_dict = application.model_dump()
    app_dict["id"] = str(uuid.uuid4())
    app_dict["applicant_email"] = normalize_email(app_dict["applicant_email"])
    app_dict["status"] = "pending"
    app_dict["admin_notes"] = None
    app_dict["submitted_at"] = datetime.now(timezone.utc).isoformat()
    app_dict["reviewed_at"] = None
    app_dict["reviewed_by"] = None
    await db.applications.insert_one(app_dict)
    return {"message": "Application submitted successfully", "id": app_dict["id"]}


@router.get("/admin/recruitment/applications")
async def get_applications(status: Optional[str] = None, current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    query = {}
    if status:
        query["status"] = status
    applications = await db.applications.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(500)
    return applications


@router.get("/admin/recruitment/applications/{application_id}")
async def get_application(application_id: str, current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    app = await db.applications.find_one({"id": application_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.put("/admin/recruitment/applications/{application_id}")
async def update_application(application_id: str, updates: ApplicationReviewUpdate, current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    update_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_dict["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["reviewed_by"] = current_user["username"]
    result = await db.applications.update_one(
        {"id": application_id},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"message": "Application updated"}


@router.get("/admin/recruitment/stats")
async def get_recruitment_stats(current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    total = await db.applications.count_documents({})
    pending = await db.applications.count_documents({"status": "pending"})
    reviewing = await db.applications.count_documents({"status": "reviewing"})
    accepted = await db.applications.count_documents({"status": "accepted"})
    rejected = await db.applications.count_documents({"status": "rejected"})
    open_billets = await db.open_billets.count_documents({"is_open": True})

    return {
        "total_applications": total,
        "pending": pending,
        "reviewing": reviewing,
        "accepted": accepted,
        "rejected": rejected,
        "open_billets": open_billets
    }


@router.get("/recruit/my-application")
async def get_my_application(current_user: dict = Depends(get_current_user)):
    app = await db.applications.find_one(
        {"applicant_email": current_user["email"]},
        {"_id": 0}
    )
    return app


@router.post("/recruit/apply")
async def recruit_submit_application(
    application: RecruitApplication,
    current_user: dict = Depends(get_current_user)
):
    existing = await db.applications.find_one({"applicant_email": current_user["email"]})
    if existing:
        raise HTTPException(status_code=400, detail="You have already submitted an application")

    app_dict = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "applicant_name": current_user["username"],
        "applicant_email": current_user["email"],
        "billet_id": application.billet_id,
        "campaign_id": application.campaign_id,
        "objective_id": application.objective_id,
        "operation_id": application.operation_id,
        "discord_username": application.discord_username or current_user.get("discord_username"),
        "timezone": application.timezone,
        "experience": application.experience,
        "availability": application.availability,
        "why_join": application.why_join,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "admin_notes": None,
        "reviewed_at": None,
        "reviewed_by": None
    }

    await db.applications.insert_one(app_dict)

    if application.discord_username:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"discord_username": application.discord_username}}
        )

    return {"message": "Application submitted successfully", "id": app_dict["id"]}
