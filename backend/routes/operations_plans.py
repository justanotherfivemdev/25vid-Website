"""
Routes for the Operations Planner feature.

Provides:
  - Tactical map image upload / retrieval
  - Operations Plan CRUD (create, read, update, delete)
  - Listing endpoints with filters for published/draft plans

Permissions:
  - Map upload + Plan create/edit/delete → require MANAGE_PLANS
  - Plan read (published) → any authenticated member
  - Plan read (drafts, staff-only) → require MANAGE_PLANS
"""

import os
import uuid
import imghdr
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query

from database import db
from config import UPLOAD_DIR
from middleware.auth import get_current_user
from middleware.rbac import require_permission, has_permission, Permission
from models.operations_plan import (
    TacticalMap,
    TacticalMapResponse,
    OperationsPlan,
    OperationsPlanCreate,
    OperationsPlanUpdate,
    PlanUnit,
)

router = APIRouter()

# ── Upload directory ─────────────────────────────────────────────────────────

MAPS_UPLOAD_DIR = UPLOAD_DIR / "maps"
MAPS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Constraints
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


# ── Tactical Map endpoints ───────────────────────────────────────────────────

@router.post("/maps/upload")
async def upload_map(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Upload a tactical map image."""
    # --- Validate content type ---
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Allowed: JPEG, PNG, WebP.",
        )

    # --- Validate extension ---
    ext = Path(file.filename or "upload").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}.",
        )

    # --- Read & validate size ---
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({len(data)} bytes). Maximum: {MAX_FILE_SIZE} bytes.",
        )

    # --- Validate actual image content ---
    # imghdr may detect JPEG as "jpeg" and certain SGI images as "rgb"
    detected_type = imghdr.what(None, h=data)
    if detected_type not in ("jpeg", "png", "webp", "rgb"):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid image.")

    # --- Determine dimensions ---
    width, height = _get_image_dimensions(data)
    if width == 0 or height == 0:
        raise HTTPException(
            status_code=400,
            detail="Unable to determine image dimensions. Please upload a valid JPEG, PNG, or WebP file.",
        )

    # --- Safe filename ---
    map_id = str(uuid.uuid4())
    safe_name = f"{map_id}{ext}"
    file_path = MAPS_UPLOAD_DIR / safe_name

    # --- Write to disk ---
    with open(file_path, "wb") as fh:
        fh.write(data)

    # --- Store metadata in MongoDB ---
    tactical_map = TacticalMap(
        id=map_id,
        filename=safe_name,
        original_filename=file.filename or "upload",
        width=width,
        height=height,
        file_size=len(data),
        content_type=file.content_type or "image/png",
        uploaded_by=current_user["id"],
    )
    doc = tactical_map.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.tactical_maps.insert_one(doc)

    return {
        "id": map_id,
        "filename": safe_name,
        "original_filename": tactical_map.original_filename,
        "width": width,
        "height": height,
        "content_type": tactical_map.content_type,
        "image_url": f"/api/uploads/maps/{safe_name}",
    }


@router.get("/maps/{map_id}")
async def get_map(map_id: str, current_user: dict = Depends(get_current_user)):
    """Get tactical map metadata + image URL."""
    doc = await db.tactical_maps.find_one({"id": map_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Map not found")
    doc["image_url"] = f"/api/uploads/maps/{doc['filename']}"
    return doc


@router.get("/maps")
async def list_maps(current_user: dict = Depends(get_current_user)):
    """List all available tactical maps."""
    docs = await db.tactical_maps.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for d in docs:
        d["image_url"] = f"/api/uploads/maps/{d['filename']}"
    return docs


# ── Built-in Reforger Maps metadata ─────────────────────────────────────────

GITHUB_RAW_BASE = (
    "https://raw.githubusercontent.com/arcticfr33d0m/"
    "ArmaReforgerMortarCalculator/main/maps"
)

REFORGER_MAPS = [
    {
        "id": "everon",
        "name": "Everon",
        "description": "Main island \u2014 12.7 km \u00d7 12.7 km terrain",
        "xMax": 12700,
        "yMax": 12700,
        "imageUrl": f"{GITHUB_RAW_BASE}/Everon.png",
        "gridSize": 1000,
    },
    {
        "id": "serhiivka",
        "name": "Serhiivka",
        "description": "Eastern front urban area \u2014 10.2 km \u00d7 10.2 km",
        "xMax": 10240,
        "yMax": 10240,
        "imageUrl": f"{GITHUB_RAW_BASE}/Serhiivka.png",
        "gridSize": 1000,
    },
    {
        "id": "zarichne",
        "name": "Zarichne",
        "description": "Compact rural terrain \u2014 4.6 km \u00d7 4.6 km",
        "xMax": 4607,
        "yMax": 4607,
        "imageUrl": f"{GITHUB_RAW_BASE}/Zarichne.png",
        "gridSize": 500,
    },
    {
        "id": "belleau-wood",
        "name": "Belleau Wood",
        "description": "Dense woodland theatre \u2014 12 km \u00d7 12 km",
        "xMax": 12030,
        "yMax": 12030,
        "imageUrl": f"{GITHUB_RAW_BASE}/BelleauWood.png",
        "gridSize": 1000,
    },
]


@router.get("/reforger-maps")
async def list_reforger_maps(current_user: dict = Depends(get_current_user)):
    """List built-in Arma Reforger map metadata (game maps with grid coords)."""
    return REFORGER_MAPS


# ── Operations Plan endpoints ────────────────────────────────────────────────

@router.post("/operations-plans")
async def create_plan(
    plan_data: OperationsPlanCreate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Create a new operations plan."""
    # Validate map exists (skip validation for built-in Reforger maps)
    if not plan_data.map_id.startswith("reforger_"):
        tmap = await db.tactical_maps.find_one({"id": plan_data.map_id}, {"_id": 0})
        if not tmap:
            raise HTTPException(status_code=400, detail="Referenced map does not exist")

    plan_dict = plan_data.model_dump()
    plan_dict["created_by"] = current_user["id"]
    plan_dict["updated_by"] = current_user["id"]
    plan_obj = OperationsPlan(**plan_dict)

    doc = plan_obj.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    await db.operations_plans.insert_one(doc)
    return doc


@router.get("/operations-plans")
async def list_plans(
    published_only: bool = Query(False),
    live_only: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """List operations plans.

    - Staff with MANAGE_PLANS see all plans (drafts + published).
    - Regular members see only published plans with appropriate visibility.
    - live_only=true returns only plans with an active live session + live viewing enabled.
    """
    role = current_user.get("role", "member")
    can_manage = has_permission(role, Permission.MANAGE_PLANS)

    query: dict = {}

    if live_only:
        # Live plans: session active AND live viewing enabled for members
        query["is_live_session_active"] = True
        if not can_manage:
            query["allow_live_viewing"] = True

    elif not can_manage or published_only:
        query["is_published"] = True
        # Non-staff members can only see "all_members" scope
        if not can_manage:
            query["visibility_scope"] = "all_members"

    docs = (
        await db.operations_plans.find(query, {"_id": 0})
        .sort("updated_at", -1)
        .to_list(500)
    )

    # Enrich with map image URL + creator username
    map_ids = list({d["map_id"] for d in docs})
    maps_cursor = db.tactical_maps.find({"id": {"$in": map_ids}}, {"_id": 0})
    maps_list = await maps_cursor.to_list(len(map_ids))
    maps_by_id = {m["id"]: m for m in maps_list}

    creator_ids = list({d["created_by"] for d in docs})
    users_cursor = db.users.find(
        {"id": {"$in": creator_ids}}, {"_id": 0, "id": 1, "username": 1}
    )
    users_list = await users_cursor.to_list(len(creator_ids))
    users_by_id = {u["id"]: u for u in users_list}

    for d in docs:
        mid = d["map_id"]
        # Handle built-in Reforger maps
        if mid.startswith("reforger_"):
            rmap_id = mid.replace("reforger_", "")
            rmap = next((rm for rm in REFORGER_MAPS if rm["id"] == rmap_id), None)
            d["map_image_url"] = rmap["imageUrl"] if rmap else None
            d["map_name"] = rmap["name"] if rmap else mid
        else:
            m = maps_by_id.get(mid)
            d["map_image_url"] = f"/api/uploads/maps/{m['filename']}" if m else None
            d["map_name"] = m.get("original_filename", "") if m else ""
        creator = users_by_id.get(d["created_by"])
        d["created_by_username"] = creator.get("username", "Unknown") if creator else "Unknown"

    return docs


@router.get("/operations-plans/{plan_id}")
async def get_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single operations plan (with access control)."""
    doc = await db.operations_plans.find_one({"id": plan_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Plan not found")

    role = current_user.get("role", "member")
    can_manage = has_permission(role, Permission.MANAGE_PLANS)

    # Access control: non-managers can see published plans OR live-viewing plans
    if not can_manage:
        is_published = doc.get("is_published")
        is_live_viewable = doc.get("is_live_session_active") and doc.get("allow_live_viewing")
        if not is_published and not is_live_viewable:
            raise HTTPException(status_code=403, detail="Plan is not published")
        if doc.get("visibility_scope") == "staff_only" and not is_live_viewable:
            raise HTTPException(status_code=403, detail="Plan is restricted to staff")

    # Enrich with map info
    mid = doc["map_id"]
    if mid.startswith("reforger_"):
        rmap_id = mid.replace("reforger_", "")
        rmap = next((rm for rm in REFORGER_MAPS if rm["id"] == rmap_id), None)
        if rmap:
            doc["map_image_url"] = rmap["imageUrl"]
            doc["map_width"] = rmap["xMax"]
            doc["map_height"] = rmap["yMax"]
            doc["map_name"] = rmap["name"]
    else:
        m = await db.tactical_maps.find_one({"id": mid}, {"_id": 0})
        if m:
            doc["map_image_url"] = f"/api/uploads/maps/{m['filename']}"
            doc["map_width"] = m["width"]
            doc["map_height"] = m["height"]
            doc["map_name"] = m.get("original_filename", "")

    creator = await db.users.find_one(
        {"id": doc["created_by"]}, {"_id": 0, "username": 1}
    )
    doc["created_by_username"] = creator.get("username", "Unknown") if creator else "Unknown"

    return doc


@router.put("/operations-plans/{plan_id}")
async def update_plan(
    plan_id: str,
    plan_data: OperationsPlanUpdate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Update an existing operations plan."""
    existing = await db.operations_plans.find_one({"id": plan_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Plan not found")

    update_fields = plan_data.model_dump(exclude_unset=True)
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # If map_id changed, validate it exists (skip for built-in Reforger maps)
    if "map_id" in update_fields:
        mid = update_fields["map_id"]
        if not mid.startswith("reforger_"):
            tmap = await db.tactical_maps.find_one({"id": mid}, {"_id": 0})
            if not tmap:
                raise HTTPException(status_code=400, detail="Referenced map does not exist")

    update_fields["updated_by"] = current_user["id"]
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.operations_plans.update_one({"id": plan_id}, {"$set": update_fields})

    updated = await db.operations_plans.find_one({"id": plan_id}, {"_id": 0})
    return updated


@router.delete("/operations-plans/{plan_id}")
async def delete_plan(
    plan_id: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_PLANS)),
):
    """Delete an operations plan."""
    existing = await db.operations_plans.find_one({"id": plan_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Plan not found")

    await db.operations_plans.delete_one({"id": plan_id})
    return {"message": "Plan deleted", "id": plan_id}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_image_dimensions(data: bytes) -> tuple[int, int]:
    """Extract width × height from raw image bytes (PNG / JPEG / WebP).

    Returns (0, 0) if dimensions cannot be determined, which the caller
    should treat as a valid but dimension-unknown image.
    """
    import struct

    # PNG: bytes 16-23 contain width(4) + height(4) in the IHDR chunk
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", data[16:24])
        return int(w), int(h)

    # JPEG: scan for SOF markers (0xFFC0 .. 0xFFCF except 0xFFC4/0xFFC8)
    if data[:2] == b"\xff\xd8":
        idx = 2
        while idx < len(data) - 9:
            if data[idx] != 0xFF:
                idx += 1
                continue
            marker = data[idx + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", data[idx + 5 : idx + 9])
                return int(w), int(h)
            length = struct.unpack(">H", data[idx + 2 : idx + 4])[0]
            idx += 2 + length
        return 0, 0

    # WebP (RIFF container)
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        if data[12:16] == b"VP8 ":
            w = (data[26] | (data[27] << 8)) & 0x3FFF
            h = (data[28] | (data[29] << 8)) & 0x3FFF
            return int(w), int(h)
        if data[12:16] == b"VP8L":
            bits = struct.unpack("<I", data[21:25])[0]
            w = (bits & 0x3FFF) + 1
            h = ((bits >> 14) & 0x3FFF) + 1
            return int(w), int(h)
        if data[12:16] == b"VP8X":
            w = (data[24] | (data[25] << 8) | (data[26] << 16)) + 1
            h = (data[27] | (data[28] << 8) | (data[29] << 16)) + 1
            return int(w), int(h)

    return 0, 0
