import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.operations import Operation, OperationCreate, RSVPSubmit
from middleware.auth import get_current_user, get_current_admin
from services.map_service import upsert_map_event
from utils.mos_mapping import get_mos_display
from utils.billet_mapping import get_billet_display

router = APIRouter()


@router.get("/my-schedule")
async def get_my_schedule(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    all_ops = await db.operations.find({"rsvps.user_id": user_id}, {"_id": 0}).to_list(500)
    result = []
    for op in all_ops:
        my_rsvp = next((r for r in op.get("rsvps", []) if r["user_id"] == user_id), None)
        if my_rsvp:
            result.append({
                "id": op["id"],
                "title": op["title"],
                "date": op.get("date", ""),
                "time": op.get("time", ""),
                "operation_type": op.get("operation_type", "combat"),
                "my_status": my_rsvp["status"],
                "my_role_notes": my_rsvp.get("role_notes", ""),
                "attending_count": len([r for r in op.get("rsvps", []) if r["status"] == "attending"]),
                "max_participants": op.get("max_participants"),
            })
    result.sort(key=lambda x: x["date"])
    return result


@router.get("/operations", response_model=List[Operation])
async def get_operations():
    operations = await db.operations.find({}, {"_id": 0}).to_list(1000)
    for op in operations:
        if isinstance(op['created_at'], str):
            op['created_at'] = datetime.fromisoformat(op['created_at'])
    return operations


@router.get("/operations/{operation_id}", response_model=Operation)
async def get_operation(operation_id: str):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    if isinstance(operation['created_at'], str):
        operation['created_at'] = datetime.fromisoformat(operation['created_at'])
    return operation


@router.post("/operations", response_model=Operation)
async def create_operation(operation_data: OperationCreate, current_user: dict = Depends(get_current_admin)):
    op_dict = operation_data.model_dump()
    op_dict["created_by"] = current_user["id"]
    operation_obj = Operation(**op_dict)

    doc = operation_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.operations.insert_one(doc)
    await upsert_map_event("operation", doc, doc["id"])

    return operation_obj


@router.post("/operations/{operation_id}/rsvp")
async def rsvp_operation(operation_id: str, rsvp_data: RSVPSubmit, current_user: dict = Depends(get_current_user)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")

    user_id = current_user["id"]
    max_p = operation.get("max_participants")

    # Atomically remove any existing RSVP for this user first
    await db.operations.update_one(
        {"id": operation_id},
        {"$pull": {"rsvps": {"user_id": user_id}}}
    )

    if rsvp_data.status == "not_attending":
        # Promote first waitlisted user if there is capacity
        if max_p:
            refreshed = await db.operations.find_one({"id": operation_id}, {"_id": 0})
            rsvps = refreshed.get("rsvps", [])
            attending = [r for r in rsvps if r["status"] == "attending"]
            waitlisted = sorted(
                [r for r in rsvps if r["status"] == "waitlisted"],
                key=lambda r: r.get("rsvp_time") or "9999-12-31T23:59:59",
            )
            if len(attending) < max_p and waitlisted:
                promote_uid = waitlisted[0]["user_id"]
                await db.operations.update_one(
                    {"id": operation_id, "rsvps.user_id": promote_uid},
                    {"$set": {"rsvps.$.status": "attending"}}
                )
        updated = await db.operations.find_one({"id": operation_id}, {"_id": 0})
        return {"message": "RSVP removed", "rsvps": updated.get("rsvps", [])}

    assigned_status = rsvp_data.status
    if assigned_status == "attending" and max_p:
        refreshed = await db.operations.find_one({"id": operation_id}, {"_id": 0})
        current_attending = len([r for r in refreshed.get("rsvps", []) if r["status"] == "attending"])
        if current_attending >= max_p:
            assigned_status = "waitlisted"

    entry = {
        "user_id": user_id,
        "username": current_user["username"],
        "status": assigned_status,
        "role_notes": rsvp_data.role_notes or "",
        "rsvp_time": datetime.now(timezone.utc).isoformat()
    }

    # Atomically push the new RSVP entry
    await db.operations.update_one(
        {"id": operation_id},
        {"$push": {"rsvps": entry}}
    )

    updated = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    msg = "Waitlisted — operation at capacity" if assigned_status == "waitlisted" else f"RSVP set to {assigned_status}"
    return {"message": msg, "your_status": assigned_status, "rsvps": updated.get("rsvps", [])}


@router.delete("/operations/{operation_id}/rsvp")
async def cancel_rsvp(operation_id: str, current_user: dict = Depends(get_current_user)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")

    # Atomically remove the user's RSVP
    await db.operations.update_one(
        {"id": operation_id},
        {"$pull": {"rsvps": {"user_id": current_user["id"]}}}
    )

    max_p = operation.get("max_participants")
    if max_p:
        refreshed = await db.operations.find_one({"id": operation_id}, {"_id": 0})
        rsvps = refreshed.get("rsvps", [])
        attending = [r for r in rsvps if r["status"] == "attending"]
        waitlisted = sorted(
            [r for r in rsvps if r["status"] == "waitlisted"],
            key=lambda r: r.get("rsvp_time") or "9999-12-31T23:59:59",
        )
        if len(attending) < max_p and waitlisted:
            promote_uid = waitlisted[0]["user_id"]
            await db.operations.update_one(
                {"id": operation_id, "rsvps.user_id": promote_uid},
                {"$set": {"rsvps.$.status": "attending"}}
            )

    updated = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    return {"message": "RSVP cancelled", "rsvps": updated.get("rsvps", [])}


@router.get("/operations/{operation_id}/rsvp")
async def get_operation_rsvps(operation_id: str, current_user: dict = Depends(get_current_user)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    rsvps = operation.get("rsvps", [])
    attending = [r for r in rsvps if r["status"] == "attending"]
    tentative = [r for r in rsvps if r["status"] == "tentative"]
    waitlisted = [r for r in rsvps if r["status"] == "waitlisted"]
    return {"attending": attending, "tentative": tentative, "waitlisted": waitlisted,
            "counts": {"attending": len(attending), "tentative": len(tentative), "waitlisted": len(waitlisted)},
            "max_participants": operation.get("max_participants")}


@router.get("/operations/{operation_id}/roster")
async def get_operation_roster(operation_id: str, current_user: dict = Depends(get_current_user)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")

    rsvps = operation.get("rsvps", [])
    user_ids = [r["user_id"] for r in rsvps]

    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).to_list(len(user_ids))

    user_map = {u["id"]: u for u in users}

    enriched_rsvps = {"attending": [], "tentative": [], "waitlisted": []}
    mos_counter: dict = {}

    for r in rsvps:
        user_data = user_map.get(r["user_id"], {})
        mos_info = get_mos_display(user_data.get("specialization"), user_data.get("billet"))
        billet_info = get_billet_display(user_data.get("billet"))
        enriched = {
            "user_id": r["user_id"],
            "username": r.get("username", user_data.get("username", "Unknown")),
            "status": r["status"],
            "role_notes": r.get("role_notes", ""),
            "rsvp_time": r.get("rsvp_time", ""),
            "rank": user_data.get("rank"),
            "specialization": user_data.get("specialization"),
            "squad": user_data.get("squad"),
            "company": user_data.get("company"),
            "platoon": user_data.get("platoon"),
            "billet": user_data.get("billet"),
            "avatar_url": user_data.get("avatar_url"),
            "member_status": user_data.get("status", "recruit"),
            "mos_code": mos_info["mos_code"],
            "mos_title": mos_info["mos_title"],
            "billet_acronym": user_data.get("billet_acronym") or billet_info.get("acronym"),
        }

        if r["status"] == "attending":
            enriched_rsvps["attending"].append(enriched)
            mos_label = f"{mos_info['mos_code']} / {mos_info['mos_title']}"
            mos_counter[mos_label] = mos_counter.get(mos_label, 0) + 1
        elif r["status"] == "tentative":
            enriched_rsvps["tentative"].append(enriched)
        elif r["status"] == "waitlisted":
            enriched_rsvps["waitlisted"].append(enriched)

    return {
        "operation_id": operation_id,
        "title": operation.get("title", ""),
        "date": operation.get("date", ""),
        "time": operation.get("time", ""),
        "max_participants": operation.get("max_participants"),
        "rsvps": enriched_rsvps,
        "mos_summary": mos_counter,
        "counts": {
            "attending": len(enriched_rsvps["attending"]),
            "tentative": len(enriched_rsvps["tentative"]),
            "waitlisted": len(enriched_rsvps["waitlisted"]),
            "total": len(rsvps)
        }
    }
