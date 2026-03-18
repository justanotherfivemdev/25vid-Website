from datetime import datetime, timezone, date as date_type

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.loa import LOARequest, LOASubmit, LOAReview, LOAAdminCreate
from middleware.auth import get_current_user, get_current_admin
from services.audit_service import log_audit

router = APIRouter()


def _parse_date(val: str) -> date_type:
    """Parse an ISO date string to a date object."""
    return datetime.fromisoformat(val).date() if isinstance(val, str) else val


def _validate_loa_dates(start_date: str, end_date: str):
    """Validate LOA date range."""
    try:
        start = _parse_date(start_date)
        end = _parse_date(end_date)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid date format")
    if end <= start:
        raise HTTPException(status_code=400, detail="End date must be after start date")


# ── Member endpoints ─────────────────────────────────────────────────────────

@router.post("/loa/request")
async def submit_loa_request(data: LOASubmit, current_user: dict = Depends(get_current_user)):
    _validate_loa_dates(data.start_date, data.end_date)

    # Check for existing active or pending LOA
    existing = await db.loa_requests.find_one(
        {"user_id": current_user["id"], "status": {"$in": ["pending", "approved", "active"]}},
        {"_id": 0},
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="You already have a pending, approved, or active LOA request",
        )

    loa = LOARequest(
        user_id=current_user["id"],
        username=current_user.get("username", ""),
        start_date=data.start_date,
        end_date=data.end_date,
        reason=data.reason,
        notes=data.notes,
    )
    await db.loa_requests.insert_one(loa.model_dump())
    await log_audit(
        user_id=current_user["id"],
        action_type="loa_request_submit",
        resource_type="loa",
        resource_id=loa.id,
    )
    return {"message": "LOA request submitted", "id": loa.id}


@router.get("/loa/my-requests")
async def get_my_loa_requests(current_user: dict = Depends(get_current_user)):
    requests = await db.loa_requests.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return requests


@router.get("/loa/my-active")
async def get_my_active_loa(current_user: dict = Depends(get_current_user)):
    active = await db.loa_requests.find_one(
        {"user_id": current_user["id"], "status": "active"}, {"_id": 0}
    )
    return active


# ── Admin endpoints ──────────────────────────────────────────────────────────

@router.get("/admin/loa")
async def admin_list_loa(status: str = None, current_user: dict = Depends(get_current_admin)):
    query = {}
    if status:
        query["status"] = status
    requests = await db.loa_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return requests


@router.get("/admin/loa/stats")
async def admin_loa_stats(current_user: dict = Depends(get_current_admin)):
    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    results = await db.loa_requests.aggregate(pipeline).to_list(20)
    stats = {r["_id"]: r["count"] for r in results}
    return stats


@router.get("/admin/loa/{loa_id}")
async def admin_get_loa(loa_id: str, current_user: dict = Depends(get_current_admin)):
    loa = await db.loa_requests.find_one({"id": loa_id}, {"_id": 0})
    if not loa:
        raise HTTPException(status_code=404, detail="LOA request not found")
    return loa


@router.put("/admin/loa/{loa_id}/review")
async def admin_review_loa(loa_id: str, review: LOAReview, current_user: dict = Depends(get_current_admin)):
    loa = await db.loa_requests.find_one({"id": loa_id}, {"_id": 0})
    if not loa:
        raise HTTPException(status_code=404, detail="LOA request not found")

    now = datetime.now(timezone.utc).isoformat()
    update = {
        "status": review.status,
        "reviewed_by": current_user["id"],
        "reviewed_at": now,
    }
    if review.notes:
        update["notes"] = review.notes

    await db.loa_requests.update_one({"id": loa_id}, {"$set": update})
    await log_audit(
        user_id=current_user["id"],
        action_type="loa_review",
        resource_type="loa",
        resource_id=loa_id,
        before={"status": loa["status"]},
        after={"status": review.status},
    )
    return {"message": f"LOA {review.status}", "id": loa_id}


@router.put("/admin/loa/{loa_id}/activate")
async def admin_activate_loa(loa_id: str, current_user: dict = Depends(get_current_admin)):
    loa = await db.loa_requests.find_one({"id": loa_id}, {"_id": 0})
    if not loa:
        raise HTTPException(status_code=404, detail="LOA request not found")
    if loa["status"] != "approved":
        raise HTTPException(status_code=400, detail="Only approved LOA requests can be activated")

    now = datetime.now(timezone.utc).isoformat()
    await db.loa_requests.update_one({"id": loa_id}, {"$set": {"status": "active"}})
    await db.users.update_one({"id": loa["user_id"]}, {"$set": {"loa_status": "on_loa"}})
    await log_audit(
        user_id=current_user["id"],
        action_type="loa_activate",
        resource_type="loa",
        resource_id=loa_id,
        before={"status": loa["status"]},
        after={"status": "active"},
    )
    return {"message": "LOA activated", "id": loa_id}


@router.put("/admin/loa/{loa_id}/return")
async def admin_return_loa(loa_id: str, current_user: dict = Depends(get_current_admin)):
    loa = await db.loa_requests.find_one({"id": loa_id}, {"_id": 0})
    if not loa:
        raise HTTPException(status_code=404, detail="LOA request not found")
    if loa["status"] != "active":
        raise HTTPException(status_code=400, detail="Only active LOA requests can be returned")

    now = datetime.now(timezone.utc).isoformat()
    await db.loa_requests.update_one(
        {"id": loa_id},
        {"$set": {"status": "returned", "return_date": now}},
    )
    await db.users.update_one({"id": loa["user_id"]}, {"$set": {"loa_status": None}})
    await log_audit(
        user_id=current_user["id"],
        action_type="loa_return",
        resource_type="loa",
        resource_id=loa_id,
        before={"status": loa["status"]},
        after={"status": "returned"},
    )
    return {"message": "Member returned from LOA", "id": loa_id}


@router.post("/admin/loa/place")
async def admin_place_loa(data: LOAAdminCreate, current_user: dict = Depends(get_current_admin)):
    _validate_loa_dates(data.start_date, data.end_date)

    user = await db.users.find_one({"id": data.user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    loa = LOARequest(
        user_id=data.user_id,
        username=user.get("username", ""),
        start_date=data.start_date,
        end_date=data.end_date,
        reason=data.reason,
        notes=data.notes,
        status="active",
        reviewed_by=current_user["id"],
        reviewed_at=datetime.now(timezone.utc).isoformat(),
    )
    await db.loa_requests.insert_one(loa.model_dump())
    await db.users.update_one({"id": data.user_id}, {"$set": {"loa_status": "on_loa"}})
    await log_audit(
        user_id=current_user["id"],
        action_type="loa_place",
        resource_type="loa",
        resource_id=loa.id,
        metadata={"placed_user_id": data.user_id},
    )
    return {"message": "Member placed on LOA", "id": loa.id}
