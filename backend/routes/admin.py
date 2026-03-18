import uuid
import secrets
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from pydantic import BaseModel, EmailStr

from config import UPLOAD_DIR, pwd_context
from database import db
from models.user import (
    User, UserUpdate, AdminProfileUpdate, UserImportRequest, UserImportResponse,
    UserImportRowResult, MissionHistoryEntry, TrainingHistoryEntry, AwardEntry,
)
from models.operations import OperationCreate
from models.content import AnnouncementCreate, GalleryImageCreate, TrainingCreate
from models.common import HistoryEntry, HistoryEntryCreate
from middleware.auth import get_current_user, get_current_admin
from services.auth_service import user_to_response, normalize_email
from services.audit_service import log_audit
from services.map_service import upsert_map_event, remove_map_event
from services.import_service import upsert_user_from_import
from google_sheets_import import (
    GoogleSheetsImportError,
    parse_spreadsheet_id,
    fetch_sheet_rows,
    build_field_mapping,
    row_to_mapped_fields,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# Site content management

@router.get("/admin/site-content")
async def get_site_content(current_user: dict = Depends(get_current_admin)):
    content = await db.site_content.find_one({"id": "site_content"}, {"_id": 0})
    if not content:
        return {
            "id": "site_content",
            "hero": {"backgroundImage": "", "tagline": "TROPIC LIGHTNING", "subtitle": "Ready to Strike — Anywhere, Anytime"},
            "nav": {"brandName": "25TH INFANTRY DIVISION", "buttonText": "ENLIST NOW"},
            "about": {"paragraph1": "", "paragraph2": "", "quote": {"text": "", "author": "", "backgroundImage": ""}},
            "operationalSuperiority": {"description": "", "images": []},
            "lethality": {"logistics": {"description": "", "image": ""}, "training": {"description": "", "image": ""}},
            "gallery": {"showcaseImages": []},
            "partnerLogin": {"backgroundImage": "", "showBackground": True, "overlayOpacity": 0.85},
            "footer": {"description": "Tropic Lightning — Ready to Strike", "contact": {"discord": "", "email": ""}, "disclaimer": "This is a fictional Arma Reforger milsim unit. We are NOT in any way tied to the Department of War or the United States Department of Defense."}
        }
    if isinstance(content.get('updated_at'), str):
        content['updated_at'] = datetime.fromisoformat(content['updated_at'])
    return content


@router.put("/admin/site-content")
async def update_site_content(content: dict, current_user: dict = Depends(get_current_admin)):
    content["id"] = "site_content"
    content["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.site_content.update_one(
        {"id": "site_content"},
        {"$set": content},
        upsert=True
    )

    return {"message": "Site content updated successfully"}


@router.get("/site-content")
async def get_public_site_content():
    content = await db.site_content.find_one({"id": "site_content"}, {"_id": 0})
    if not content:
        return None
    return content


# File upload

@router.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    allowed_extensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
        '.mp4', '.webm', '.mov', '.m4v', '.mp3', '.ogg'
    ]
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Use: {', '.join(allowed_extensions)}")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name
    max_size = 10 * 1024 * 1024

    chunks = []
    written = 0
    try:
        while chunk := file.file.read(1024 * 1024):
            written += len(chunk)
            if written > max_size:
                raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
            chunks.append(chunk)
    except HTTPException:
        raise
    finally:
        await file.close()

    file_bytes = b"".join(chunks)

    try:
        with open(file_path, "wb") as buf:
            buf.write(file_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")

    try:
        await db.uploads.update_one(
            {"filename": unique_name},
            {"$set": {
                "filename": unique_name,
                "data": file_bytes,
                "content_type": file.content_type or "application/octet-stream",
                "original_name": file.filename,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    except Exception as exc:
        logger.warning(f"Could not persist upload to MongoDB (file still served from disk): {exc}")

    file_url = f"/api/uploads/{unique_name}"
    return {"url": file_url, "filename": unique_name}


# Admin CRUD for operations, announcements, discussions, gallery, training

@router.delete("/admin/operations/{operation_id}")
async def delete_operation(operation_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.operations.delete_one({"id": operation_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Operation not found")
    await remove_map_event("operation", operation_id)
    await log_audit(
        user_id=current_user["id"], action_type="delete_operation",
        resource_type="operation", resource_id=operation_id,
    )
    return {"message": "Operation deleted successfully"}


@router.put("/admin/operations/{operation_id}")
async def update_operation(operation_id: str, operation_data: OperationCreate, current_user: dict = Depends(get_current_admin)):
    result = await db.operations.update_one(
        {"id": operation_id},
        {"$set": operation_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Operation not found")
    updated_op = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if updated_op:
        await upsert_map_event("operation", updated_op, operation_id)
    return {"message": "Operation updated successfully"}


@router.put("/admin/operations/{operation_id}/rsvp/{user_id}/promote")
async def promote_from_waitlist(operation_id: str, user_id: str, current_user: dict = Depends(get_current_admin)):
    operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not operation:
        raise HTTPException(status_code=404, detail="Operation not found")
    rsvps = operation.get("rsvps", [])
    found = False
    for r in rsvps:
        if r["user_id"] == user_id and r["status"] == "waitlisted":
            r["status"] = "attending"
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Waitlisted user not found")
    await db.operations.update_one({"id": operation_id}, {"$set": {"rsvps": rsvps}})
    return {"message": "User promoted to attending", "rsvps": rsvps}


@router.delete("/admin/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.announcements.delete_one({"id": announcement_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await log_audit(
        user_id=current_user["id"], action_type="delete_announcement",
        resource_type="announcement", resource_id=announcement_id,
    )
    return {"message": "Announcement deleted successfully"}


@router.put("/admin/announcements/{announcement_id}")
async def update_announcement(announcement_id: str, announcement_data: AnnouncementCreate, current_user: dict = Depends(get_current_admin)):
    update_data = announcement_data.model_dump()
    update_data["author_id"] = current_user["id"]
    update_data["author_name"] = current_user["username"]

    result = await db.announcements.update_one(
        {"id": announcement_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"message": "Announcement updated successfully"}


@router.delete("/admin/discussions/{discussion_id}")
async def delete_discussion(discussion_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.discussions.delete_one({"id": discussion_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Discussion not found")
    return {"message": "Discussion deleted successfully"}


@router.put("/admin/discussions/{discussion_id}/pin")
async def toggle_pin_discussion(discussion_id: str, current_user: dict = Depends(get_current_admin)):
    disc = await db.discussions.find_one({"id": discussion_id}, {"_id": 0})
    if not disc:
        raise HTTPException(status_code=404, detail="Discussion not found")
    new_pinned = not disc.get("pinned", False)
    await db.discussions.update_one({"id": discussion_id}, {"$set": {"pinned": new_pinned}})
    return {"message": f"Discussion {'pinned' if new_pinned else 'unpinned'}", "pinned": new_pinned}


@router.delete("/admin/gallery/{image_id}")
async def delete_gallery_image(image_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.gallery.delete_one({"id": image_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"message": "Image deleted successfully"}


@router.put("/admin/gallery/{image_id}")
async def update_gallery_image(image_id: str, image_data: GalleryImageCreate, current_user: dict = Depends(get_current_admin)):
    result = await db.gallery.update_one(
        {"id": image_id},
        {"$set": image_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Image not found")
    return {"message": "Image updated successfully"}


@router.delete("/admin/discussions/{discussion_id}/reply/{reply_id}")
async def delete_reply(discussion_id: str, reply_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.discussions.update_one(
        {"id": discussion_id},
        {"$pull": {"replies": {"id": reply_id}}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Reply not found")
    return {"message": "Reply deleted successfully"}


@router.delete("/admin/training/{training_id}")
async def delete_training(training_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.training.delete_one({"id": training_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Training not found")
    return {"message": "Training deleted successfully"}


@router.put("/admin/training/{training_id}")
async def update_training(training_id: str, training_data: TrainingCreate, current_user: dict = Depends(get_current_admin)):
    result = await db.training.update_one(
        {"id": training_id},
        {"$set": training_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Training not found")
    return {"message": "Training updated successfully"}


# Admin profile & history management

@router.put("/admin/users/{user_id}/profile")
async def admin_update_profile(user_id: str, profile_data: AdminProfileUpdate, current_user: dict = Depends(get_current_admin)):
    update_dict = {k: v for k, v in profile_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.users.update_one({"id": user_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Profile updated successfully"}


@router.post("/admin/import-users", response_model=UserImportResponse)
async def import_users_from_google_sheet(payload: UserImportRequest, current_user: dict = Depends(get_current_admin)):
    spreadsheet_id = parse_spreadsheet_id(payload.spreadsheetId, payload.spreadsheetUrl)
    if not spreadsheet_id:
        raise HTTPException(status_code=400, detail="Provide a valid spreadsheetId or spreadsheetUrl")

    try:
        resolved_sheet_name, values = await fetch_sheet_rows(spreadsheet_id, payload.sheetName)
    except GoogleSheetsImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    headers = values[0]
    field_mapping = build_field_mapping(headers, payload.fieldMapping)

    if "email" not in field_mapping and "discord_id" not in field_mapping:
        raise HTTPException(
            status_code=400,
            detail="Unable to map required identifiers. Include an email or discord_id column (or provide fieldMapping).",
        )

    report = UserImportResponse(
        sheet_name=resolved_sheet_name,
        field_mapping={field: headers[idx] for field, idx in field_mapping.items()},
    )

    for row_index, row in enumerate(values[1:], start=2):
        mapped = row_to_mapped_fields(row, field_mapping)
        identifier = mapped.get("email") or mapped.get("discord_id") or mapped.get("username")

        if not mapped.get("email") and not mapped.get("discord_id"):
            report.skipped += 1
            report.results.append(
                UserImportRowResult(
                    row_number=row_index,
                    action="skipped",
                    message="Missing required identifier (email or discord_id)",
                    identifier=identifier,
                )
            )
            continue

        try:
            action, resolved_identifier = await upsert_user_from_import(mapped)
            if action == "created":
                report.imported += 1
            else:
                report.updated += 1
            report.results.append(
                UserImportRowResult(
                    row_number=row_index,
                    action=action,
                    message=f"User {action} successfully",
                    identifier=resolved_identifier,
                )
            )
        except Exception as exc:
            report.errors += 1
            report.results.append(
                UserImportRowResult(
                    row_number=row_index,
                    action="error",
                    message=str(exc),
                    identifier=identifier,
                )
            )

    await log_audit(
        user_id=current_user["id"], action_type="import_users",
        resource_type="user", metadata={
            "sheet": resolved_sheet_name,
            "imported": report.imported,
            "updated": report.updated,
            "skipped": report.skipped,
            "errors": report.errors,
        },
    )

    return report


@router.post("/admin/users/{user_id}/mission-history")
async def add_mission_history(user_id: str, entry: MissionHistoryEntry, current_user: dict = Depends(get_current_admin)):
    entry_dict = entry.model_dump()
    entry_dict["id"] = str(uuid.uuid4())
    result = await db.users.update_one({"id": user_id}, {"$push": {"mission_history": entry_dict}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Mission history added", "entry": entry_dict}


@router.delete("/admin/users/{user_id}/mission-history/{entry_id}")
async def delete_mission_history(user_id: str, entry_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.users.update_one({"id": user_id}, {"$pull": {"mission_history": {"id": entry_id}}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Mission history entry removed"}


@router.post("/admin/users/{user_id}/training-history")
async def add_training_history(user_id: str, entry: TrainingHistoryEntry, current_user: dict = Depends(get_current_admin)):
    entry_dict = entry.model_dump()
    entry_dict["id"] = str(uuid.uuid4())
    result = await db.users.update_one({"id": user_id}, {"$push": {"training_history": entry_dict}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Training history added", "entry": entry_dict}


@router.delete("/admin/users/{user_id}/training-history/{entry_id}")
async def delete_training_history(user_id: str, entry_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.users.update_one({"id": user_id}, {"$pull": {"training_history": {"id": entry_id}}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Training history entry removed"}


@router.post("/admin/users/{user_id}/awards")
async def add_award(user_id: str, entry: AwardEntry, current_user: dict = Depends(get_current_admin)):
    entry_dict = entry.model_dump()
    entry_dict["id"] = str(uuid.uuid4())
    result = await db.users.update_one({"id": user_id}, {"$push": {"awards": entry_dict}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Award added", "entry": entry_dict}


@router.delete("/admin/users/{user_id}/awards/{entry_id}")
async def delete_award(user_id: str, entry_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.users.update_one({"id": user_id}, {"$pull": {"awards": {"id": entry_id}}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Award removed"}


# User management

@router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [user_to_response(u) for u in users]


@router.put("/admin/users/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, current_user: dict = Depends(get_current_admin)):
    update_dict = {k: v for k, v in user_data.model_dump().items() if v is not None}

    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")

    before = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})

    result = await db.users.update_one(
        {"id": user_id},
        {"$set": update_dict}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    await log_audit(
        user_id=current_user["id"], action_type="update_user",
        resource_type="user", resource_id=user_id,
        before=before, after=update_dict,
    )

    return {"message": "User updated successfully"}


@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_admin)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    before = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    await log_audit(
        user_id=current_user["id"], action_type="delete_user",
        resource_type="user", resource_id=user_id,
        before=before,
    )

    return {"message": "User deleted successfully"}


# Member of the week

@router.get("/member-of-the-week")
async def get_member_of_the_week():
    doc = await db.member_of_the_week.find_one({"id": "current"}, {"_id": 0})
    if not doc:
        return None
    return doc


@router.put("/admin/member-of-the-week")
async def set_member_of_the_week(data: dict, current_user: dict = Depends(get_current_admin)):
    user_id = data.get("user_id")
    reason = data.get("reason", "")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    member = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    motw = {
        "id": "current",
        "user_id": user_id,
        "username": member.get("username", "Unknown"),
        "reason": reason,
        "avatar_url": member.get("avatar_url", ""),
        "rank": member.get("rank", ""),
        "set_at": datetime.now(timezone.utc).isoformat()
    }
    await db.member_of_the_week.replace_one({"id": "current"}, motw, upsert=True)
    return motw


@router.delete("/admin/member-of-the-week")
async def clear_member_of_the_week(current_user: dict = Depends(get_current_admin)):
    await db.member_of_the_week.delete_one({"id": "current"})
    return {"message": "Member of the Week cleared"}


# Unit history

@router.get("/unit-history")
async def get_unit_history():
    entries = await db.unit_history.find({}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return entries


@router.post("/admin/unit-history")
async def create_history_entry(entry_data: HistoryEntryCreate, current_user: dict = Depends(get_current_admin)):
    entry = HistoryEntry(**entry_data.model_dump())
    await db.unit_history.insert_one(entry.model_dump())
    result = entry.model_dump()
    result.pop("_id", None)
    return result


@router.put("/admin/unit-history/{entry_id}")
async def update_history_entry(entry_id: str, entry_data: HistoryEntryCreate, current_user: dict = Depends(get_current_admin)):
    update_dict = entry_data.model_dump()
    result = await db.unit_history.update_one(
        {"id": entry_id},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"message": "History entry updated successfully"}


@router.delete("/admin/unit-history/{entry_id}")
async def delete_history_entry(entry_id: str, current_user: dict = Depends(get_current_admin)):
    result = await db.unit_history.delete_one({"id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"message": "History entry deleted successfully"}


# Unit tags

@router.get("/unit-tags")
async def get_unit_tags(current_user: dict = Depends(get_current_user)):
    tags_doc = await db.unit_tags.find_one({"id": "unit_tags"}, {"_id": 0})

    defaults = {
        "ranks": ["Private", "Private First Class", "Specialist", "Corporal", "Sergeant", "Staff Sergeant", "Sergeant First Class", "Master Sergeant", "First Sergeant", "Sergeant Major", "Second Lieutenant", "First Lieutenant", "Captain", "Major", "Lieutenant Colonel", "Colonel"],
        "companies": ["HQ", "Alpha", "Bravo", "Charlie", "Delta"],
        "platoons": ["1st Platoon", "2nd Platoon", "3rd Platoon", "Weapons Platoon", "HQ Platoon"],
        "squads": ["1st Squad", "2nd Squad", "3rd Squad", "Weapons Squad"],
        "billets": ["Commanding Officer", "Executive Officer", "First Sergeant", "Platoon Leader", "Platoon Sergeant", "Squad Leader", "Team Leader", "Rifleman", "Automatic Rifleman", "Grenadier", "Designated Marksman", "Combat Medic", "RTO", "Forward Observer"],
        "specializations": ["Infantry", "Reconnaissance", "Armor", "Artillery", "Engineering", "Medical", "Communications", "Logistics", "Aviation"],
        "statuses": ["recruit", "active", "reserve", "staff", "command", "inactive"]
    }

    if tags_doc:
        for key in defaults:
            if key in tags_doc:
                combined = defaults[key] + [t for t in tags_doc[key] if t not in defaults[key]]
                defaults[key] = combined

    return defaults


@router.put("/admin/unit-tags")
async def update_unit_tags(tags: dict, current_user: dict = Depends(get_current_admin)):
    tags["id"] = "unit_tags"
    await db.unit_tags.update_one(
        {"id": "unit_tags"},
        {"$set": tags},
        upsert=True
    )
    return {"message": "Unit tags updated successfully"}


# ============================================================================
# AUDIT LOGS
# ============================================================================

@router.get("/admin/audit-logs")
async def get_audit_logs(
    current_user: dict = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action_type: Optional[str] = None,
    resource_type: Optional[str] = None,
    user_id: Optional[str] = None,
):
    """Retrieve paginated audit logs with optional filters."""
    query = {}
    if action_type:
        query["action_type"] = action_type
    if resource_type:
        query["resource_type"] = resource_type
    if user_id:
        query["user_id"] = user_id

    skip = (page - 1) * limit
    total = await db.audit_logs.count_documents(query)
    logs = await db.audit_logs.find(query, {"_id": 0}).sort(
        "timestamp", -1
    ).skip(skip).limit(limit).to_list(limit)

    # Enrich logs with username for display
    user_ids = list({log.get("user_id") for log in logs if log.get("user_id")})
    users_map = {}
    if user_ids:
        users = await db.users.find(
            {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "username": 1}
        ).to_list(len(user_ids))
        users_map = {u["id"]: u.get("username", "Unknown") for u in users}

    for log in logs:
        log["username"] = users_map.get(log.get("user_id"), "System")

    return {
        "logs": logs,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if limit else 1,
    }


@router.get("/admin/audit-logs/stats")
async def get_audit_stats(current_user: dict = Depends(get_current_admin)):
    """Get summary statistics for audit logs."""
    total = await db.audit_logs.count_documents({})

    # Get action type breakdown
    pipeline = [
        {"$group": {"_id": "$action_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    action_counts = await db.audit_logs.aggregate(pipeline).to_list(20)

    # Get resource type breakdown
    pipeline2 = [
        {"$group": {"_id": "$resource_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    resource_counts = await db.audit_logs.aggregate(pipeline2).to_list(20)

    # Get recent activity (last 24h)
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent_count = await db.audit_logs.count_documents({"timestamp": {"$gte": cutoff}})

    return {
        "total": total,
        "recent_24h": recent_count,
        "by_action": {item["_id"]: item["count"] for item in action_counts if item["_id"]},
        "by_resource": {item["_id"]: item["count"] for item in resource_counts if item["_id"]},
    }


class AdminPreCreateMember(BaseModel):
    username: str
    email: EmailStr
    rank: Optional[str] = None
    specialization: Optional[str] = None
    status: str = "member"
    role: str = "member"
    company: Optional[str] = None
    platoon: Optional[str] = None
    squad: Optional[str] = None
    billet: Optional[str] = None
    discord_id: Optional[str] = None
    discord_username: Optional[str] = None


@router.post("/admin/users/precreate")
async def admin_precreate_member(data: AdminPreCreateMember, current_user: dict = Depends(get_current_admin)):
    """Pre-create a member account for an existing unit member who hasn't registered yet."""
    normalized_email = normalize_email(data.email)

    # Check for existing user by email
    existing = await db.users.find_one({"email": normalized_email})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    # Check for existing user by discord_id if provided
    if data.discord_id:
        existing_discord = await db.users.find_one({"discord_id": data.discord_id})
        if existing_discord:
            raise HTTPException(status_code=400, detail="A user with this Discord ID already exists")

    new_user = User(
        email=normalized_email,
        username=data.username,
        # Random placeholder password; cannot be used to log in until the member claims the account
        password_hash=pwd_context.hash(secrets.token_urlsafe(32)),
        role=data.role,
        rank=data.rank,
        specialization=data.specialization,
        status=data.status,
        company=data.company,
        platoon=data.platoon,
        squad=data.squad,
        billet=data.billet,
        discord_id=data.discord_id,
        discord_username=data.discord_username,
        discord_linked=bool(data.discord_id),
        pre_registered=True,
        is_active=True,
        email_verified=True,
        email_verified_at=datetime.now(timezone.utc).isoformat(),
    )

    doc = new_user.model_dump()
    doc["join_date"] = doc["join_date"].isoformat()
    await db.users.insert_one(doc)

    await log_audit(
        user_id=current_user["id"],
        action_type="precreate_member",
        resource_type="user",
        resource_id=new_user.id,
        after={"username": data.username, "email": normalized_email, "status": data.status},
    )

    return {
        "message": f"Member '{data.username}' pre-created successfully",
        "id": new_user.id,
        "claim_method": "The member can claim this account by logging in with this email via 'Claim Account' on the login page, or by logging in with Discord if their Discord ID was provided.",
    }
