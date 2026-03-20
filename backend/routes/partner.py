import logging
import uuid
import secrets
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, HTTPException, Depends, Response, Request

from config import JWT_SECRET, JWT_ALGORITHM, COOKIE_NAME, pwd_context
from database import db
from models.partner import (
    PartnerUnit, PartnerUnitCreate, PartnerUser, PartnerUserRegister,
    PartnerUserLogin, PartnerTokenResponse,
    PartnerUnitStatusUpdate, PartnerMemberUpdate,
    PartnerInvite, PartnerApplication, PartnerApplicationSubmit,
)
from models.operations import RSVPSubmit
from models.deployment import (
    Deployment, DeploymentCreate, DeploymentUpdate, DEPLOYMENT_STATUSES,
    HOME_STATION,
)
from middleware.auth import get_current_admin_or_liaison, get_current_partner_user, get_current_partner_admin
from services.auth_service import (
    hash_password, verify_password, normalize_email,
    create_access_token, set_auth_cookie, clear_auth_cookie,
    partner_user_to_response,
)

router = APIRouter()


# Partner unit management (25th admin)

@router.get("/partner-units")
async def list_partner_units(current_user: dict = Depends(get_current_admin_or_liaison)):
    units = await db.partner_units.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    for u in units:
        u["member_count"] = await db.partner_users.count_documents({"partner_unit_id": u["id"]})
    return units


@router.post("/partner-units")
async def create_partner_unit(data: PartnerUnitCreate, current_user: dict = Depends(get_current_admin_or_liaison)):
    unit = PartnerUnit(**data.model_dump(), created_by=current_user["id"])
    doc = unit.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.partner_units.insert_one(doc)
    await db.partner_audit_log.insert_one({
        "action": "create_partner_unit", "unit_id": unit.id,
        "performed_by": current_user["id"], "performed_by_type": "admin",
        "details": {"name": unit.name}, "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Partner unit created", "unit": doc}


@router.put("/partner-units/{unit_id}")
async def update_partner_unit(unit_id: str, data: PartnerUnitCreate, current_user: dict = Depends(get_current_admin_or_liaison)):
    existing = await db.partner_units.find_one({"id": unit_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Partner unit not found")
    update_data = data.model_dump()
    await db.partner_units.update_one({"id": unit_id}, {"$set": update_data})
    await db.partner_audit_log.insert_one({
        "action": "update_partner_unit", "unit_id": unit_id,
        "performed_by": current_user["id"], "performed_by_type": "admin",
        "details": update_data, "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Partner unit updated"}


@router.put("/partner-units/{unit_id}/status")
async def set_partner_unit_status(unit_id: str, data: PartnerUnitStatusUpdate, current_user: dict = Depends(get_current_admin_or_liaison)):
    result = await db.partner_units.update_one({"id": unit_id}, {"$set": {"status": data.status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Partner unit not found")
    await db.partner_audit_log.insert_one({
        "action": "set_partner_unit_status", "unit_id": unit_id,
        "performed_by": current_user["id"], "performed_by_type": "admin",
        "details": {"status": data.status}, "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": f"Partner unit status set to {data.status}"}


@router.get("/partner-units/{unit_id}")
async def get_partner_unit(unit_id: str, current_user: dict = Depends(get_current_admin_or_liaison)):
    unit = await db.partner_units.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Partner unit not found")
    unit["member_count"] = await db.partner_users.count_documents({"partner_unit_id": unit_id})
    unit["members"] = await db.partner_users.find(
        {"partner_unit_id": unit_id}, {"_id": 0, "password_hash": 0}
    ).sort("username", 1).to_list(200)
    return unit


@router.delete("/partner-units/{unit_id}")
async def delete_partner_unit(unit_id: str, current_user: dict = Depends(get_current_admin_or_liaison)):
    result = await db.partner_units.delete_one({"id": unit_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Partner unit not found")
    await db.partner_users.delete_many({"partner_unit_id": unit_id})
    await db.partner_invites.delete_many({"partner_unit_id": unit_id})
    await db.partner_audit_log.insert_one({
        "action": "delete_partner_unit", "unit_id": unit_id,
        "performed_by": current_user["id"], "performed_by_type": "admin",
        "details": {}, "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Partner unit deleted"}


# Partner invites

@router.post("/partner-units/{unit_id}/invites")
async def create_partner_invite(unit_id: str, current_user: dict = Depends(get_current_admin_or_liaison)):
    unit = await db.partner_units.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Partner unit not found")
    invite = PartnerInvite(partner_unit_id=unit_id, created_by=current_user["id"])
    doc = invite.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.partner_invites.insert_one(doc)
    await db.partner_audit_log.insert_one({
        "action": "create_partner_invite", "unit_id": unit_id,
        "performed_by": current_user["id"], "performed_by_type": "admin",
        "details": {"invite_code": invite.code}, "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"code": invite.code, "id": invite.id}


@router.get("/partner-units/{unit_id}/invites")
async def list_partner_invites(unit_id: str, current_user: dict = Depends(get_current_admin_or_liaison)):
    invites = await db.partner_invites.find({"partner_unit_id": unit_id}, {"_id": 0}).to_list(100)
    return invites


# Partner auth

@router.post("/auth/partner/register")
async def partner_register(data: PartnerUserRegister, response: Response):
    claim_result = await db.partner_invites.find_one_and_update(
        {"code": data.invite_code, "$expr": {"$lt": ["$use_count", "$max_uses"]}},
        {"$inc": {"use_count": 1}},
        return_document=False,
    )
    if not claim_result:
        invite = await db.partner_invites.find_one({"code": data.invite_code}, {"_id": 0})
        if not invite:
            raise HTTPException(status_code=400, detail="Invalid invite code")
        raise HTTPException(status_code=400, detail="Invite code has been used")

    invite = {k: v for k, v in claim_result.items() if k != "_id"}

    unit = await db.partner_units.find_one({"id": invite["partner_unit_id"]}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=400, detail="Partner unit not found")
    if unit.get("status") != "active":
        raise HTTPException(status_code=400, detail="Partner unit is not active")

    normalized_email = normalize_email(data.email)
    existing = await db.partner_users.find_one({"email": normalized_email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    existing_main = await db.users.find_one({"email": normalized_email})
    if existing_main:
        raise HTTPException(status_code=400, detail="Email already registered as a 25th ID member")

    current_count = await db.partner_users.count_documents({"partner_unit_id": unit["id"]})
    if current_count >= unit.get("max_members", 50):
        raise HTTPException(status_code=400, detail="Partner unit has reached maximum member count")

    partner_role = "partner_admin" if current_count == 0 else "partner_member"

    partner_user = PartnerUser(
        email=normalized_email,
        username=data.username,
        password_hash=hash_password(data.password),
        partner_unit_id=unit["id"],
        partner_role=partner_role,
        rank=data.rank,
        status="active",
    )
    doc = partner_user.model_dump()
    doc["join_date"] = doc["join_date"].isoformat()
    await db.partner_users.insert_one(doc)

    await db.partner_invites.update_one(
        {"code": data.invite_code},
        {"$set": {"last_used_by": partner_user.id}}
    )

    await db.partner_audit_log.insert_one({
        "action": "partner_user_register", "unit_id": unit["id"],
        "performed_by": partner_user.id, "performed_by_type": "partner",
        "details": {"username": data.username, "role": partner_role},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    clear_auth_cookie(response)
    return {"message": "Registration successful. You can now log in.", "partner_role": partner_role}


@router.post("/auth/partner/login", response_model=PartnerTokenResponse)
async def partner_login(credentials: PartnerUserLogin, response: Response):
    normalized_email = normalize_email(credentials.email)
    user = await db.partner_users.find_one({"email": normalized_email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account is inactive")
    if user.get("status") == "pending":
        raise HTTPException(status_code=403, detail="Account pending approval by 25th ID admin")

    unit = await db.partner_units.find_one({"id": user["partner_unit_id"]}, {"_id": 0})
    if not unit or unit.get("status") != "active":
        raise HTTPException(status_code=403, detail="Partner unit is not currently active")

    access_token = create_access_token({
        "sub": user["id"],
        "email": user["email"],
        "account_type": "partner",
        "partner_unit_id": user["partner_unit_id"]
    })
    set_auth_cookie(response, access_token)

    user_response = partner_user_to_response(user, unit.get("name", ""))
    return PartnerTokenResponse(access_token=access_token, token_type="bearer", user=user_response)


@router.get("/auth/partner/me")
async def partner_get_me(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id or payload.get("account_type") != "partner":
            raise HTTPException(status_code=401, detail="Not a partner account")
        user = await db.partner_users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Partner user not found")
        unit = await db.partner_units.find_one({"id": user["partner_unit_id"]}, {"_id": 0})
        return partner_user_to_response(user, unit.get("name", "") if unit else "")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


# Partner hub endpoints

@router.get("/partner/discussions")
async def partner_get_discussions(partner_user: dict = Depends(get_current_partner_user)):
    discussions = await db.discussions.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return discussions


@router.get("/partner/operations")
async def partner_get_operations(partner_user: dict = Depends(get_current_partner_user)):
    operations = await db.operations.find({}, {"_id": 0}).sort("date", -1).to_list(100)
    return operations


@router.get("/partner/training")
async def partner_get_training(partner_user: dict = Depends(get_current_partner_user)):
    training = await db.training.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return training


@router.get("/partner/intel")
async def partner_get_intel(partner_user: dict = Depends(get_current_partner_user)):
    intel = await db.intel_briefings.find(
        {"visibility_scope": {"$ne": "admin_only"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return intel


@router.get("/partner/campaigns")
async def partner_get_campaigns(partner_user: dict = Depends(get_current_partner_user)):
    campaigns = await db.campaigns.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return campaigns


@router.post("/partner/operations/{operation_id}/rsvp")
async def partner_rsvp_operation(operation_id: str, rsvp_data: RSVPSubmit, partner_user: dict = Depends(get_current_partner_user)):
    op = await db.operations.find_one({"id": operation_id}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=404, detail="Operation not found")

    unit = partner_user.get("_partner_unit", {})
    rsvp_entry = {
        "user_id": partner_user["id"],
        "username": partner_user["username"],
        "status": rsvp_data.status,
        "role_notes": rsvp_data.role_notes or "",
        "rsvp_time": datetime.now(timezone.utc).isoformat(),
        "origin_type": "partner_unit",
        "origin_unit_id": partner_user["partner_unit_id"],
        "origin_unit_name": unit.get("name", "Partner Unit"),
    }

    await db.operations.update_one(
        {"id": operation_id},
        {"$pull": {"rsvps": {"user_id": partner_user["id"]}}}
    )
    await db.operations.update_one(
        {"id": operation_id},
        {"$push": {"rsvps": rsvp_entry}}
    )
    return {"message": "RSVP submitted", "rsvp": rsvp_entry}


@router.get("/partner/map/overlays")
async def partner_get_map_overlays(partner_user: dict = Depends(get_current_partner_user)):
    campaigns = await db.campaigns.find({}, {"_id": 0, "id": 1, "name": 1, "theater": 1, "status": 1, "objectives": 1}).to_list(200)
    operations = await db.operations.find({}, {"_id": 0}).to_list(2000)
    intel_briefings = await db.intel_briefings.find(
        {"visibility_scope": {"$ne": "admin_only"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    objective_markers = []
    for campaign in campaigns:
        for obj in campaign.get("objectives", []):
            lat, lng = obj.get("lat"), obj.get("lng")
            if lat is None or lng is None:
                continue
            marker = {
                "id": obj.get("id") or str(uuid.uuid4()),
                "source_kind": "objective",
                "campaign_id": campaign.get("id"),
                "campaign_name": campaign.get("name"),
                "name": obj.get("name"),
                "description": obj.get("description", ""),
                "severity": obj.get("severity", "medium"),
                "status": obj.get("status", "pending"),
                "lat": lat, "lng": lng,
                "origin_type": obj.get("origin_type", "25id"),
                "origin_unit_name": obj.get("origin_unit_name", "25th Infantry Division"),
            }
            objective_markers.append(marker)

    operation_markers = []
    for op in operations:
        lat, lng = op.get("lat"), op.get("lng")
        if lat is None or lng is None:
            continue
        operation_markers.append({
            "id": op.get("id"),
            "source_kind": "operation",
            "name": op.get("title"),
            "description": op.get("description", ""),
            "severity": op.get("severity", "medium"),
            "status": op.get("activity_state", "planned"),
            "date": op.get("date"),
            "lat": lat, "lng": lng,
            "origin_type": op.get("origin_type", "25id"),
            "origin_unit_name": op.get("origin_unit_name", "25th Infantry Division"),
        })

    intel_markers = []
    for intel in intel_briefings:
        lat, lng = intel.get("lat"), intel.get("lng")
        if lat is None or lng is None:
            continue
        intel_markers.append({
            "id": intel.get("id"),
            "source_kind": "intel",
            "name": intel.get("title"),
            "description": intel.get("content", "")[:320],
            "severity": intel.get("severity") or "medium",
            "lat": lat, "lng": lng,
            "origin_type": intel.get("origin_type", "25id"),
            "origin_unit_name": intel.get("origin_unit_name", "25th Infantry Division"),
        })

    return {"objectives": objective_markers, "operations": operation_markers, "intel": intel_markers, "events": []}


# Partner admin endpoints

@router.get("/partner/admin/unit")
async def partner_admin_get_unit(partner_user: dict = Depends(get_current_partner_admin)):
    unit = partner_user.get("_partner_unit", {})
    unit["members"] = await db.partner_users.find(
        {"partner_unit_id": partner_user["partner_unit_id"]},
        {"_id": 0, "password_hash": 0}
    ).sort("username", 1).to_list(200)
    return unit


@router.put("/partner/admin/members/{member_id}")
async def partner_admin_update_member(member_id: str, data: PartnerMemberUpdate, partner_user: dict = Depends(get_current_partner_admin)):
    member = await db.partner_users.find_one({"id": member_id, "partner_unit_id": partner_user["partner_unit_id"]}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in your unit")
    update = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    await db.partner_users.update_one({"id": member_id}, {"$set": update})
    await db.partner_audit_log.insert_one({
        "action": "partner_admin_update_member", "unit_id": partner_user["partner_unit_id"],
        "performed_by": partner_user["id"], "performed_by_type": "partner_admin",
        "details": {"member_id": member_id, "updates": update},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Member updated"}


@router.delete("/partner/admin/members/{member_id}")
async def partner_admin_remove_member(member_id: str, partner_user: dict = Depends(get_current_partner_admin)):
    if member_id == partner_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    result = await db.partner_users.delete_one({"id": member_id, "partner_unit_id": partner_user["partner_unit_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found in your unit")
    await db.partner_audit_log.insert_one({
        "action": "partner_admin_remove_member", "unit_id": partner_user["partner_unit_id"],
        "performed_by": partner_user["id"], "performed_by_type": "partner_admin",
        "details": {"member_id": member_id},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Member removed"}


@router.post("/partner/admin/invites")
async def partner_admin_create_invite(partner_user: dict = Depends(get_current_partner_admin)):
    invite = PartnerInvite(partner_unit_id=partner_user["partner_unit_id"], created_by=partner_user["id"])
    doc = invite.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.partner_invites.insert_one(doc)
    return {"code": invite.code, "id": invite.id}


@router.get("/partner/admin/invites")
async def partner_admin_list_invites(partner_user: dict = Depends(get_current_partner_admin)):
    invites = await db.partner_invites.find(
        {"partner_unit_id": partner_user["partner_unit_id"]}, {"_id": 0}
    ).to_list(100)
    return invites


@router.get("/partner/admin/audit-log")
async def partner_admin_audit_log(partner_user: dict = Depends(get_current_partner_admin)):
    logs = await db.partner_audit_log.find(
        {"unit_id": partner_user["partner_unit_id"]}, {"_id": 0}
    ).sort("timestamp", -1).to_list(200)
    return logs


# Partner admin operations CRUD

@router.get("/partner/admin/operations")
async def partner_admin_list_operations(partner_user: dict = Depends(get_current_partner_admin)):
    ops = await db.operations.find(
        {"origin_type": "partner_unit", "origin_unit_id": partner_user["partner_unit_id"]}, {"_id": 0}
    ).sort("date", -1).to_list(200)
    return ops


@router.post("/partner/admin/operations")
async def partner_admin_create_operation(data: dict, partner_user: dict = Depends(get_current_partner_admin)):
    unit = partner_user.get("_partner_unit", {})
    op_id = str(uuid.uuid4())
    op_doc = {
        "id": op_id,
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "operation_type": data.get("operation_type", "support"),
        "date": data.get("date", ""),
        "time": data.get("time", ""),
        "max_participants": data.get("max_participants"),
        "theater": data.get("theater", ""),
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "origin_type": "partner_unit",
        "origin_unit_id": partner_user["partner_unit_id"],
        "origin_unit_name": unit.get("name", "Partner Unit"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "rsvps": [],
    }
    await db.operations.insert_one(op_doc)
    await db.partner_audit_log.insert_one({
        "action": "partner_create_operation", "unit_id": partner_user["partner_unit_id"],
        "performed_by": partner_user["id"], "performed_by_type": "partner_admin",
        "details": {"operation_id": op_id, "title": op_doc["title"]},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Operation created", "operation": op_doc}


@router.put("/partner/admin/operations/{operation_id}")
async def partner_admin_update_operation(operation_id: str, data: dict, partner_user: dict = Depends(get_current_partner_admin)):
    op = await db.operations.find_one({
        "id": operation_id, "origin_type": "partner_unit",
        "origin_unit_id": partner_user["partner_unit_id"]
    })
    if not op:
        raise HTTPException(status_code=404, detail="Operation not found or not owned by your unit")
    allowed_fields = {"title", "description", "operation_type", "date", "time", "max_participants", "theater", "lat", "lng"}
    update = {k: v for k, v in data.items() if k in allowed_fields}
    if update:
        await db.operations.update_one({"id": operation_id}, {"$set": update})
    await db.partner_audit_log.insert_one({
        "action": "partner_update_operation", "unit_id": partner_user["partner_unit_id"],
        "performed_by": partner_user["id"], "performed_by_type": "partner_admin",
        "details": {"operation_id": operation_id, "updates": update},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Operation updated"}


@router.delete("/partner/admin/operations/{operation_id}")
async def partner_admin_delete_operation(operation_id: str, partner_user: dict = Depends(get_current_partner_admin)):
    result = await db.operations.delete_one({
        "id": operation_id, "origin_type": "partner_unit",
        "origin_unit_id": partner_user["partner_unit_id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Operation not found or not owned by your unit")
    await db.partner_audit_log.insert_one({
        "action": "partner_delete_operation", "unit_id": partner_user["partner_unit_id"],
        "performed_by": partner_user["id"], "performed_by_type": "partner_admin",
        "details": {"operation_id": operation_id},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Operation deleted"}


# Partner admin intel CRUD

@router.get("/partner/admin/intel")
async def partner_admin_list_intel(partner_user: dict = Depends(get_current_partner_admin)):
    intel = await db.intel_briefings.find(
        {"origin_type": "partner_unit", "origin_unit_id": partner_user["partner_unit_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return intel


@router.post("/partner/admin/intel")
async def partner_admin_create_intel(data: dict, partner_user: dict = Depends(get_current_partner_admin)):
    unit = partner_user.get("_partner_unit", {})
    intel_id = str(uuid.uuid4())
    intel_doc = {
        "id": intel_id,
        "title": data.get("title", ""),
        "content": data.get("content", ""),
        "classification": data.get("classification", "unclassified"),
        "severity": data.get("severity", "medium"),
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "origin_type": "partner_unit",
        "origin_unit_id": partner_user["partner_unit_id"],
        "origin_unit_name": unit.get("name", "Partner Unit"),
        "visibility_scope": "all",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.intel_briefings.insert_one(intel_doc)
    await db.partner_audit_log.insert_one({
        "action": "partner_create_intel", "unit_id": partner_user["partner_unit_id"],
        "performed_by": partner_user["id"], "performed_by_type": "partner_admin",
        "details": {"intel_id": intel_id, "title": intel_doc["title"]},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Intel briefing created", "intel": intel_doc}


@router.put("/partner/admin/intel/{intel_id}")
async def partner_admin_update_intel(intel_id: str, data: dict, partner_user: dict = Depends(get_current_partner_admin)):
    existing = await db.intel_briefings.find_one({
        "id": intel_id, "origin_type": "partner_unit",
        "origin_unit_id": partner_user["partner_unit_id"]
    })
    if not existing:
        raise HTTPException(status_code=404, detail="Intel briefing not found or not owned by your unit")
    allowed_fields = {"title", "content", "classification", "severity", "lat", "lng"}
    update = {k: v for k, v in data.items() if k in allowed_fields}
    if update:
        await db.intel_briefings.update_one({"id": intel_id}, {"$set": update})
    await db.partner_audit_log.insert_one({
        "action": "partner_update_intel", "unit_id": partner_user["partner_unit_id"],
        "performed_by": partner_user["id"], "performed_by_type": "partner_admin",
        "details": {"intel_id": intel_id, "updates": update},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Intel briefing updated"}


@router.delete("/partner/admin/intel/{intel_id}")
async def partner_admin_delete_intel(intel_id: str, partner_user: dict = Depends(get_current_partner_admin)):
    result = await db.intel_briefings.delete_one({
        "id": intel_id, "origin_type": "partner_unit",
        "origin_unit_id": partner_user["partner_unit_id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Intel briefing not found or not owned by your unit")
    await db.partner_audit_log.insert_one({
        "action": "partner_delete_intel", "unit_id": partner_user["partner_unit_id"],
        "performed_by": partner_user["id"], "performed_by_type": "partner_admin",
        "details": {"intel_id": intel_id},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"message": "Intel briefing deleted"}


# Partner applications

@router.post("/partner-applications")
async def submit_partner_application(data: PartnerApplicationSubmit):
    existing = await db.partner_applications.find_one(
        {"contact_email": data.contact_email, "status": "pending"}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="An application with this email is already pending review")
    app_doc = PartnerApplication(**data.model_dump())
    doc = app_doc.model_dump()
    doc["submitted_at"] = doc["submitted_at"].isoformat()
    await db.partner_applications.insert_one(doc)
    return {"message": "Application submitted successfully", "id": app_doc.id}


@router.get("/partner-applications")
async def list_partner_applications(current_user: dict = Depends(get_current_admin_or_liaison)):
    apps = await db.partner_applications.find({}, {"_id": 0}).sort("submitted_at", -1).to_list(200)
    return apps


@router.put("/partner-applications/{app_id}/review")
async def review_partner_application(app_id: str, data: dict, current_user: dict = Depends(get_current_admin_or_liaison)):
    application = await db.partner_applications.find_one({"id": app_id}, {"_id": 0})
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    status = data.get("status")
    if status not in ("approved", "denied"):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'denied'")
    review_notes = data.get("review_notes", "")
    await db.partner_applications.update_one({"id": app_id}, {"$set": {
        "status": status,
        "reviewed_by": current_user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "review_notes": review_notes,
    }})
    if status == "approved":
        unit = PartnerUnit(
            name=application["unit_name"],
            description=application.get("description", ""),
            contact_email=application.get("contact_email", ""),
            created_by=current_user["id"],
        )
        doc = unit.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.partner_units.insert_one(doc)
        await db.partner_audit_log.insert_one({
            "action": "approve_partner_application", "unit_id": unit.id,
            "performed_by": current_user["id"], "performed_by_type": current_user.get("role", "admin"),
            "details": {"application_id": app_id, "unit_name": application["unit_name"]},
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    return {"message": f"Application {status}"}


# ── Partner Deployments ──────────────────────────────────────────────────────

@router.get("/partner/deployments")
async def partner_list_deployments(partner_user: dict = Depends(get_current_partner_user)):
    """List active deployments for the partner's unit."""
    unit_id = partner_user.get("partner_unit_id")
    deployments = await db.deployments.find(
        {"partner_unit_id": unit_id, "is_active": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return deployments


@router.get("/partner/admin/deployments")
async def partner_admin_list_deployments(partner_user: dict = Depends(get_current_partner_admin)):
    """List all deployments for the partner's unit (including archived)."""
    unit_id = partner_user.get("partner_unit_id")
    deployments = await db.deployments.find(
        {"partner_unit_id": unit_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return deployments


@router.post("/partner/admin/deployments")
async def partner_create_deployment(
    data: DeploymentCreate,
    partner_user: dict = Depends(get_current_partner_admin),
):
    """Create a deployment for the partner's unit."""
    unit_id = partner_user.get("partner_unit_id")
    dep = Deployment(
        title=data.title,
        description=data.description,
        status=data.status,
        deployment_type=data.deployment_type,
        start_location_name=data.start_location_name,
        start_latitude=data.start_latitude if data.start_latitude is not None else HOME_STATION["latitude"],
        start_longitude=data.start_longitude if data.start_longitude is not None else HOME_STATION["longitude"],
        destination_name=data.destination_name,
        destination_latitude=data.destination_latitude,
        destination_longitude=data.destination_longitude,
        start_date=data.start_date,
        estimated_arrival=data.estimated_arrival,
        waypoints=data.waypoints,
        notes=data.notes,
        is_active=data.is_active,
        created_by=partner_user["id"],
        partner_unit_id=unit_id,
        unit_name=data.unit_name,
    )
    await db.deployments.insert_one(dep.model_dump())
    await db.partner_audit_log.insert_one({
        "action": "deployment_create",
        "unit_id": unit_id,
        "performed_by": partner_user["id"],
        "performed_by_type": "partner_admin",
        "details": {"deployment_id": dep.id, "title": dep.title},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return dep.model_dump()


@router.put("/partner/admin/deployments/{deployment_id}")
async def partner_update_deployment(
    deployment_id: str,
    data: DeploymentUpdate,
    partner_user: dict = Depends(get_current_partner_admin),
):
    """Update a deployment belonging to the partner's unit."""
    unit_id = partner_user.get("partner_unit_id")
    existing = await db.deployments.find_one(
        {"id": deployment_id, "partner_unit_id": unit_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Deployment not found")

    update_dict = data.model_dump(exclude_unset=True)
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.deployments.update_one({"id": deployment_id}, {"$set": update_dict})
    await db.partner_audit_log.insert_one({
        "action": "deployment_update",
        "unit_id": unit_id,
        "performed_by": partner_user["id"],
        "performed_by_type": "partner_admin",
        "details": {"deployment_id": deployment_id},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    updated = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
    return updated


@router.delete("/partner/admin/deployments/{deployment_id}")
async def partner_delete_deployment(
    deployment_id: str,
    partner_user: dict = Depends(get_current_partner_admin),
):
    """Delete a deployment belonging to the partner's unit."""
    unit_id = partner_user.get("partner_unit_id")
    existing = await db.deployments.find_one(
        {"id": deployment_id, "partner_unit_id": unit_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Deployment not found")

    result = await db.deployments.delete_one({"id": deployment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deployment not found")

    try:
        await db.partner_audit_log.insert_one({
            "action": "deployment_delete",
            "unit_id": unit_id,
            "performed_by": partner_user["id"],
            "performed_by_type": "partner_admin",
            "details": {"deployment_id": deployment_id},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logging.error("Failed to write partner audit log for deployment delete: %s", exc)

    return {"message": "Deployment deleted"}
