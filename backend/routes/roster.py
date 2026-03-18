from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.user import ProfileSelfUpdate
from middleware.auth import get_current_user
from services.auth_service import user_to_response
from utils.mos_mapping import get_mos_display
from utils.billet_mapping import get_billet_display

router = APIRouter()


@router.get("/roster")
async def get_roster(current_user: dict = Depends(get_current_user)):
    users = await db.users.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).sort("username", 1).to_list(1000)
    roster = []
    for u in users:
        jd = u.get("join_date")
        if isinstance(jd, str):
            jd = datetime.fromisoformat(jd).isoformat()
        elif hasattr(jd, 'isoformat'):
            jd = jd.isoformat()

        billet = u.get("billet")
        billet_info = get_billet_display(billet)
        mos_info = get_mos_display(u.get("specialization"), billet)

        roster.append({
            "id": u["id"], "username": u["username"], "role": u.get("role", "member"),
            "rank": u.get("rank"), "specialization": u.get("specialization"),
            "status": u.get("status", "recruit"), "squad": u.get("squad"),
            "avatar_url": u.get("avatar_url"), "join_date": jd,
            "company": u.get("company"), "platoon": u.get("platoon"), "billet": billet,
            "display_mos": u.get("display_mos") or f"{mos_info['mos_code']} / {mos_info['mos_title']}",
            "billet_acronym": u.get("billet_acronym") or billet_info.get("acronym"),
            "loa_status": u.get("loa_status"),
            "pipeline_stage": u.get("pipeline_stage"),
        })
    return roster


@router.get("/roster/hierarchy")
async def get_roster_hierarchy(current_user: dict = Depends(get_current_user)):
    users = await db.users.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).to_list(1000)

    hierarchy = {
        "command_staff": [],
        "companies": {},
        "unassigned": []
    }

    for u in users:
        billet_raw = u.get("billet")
        billet_info = get_billet_display(billet_raw)
        mos_info = get_mos_display(u.get("specialization"), billet_raw)

        member_data = {
            "id": u["id"], "username": u["username"], "role": u.get("role", "member"),
            "rank": u.get("rank"), "specialization": u.get("specialization"),
            "status": u.get("status", "recruit"), "squad": u.get("squad"),
            "avatar_url": u.get("avatar_url"),
            "company": u.get("company"), "platoon": u.get("platoon"), "billet": billet_raw,
            "display_mos": u.get("display_mos") or f"{mos_info['mos_code']} / {mos_info['mos_title']}",
            "billet_acronym": u.get("billet_acronym") or billet_info.get("acronym"),
            "loa_status": u.get("loa_status"),
            "pipeline_stage": u.get("pipeline_stage"),
        }

        billet = (u.get("billet") or "").lower()
        status = u.get("status", "recruit")
        company = u.get("company")
        platoon = u.get("platoon")
        squad = u.get("squad")

        if status == "command" or any(x in billet for x in ["commander", "commanding officer", "executive officer", "xo", "sergeant major", "first sergeant"]):
            hierarchy["command_staff"].append(member_data)
        elif company:
            if company not in hierarchy["companies"]:
                hierarchy["companies"][company] = {"platoons": {}, "unassigned": []}

            if platoon:
                if platoon not in hierarchy["companies"][company]["platoons"]:
                    hierarchy["companies"][company]["platoons"][platoon] = {"squads": {}, "unassigned": []}

                if squad:
                    if squad not in hierarchy["companies"][company]["platoons"][platoon]["squads"]:
                        hierarchy["companies"][company]["platoons"][platoon]["squads"][squad] = []
                    hierarchy["companies"][company]["platoons"][platoon]["squads"][squad].append(member_data)
                else:
                    hierarchy["companies"][company]["platoons"][platoon]["unassigned"].append(member_data)
            else:
                hierarchy["companies"][company]["unassigned"].append(member_data)
        else:
            hierarchy["unassigned"].append(member_data)

    def sort_key(m):
        billet = (m.get("billet") or "").lower()
        if "commander" in billet or "commanding" in billet: return 0
        if "xo" in billet or "executive" in billet: return 1
        if "sergeant major" in billet: return 2
        if "first sergeant" in billet: return 3
        return 10

    hierarchy["command_staff"].sort(key=sort_key)

    return hierarchy


@router.get("/roster/partner-units")
async def get_roster_partner_units(current_user: dict = Depends(get_current_user)):
    units = await db.partner_units.find({"status": "active"}, {"_id": 0}).sort("name", 1).to_list(100)
    for unit in units:
        unit["member_count"] = await db.partner_users.count_documents({"partner_unit_id": unit["id"], "is_active": True})
    return units


@router.get("/roster/partner-units/{unit_id}/members")
async def get_partner_unit_roster(unit_id: str, current_user: dict = Depends(get_current_user)):
    unit = await db.partner_units.find_one({"id": unit_id, "status": "active"}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Partner unit not found")
    members = await db.partner_users.find(
        {"partner_unit_id": unit_id, "is_active": True},
        {"_id": 0, "password_hash": 0, "email": 0}
    ).sort("username", 1).to_list(200)
    return {"unit": unit, "members": members}


@router.get("/roster/{user_id}")
async def get_member_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Member not found")
    if current_user["id"] != user_id and current_user.get("role") != "admin":
        user.pop("email", None)
    return user_to_response(user)


@router.put("/profile")
async def update_own_profile(profile_data: ProfileSelfUpdate, current_user: dict = Depends(get_current_user)):
    update_dict = {k: v for k, v in profile_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"id": current_user["id"]}, {"$set": update_dict})
    updated = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password_hash": 0})
    return user_to_response(updated)
