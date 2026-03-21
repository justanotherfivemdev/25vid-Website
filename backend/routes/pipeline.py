from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.pipeline import PipelineStatusUpdate, PipelineNote, PIPELINE_STAGES
from middleware.auth import get_current_admin
from middleware.rbac import require_permission, Permission
from services.audit_service import log_audit

router = APIRouter()


@router.get("/admin/pipeline")
async def list_pipeline(stage: str = None, current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    query = {}
    if stage:
        query["pipeline_stage"] = stage
    users = await db.users.find(
        query,
        {"_id": 0, "password_hash": 0, "email": 0}
    ).sort("username", 1).to_list(1000)

    result = []
    for u in users:
        result.append({
            "id": u["id"],
            "username": u.get("username"),
            "rank": u.get("rank"),
            "status": u.get("status"),
            "pipeline_stage": u.get("pipeline_stage"),
            "join_date": u.get("join_date"),
            "is_active": u.get("is_active", True),
        })
    return result


@router.get("/admin/pipeline/stats")
async def pipeline_stats(current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    pipeline = [
        {"$group": {"_id": "$pipeline_stage", "count": {"$sum": 1}}}
    ]
    results = await db.users.aggregate(pipeline).to_list(20)
    stats = {(r["_id"] or "unset"): r["count"] for r in results}
    return stats


@router.get("/admin/pipeline/{user_id}")
async def get_pipeline_detail(user_id: str, current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT))):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user["id"],
        "username": user.get("username"),
        "rank": user.get("rank"),
        "status": user.get("status"),
        "pipeline_stage": user.get("pipeline_stage"),
        "pipeline_history": user.get("pipeline_history", []),
        "pipeline_notes": user.get("pipeline_notes", []),
        "join_date": user.get("join_date"),
        "is_active": user.get("is_active", True),
    }


@router.put("/admin/pipeline/{user_id}/stage")
async def update_pipeline_stage(
    user_id: str,
    data: PipelineStatusUpdate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT)),
):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_stage = user.get("pipeline_stage")
    transition = {
        "from_stage": old_stage,
        "to_stage": data.stage,
        "changed_by": current_user["id"],
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "notes": data.notes,
    }

    update: dict = {
        "pipeline_stage": data.stage,
    }

    # Map pipeline stage to user status / active flag
    if data.stage == "active_member":
        update["status"] = "member"
    elif data.stage == "probationary":
        update["status"] = "recruit"
    elif data.stage in ("rejected", "dropped", "archived"):
        update["is_active"] = False

    await db.users.update_one(
        {"id": user_id},
        {
            "$set": update,
            "$push": {"pipeline_history": transition},
        },
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="pipeline_stage_change",
        resource_type="user",
        resource_id=user_id,
        before={"pipeline_stage": old_stage},
        after={"pipeline_stage": data.stage},
    )
    return {"message": f"Pipeline stage updated to {data.stage}", "user_id": user_id}


@router.post("/admin/pipeline/{user_id}/notes")
async def add_pipeline_note(
    user_id: str,
    data: PipelineNote,
    current_user: dict = Depends(require_permission(Permission.MANAGE_RECRUITMENT)),
):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    note = {
        "author": current_user.get("username", current_user["id"]),
        "text": data.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.users.update_one(
        {"id": user_id},
        {"$push": {"pipeline_notes": note}},
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="pipeline_note_add",
        resource_type="user",
        resource_id=user_id,
    )
    return {"message": "Note added", "note": note}
