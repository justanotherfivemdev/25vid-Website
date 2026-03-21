import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.content import (
    Announcement, AnnouncementCreate,
    Discussion, DiscussionCreate, ReplyCreate,
    GalleryImage, GalleryImageCreate,
    Training, TrainingCreate,
)
from middleware.auth import get_current_user, get_current_admin
from middleware.rbac import require_permission, Permission

router = APIRouter()


# Announcements

@router.get("/announcements", response_model=List[Announcement])
async def get_announcements():
    announcements = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for ann in announcements:
        if isinstance(ann['created_at'], str):
            ann['created_at'] = datetime.fromisoformat(ann['created_at'])
    return announcements


@router.post("/announcements", response_model=Announcement)
async def create_announcement(announcement_data: AnnouncementCreate, current_user: dict = Depends(require_permission(Permission.MANAGE_ANNOUNCEMENTS))):
    ann_dict = announcement_data.model_dump()
    ann_dict["author_id"] = current_user["id"]
    ann_dict["author_name"] = current_user["username"]
    announcement_obj = Announcement(**ann_dict)

    doc = announcement_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.announcements.insert_one(doc)

    return announcement_obj


# Discussions

@router.get("/discussions", response_model=List[Discussion])
async def get_discussions(category: Optional[str] = None):
    query = {"category": category} if category else {}
    discussions = await db.discussions.find(query, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(100)
    for disc in discussions:
        if isinstance(disc['created_at'], str):
            disc['created_at'] = datetime.fromisoformat(disc['created_at'])
    return discussions


@router.get("/discussions/{discussion_id}", response_model=Discussion)
async def get_discussion(discussion_id: str):
    discussion = await db.discussions.find_one({"id": discussion_id}, {"_id": 0})
    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")
    if isinstance(discussion['created_at'], str):
        discussion['created_at'] = datetime.fromisoformat(discussion['created_at'])
    return discussion


@router.post("/discussions", response_model=Discussion)
async def create_discussion(discussion_data: DiscussionCreate, current_user: dict = Depends(get_current_user)):
    disc_dict = discussion_data.model_dump()
    disc_dict["author_id"] = current_user["id"]
    disc_dict["author_name"] = current_user["username"]
    discussion_obj = Discussion(**disc_dict)

    doc = discussion_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.discussions.insert_one(doc)

    return discussion_obj


@router.post("/discussions/{discussion_id}/reply")
async def add_reply(discussion_id: str, reply_data: ReplyCreate, current_user: dict = Depends(get_current_user)):
    discussion = await db.discussions.find_one({"id": discussion_id})
    if not discussion:
        raise HTTPException(status_code=404, detail="Discussion not found")

    reply = {
        "id": str(uuid.uuid4()),
        "content": reply_data.content,
        "author_id": current_user["id"],
        "author_name": current_user["username"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.discussions.update_one(
        {"id": discussion_id},
        {"$push": {"replies": reply}}
    )

    return {"message": "Reply added", "reply": reply}


# Gallery

@router.get("/gallery", response_model=List[GalleryImage])
async def get_gallery(category: Optional[str] = None):
    query = {"category": category} if category else {}
    images = await db.gallery.find(query, {"_id": 0}).sort("uploaded_at", -1).to_list(100)
    for img in images:
        if isinstance(img['uploaded_at'], str):
            img['uploaded_at'] = datetime.fromisoformat(img['uploaded_at'])
    return images


@router.post("/gallery", response_model=GalleryImage)
async def upload_image(image_data: GalleryImageCreate, current_user: dict = Depends(require_permission(Permission.MANAGE_GALLERY))):
    img_dict = image_data.model_dump()
    img_dict["uploaded_by"] = current_user["username"]
    image_obj = GalleryImage(**img_dict)

    doc = image_obj.model_dump()
    doc['uploaded_at'] = doc['uploaded_at'].isoformat()
    await db.gallery.insert_one(doc)

    return image_obj


# Training

@router.get("/training", response_model=List[Training])
async def get_training():
    training = await db.training.find({}, {"_id": 0}).to_list(100)
    for t in training:
        if isinstance(t['created_at'], str):
            t['created_at'] = datetime.fromisoformat(t['created_at'])
    return training


@router.post("/training", response_model=Training)
async def create_training(training_data: TrainingCreate, current_user: dict = Depends(require_permission(Permission.MANAGE_TRAINING))):
    training_obj = Training(**training_data.model_dump())

    doc = training_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.training.insert_one(doc)

    return training_obj
