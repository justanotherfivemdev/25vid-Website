from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request

from config import JWT_SECRET, JWT_ALGORITHM, COOKIE_NAME
from database import db
from models.shared import SharedPost, SharedPostCreate, LiaisonContact, LiaisonContactCreate
from middleware.auth import get_current_admin
from services.audit_service import log_audit

router = APIRouter()


# ── Shared auth helper ───────────────────────────────────────────────────────

async def get_shared_user(request: Request):
    """Authenticate either member or partner user for shared area access."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("account_type") == "partner":
            partner = await db.partner_users.find_one(
                {"id": payload["sub"]}, {"_id": 0, "password_hash": 0}
            )
            if not partner:
                raise HTTPException(status_code=401, detail="Partner user not found")
            unit = await db.partner_units.find_one(
                {"id": partner.get("partner_unit_id")}, {"_id": 0}
            )
            return {
                "auth_type": "partner",
                "id": partner["id"],
                "username": partner.get("username", ""),
                "unit_name": unit.get("name", "") if unit else "",
                "role": partner.get("role", "member"),
            }
        else:
            user = await db.users.find_one(
                {"id": payload["sub"]}, {"_id": 0, "password_hash": 0}
            )
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            return {
                "auth_type": "member",
                "id": user["id"],
                "username": user.get("username", ""),
                "unit_name": "25th Infantry Division",
                "role": user.get("role", "member"),
            }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.exceptions.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


async def get_shared_admin(request: Request):
    """Require admin or partner_admin role via shared auth."""
    user = await get_shared_user(request)
    if user["auth_type"] == "member" and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if user["auth_type"] == "partner" and user["role"] != "partner_admin":
        raise HTTPException(status_code=403, detail="Partner admin access required")
    return user


# ── Shared posts ─────────────────────────────────────────────────────────────

@router.get("/shared/posts")
async def get_shared_posts(
    post_type: str = None,
    shared_user: dict = Depends(get_shared_user),
):
    query: dict = {}
    if post_type:
        query["post_type"] = post_type

    # Filter visibility based on auth type
    if shared_user["auth_type"] == "member":
        query["visibility"] = {"$in": ["all", "25th_only"]}
    else:
        query["visibility"] = {"$in": ["all", "partners_only"]}

    posts = await db.shared_posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return posts


@router.post("/shared/posts")
async def create_shared_post(
    data: SharedPostCreate,
    shared_user: dict = Depends(get_shared_admin),
):
    post = SharedPost(
        title=data.title,
        content=data.content,
        post_type=data.post_type,
        author_id=shared_user["id"],
        author_name=shared_user["username"],
        author_unit=shared_user.get("unit_name"),
        visibility=data.visibility,
        is_pinned=data.is_pinned,
    )
    await db.shared_posts.insert_one(post.model_dump())
    await log_audit(
        user_id=shared_user["id"],
        action_type="shared_post_create",
        resource_type="shared_post",
        resource_id=post.id,
    )
    return {"message": "Post created", "id": post.id}


@router.put("/shared/posts/{post_id}")
async def update_shared_post(
    post_id: str,
    data: SharedPostCreate,
    current_user: dict = Depends(get_current_admin),
):
    post = await db.shared_posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.shared_posts.update_one({"id": post_id}, {"$set": update})
    await log_audit(
        user_id=current_user["id"],
        action_type="shared_post_update",
        resource_type="shared_post",
        resource_id=post_id,
    )
    return {"message": "Post updated", "id": post_id}


@router.delete("/shared/posts/{post_id}")
async def delete_shared_post(
    post_id: str,
    current_user: dict = Depends(get_current_admin),
):
    result = await db.shared_posts.delete_one({"id": post_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    await log_audit(
        user_id=current_user["id"],
        action_type="shared_post_delete",
        resource_type="shared_post",
        resource_id=post_id,
    )
    return {"message": "Post deleted"}


# ── Liaison contacts ─────────────────────────────────────────────────────────

@router.get("/shared/contacts")
async def get_liaison_contacts(shared_user: dict = Depends(get_shared_user)):
    contacts = await db.liaison_contacts.find(
        {"is_active": True}, {"_id": 0}
    ).sort("name", 1).to_list(200)
    return contacts


@router.post("/admin/shared/contacts")
async def create_liaison_contact(
    data: LiaisonContactCreate,
    current_user: dict = Depends(get_current_admin),
):
    contact = LiaisonContact(**data.model_dump())
    await db.liaison_contacts.insert_one(contact.model_dump())
    await log_audit(
        user_id=current_user["id"],
        action_type="liaison_contact_create",
        resource_type="liaison_contact",
        resource_id=contact.id,
    )
    return {"message": "Contact created", "id": contact.id}


@router.put("/admin/shared/contacts/{contact_id}")
async def update_liaison_contact(
    contact_id: str,
    data: LiaisonContactCreate,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.liaison_contacts.find_one({"id": contact_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")

    await db.liaison_contacts.update_one({"id": contact_id}, {"$set": data.model_dump()})
    await log_audit(
        user_id=current_user["id"],
        action_type="liaison_contact_update",
        resource_type="liaison_contact",
        resource_id=contact_id,
    )
    return {"message": "Contact updated", "id": contact_id}


@router.delete("/admin/shared/contacts/{contact_id}")
async def delete_liaison_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_admin),
):
    result = await db.liaison_contacts.delete_one({"id": contact_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    await log_audit(
        user_id=current_user["id"],
        action_type="liaison_contact_delete",
        resource_type="liaison_contact",
        resource_id=contact_id,
    )
    return {"message": "Contact deleted"}


# ── Joint operations & stats ─────────────────────────────────────────────────

@router.get("/shared/joint-operations")
async def get_joint_operations(shared_user: dict = Depends(get_shared_user)):
    query = {"post_type": "joint_operation"}
    if shared_user["auth_type"] == "member":
        query["visibility"] = {"$in": ["all", "25th_only"]}
    else:
        query["visibility"] = {"$in": ["all", "partners_only"]}

    posts = await db.shared_posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return posts


@router.get("/shared/stats")
async def get_shared_stats(shared_user: dict = Depends(get_shared_user)):
    pipeline = [
        {"$group": {"_id": "$post_type", "count": {"$sum": 1}}}
    ]
    results = await db.shared_posts.aggregate(pipeline).to_list(20)
    stats = {r["_id"]: r["count"] for r in results}
    return stats
