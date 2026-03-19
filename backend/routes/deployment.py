"""Routes for NATO markers, deployments, and division location management."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models.deployment import (
    NATOMarker,
    NATOMarkerCreate,
    NATOMarkerUpdate,
    NATO_AFFILIATIONS,
    NATO_SYMBOL_TYPES,
    NATO_ECHELONS,
    NATO_AFFILIATION_LABELS,
    NATO_SYMBOL_TYPE_LABELS,
    NATO_ECHELON_LABELS,
    Deployment,
    DeploymentCreate,
    DeploymentUpdate,
    DEPLOYMENT_STATUSES,
    DEPLOYMENT_TYPES,
    DivisionLocation,
    DivisionLocationUpdate,
    DIVISION_STATES,
    HOME_STATION,
)
from middleware.auth import get_current_user, get_current_admin
from services.audit_service import log_audit

router = APIRouter()


# ── Reference Data ───────────────────────────────────────────────────────────

@router.get("/map/nato-reference")
async def get_nato_reference():
    """Return available NATO symbol types, affiliations, and echelons with labels."""
    return {
        "affiliations": NATO_AFFILIATIONS,
        "symbol_types": NATO_SYMBOL_TYPES,
        "echelons": NATO_ECHELONS,
        "affiliation_labels": NATO_AFFILIATION_LABELS,
        "symbol_type_labels": NATO_SYMBOL_TYPE_LABELS,
        "echelon_labels": NATO_ECHELON_LABELS,
        "deployment_types": DEPLOYMENT_TYPES,
    }


@router.get("/map/location-entities")
async def get_location_entities(current_user: dict = Depends(get_current_admin)):
    """Return campaigns, operations, and intel with coordinates for the entity picker."""
    entities = []

    # Campaigns with coordinates
    campaigns = await db.campaigns.find(
        {"lat": {"$ne": None}, "lng": {"$ne": None}},
        {"_id": 0, "name": 1, "lat": 1, "lng": 1, "id": 1},
    ).to_list(200)
    for c in campaigns:
        if c.get("lat") is not None and c.get("lng") is not None:
            entities.append({
                "entity_type": "campaign",
                "entity_id": c.get("id", ""),
                "name": c.get("name", "Campaign"),
                "latitude": c["lat"],
                "longitude": c["lng"],
            })

    # Operations with coordinates
    ops = await db.operations.find(
        {"lat": {"$ne": None}, "lng": {"$ne": None}},
        {"_id": 0, "title": 1, "lat": 1, "lng": 1, "id": 1},
    ).to_list(200)
    for op in ops:
        if op.get("lat") is not None and op.get("lng") is not None:
            entities.append({
                "entity_type": "operation",
                "entity_id": op.get("id", ""),
                "name": op.get("title", "Operation"),
                "latitude": op["lat"],
                "longitude": op["lng"],
            })

    # Intel briefings with coordinates
    intel = await db.intel_briefings.find(
        {"lat": {"$ne": None}, "lng": {"$ne": None}},
        {"_id": 0, "title": 1, "lat": 1, "lng": 1, "id": 1},
    ).to_list(200)
    for br in intel:
        if br.get("lat") is not None and br.get("lng") is not None:
            entities.append({
                "entity_type": "intel",
                "entity_id": br.get("id", ""),
                "name": br.get("title", "Intel"),
                "latitude": br["lat"],
                "longitude": br["lng"],
            })

    return entities


# ── NATO Markers (Public read, Admin write) ──────────────────────────────────

@router.get("/map/nato-markers")
async def list_nato_markers(current_user: dict = Depends(get_current_user)):
    """Return all active NATO markers for the map."""
    markers = await db.nato_markers.find(
        {"is_active": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return markers


@router.post("/admin/map/nato-markers")
async def create_nato_marker(
    data: NATOMarkerCreate,
    current_user: dict = Depends(get_current_admin),
):
    marker = NATOMarker(
        title=data.title,
        description=data.description,
        affiliation=data.affiliation,
        symbol_type=data.symbol_type,
        echelon=data.echelon,
        designator=data.designator,
        latitude=data.latitude,
        longitude=data.longitude,
        created_by=current_user["id"],
        metadata=data.metadata,
    )
    await db.nato_markers.insert_one(marker.model_dump())
    await log_audit(
        user_id=current_user["id"],
        action_type="nato_marker_create",
        resource_type="nato_marker",
        resource_id=marker.id,
    )
    return marker.model_dump()


@router.put("/admin/map/nato-markers/{marker_id}")
async def update_nato_marker(
    marker_id: str,
    data: NATOMarkerUpdate,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.nato_markers.find_one({"id": marker_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Marker not found")

    update_dict = {
        k: v for k, v in data.model_dump().items() if v is not None
    }
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.nato_markers.update_one({"id": marker_id}, {"$set": update_dict})
    await log_audit(
        user_id=current_user["id"],
        action_type="nato_marker_update",
        resource_type="nato_marker",
        resource_id=marker_id,
    )
    updated = await db.nato_markers.find_one({"id": marker_id}, {"_id": 0})
    return updated


@router.delete("/admin/map/nato-markers/{marker_id}")
async def delete_nato_marker(
    marker_id: str,
    current_user: dict = Depends(get_current_admin),
):
    result = await db.nato_markers.delete_one({"id": marker_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Marker not found")
    await log_audit(
        user_id=current_user["id"],
        action_type="nato_marker_delete",
        resource_type="nato_marker",
        resource_id=marker_id,
    )
    return {"message": "Marker deleted"}


# ── Deployments (Public read, Admin write) ───────────────────────────────────

@router.get("/map/deployments")
async def list_deployments(current_user: dict = Depends(get_current_user)):
    """Return all active deployments for map display (25th ID + partner)."""
    deployments = await db.deployments.find(
        {"is_active": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return deployments


@router.get("/map/deployments/{deployment_id}")
async def get_deployment(
    deployment_id: str,
    current_user: dict = Depends(get_current_user),
):
    dep = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return dep


@router.get("/admin/map/deployments")
async def admin_list_deployments(
    deployment_type: str = None,
    current_user: dict = Depends(get_current_admin),
):
    """Return deployments filtered by type, including inactive/archived."""
    query = {}
    if deployment_type == "allied":
        query["deployment_type"] = "allied"
    elif deployment_type == "partner":
        query["deployment_type"] = "partner"
    else:
        # Default: show 25th ID deployments (backwards-compatible)
        query["$or"] = [
            {"deployment_type": "25th_id"},
            {"deployment_type": {"$exists": False}},
            {"deployment_type": None},
        ]
        query["partner_unit_id"] = None
    deployments = await db.deployments.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return deployments


@router.post("/admin/map/deployments")
async def create_deployment(
    data: DeploymentCreate,
    current_user: dict = Depends(get_current_admin),
):
    dep = Deployment(
        title=data.title,
        description=data.description,
        status=data.status,
        deployment_type=data.deployment_type,
        start_location_name=data.start_location_name,
        start_latitude=data.start_latitude,
        start_longitude=data.start_longitude,
        destination_name=data.destination_name,
        destination_latitude=data.destination_latitude,
        destination_longitude=data.destination_longitude,
        start_date=data.start_date,
        estimated_arrival=data.estimated_arrival,
        waypoints=data.waypoints,
        notes=data.notes,
        created_by=current_user["id"],
        partner_unit_id=data.partner_unit_id,
        unit_name=data.unit_name,
    )
    await db.deployments.insert_one(dep.model_dump())

    # If deploying/deployed, update division location (only for 25th ID deployments)
    if data.status in ("deploying", "deployed") and data.deployment_type == "25th_id":
        await _update_division_for_deployment(dep, current_user["id"])

    await log_audit(
        user_id=current_user["id"],
        action_type="deployment_create",
        resource_type="deployment",
        resource_id=dep.id,
    )
    return dep.model_dump()


@router.put("/admin/map/deployments/{deployment_id}")
async def update_deployment(
    deployment_id: str,
    data: DeploymentUpdate,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deployment not found")

    update_dict = {
        k: v for k, v in data.model_dump().items() if v is not None
    }
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.deployments.update_one({"id": deployment_id}, {"$set": update_dict})

    # If status changed, update division location (only for 25th ID deployments)
    new_status = data.status
    if new_status:
        updated = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
        dep_obj = Deployment(**updated)
        is_25th = dep_obj.deployment_type == "25th_id" or (
            dep_obj.deployment_type is None and dep_obj.partner_unit_id is None
        )
        if is_25th:
            if new_status in ("deploying", "deployed"):
                await _update_division_for_deployment(dep_obj, current_user["id"])
            elif new_status in ("returning",):
                await _set_division_state("returning", dep_obj.start_location_name,
                                           dep_obj.start_latitude, dep_obj.start_longitude,
                                           deployment_id, current_user["id"])
            elif new_status in ("completed", "cancelled"):
                await _reset_division_home(current_user["id"])

    await log_audit(
        user_id=current_user["id"],
        action_type="deployment_update",
        resource_type="deployment",
        resource_id=deployment_id,
        before={"status": existing.get("status")},
        after={"status": data.status} if data.status else {},
    )
    updated = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
    return updated


@router.delete("/admin/map/deployments/{deployment_id}")
async def archive_deployment(
    deployment_id: str,
    current_user: dict = Depends(get_current_admin),
):
    existing = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deployment not found")

    await db.deployments.update_one(
        {"id": deployment_id},
        {"$set": {"is_active": False, "status": "completed",
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    # If this was the active deployment, reset division home
    div = await db.division_location.find_one({"id": "division_25id"}, {"_id": 0})
    if div and div.get("active_deployment_id") == deployment_id:
        await _reset_division_home(current_user["id"])

    await log_audit(
        user_id=current_user["id"],
        action_type="deployment_archive",
        resource_type="deployment",
        resource_id=deployment_id,
    )
    return {"message": "Deployment archived"}


# ── Division Location ────────────────────────────────────────────────────────

@router.get("/map/division-location")
async def get_division_location(current_user: dict = Depends(get_current_user)):
    """Return current 25th ID location and deployment state."""
    doc = await db.division_location.find_one(
        {"id": "division_25id"}, {"_id": 0}
    )
    if not doc:
        # Return default home station
        default = DivisionLocation().model_dump()
        await db.division_location.insert_one(default)
        return default
    return doc


@router.put("/admin/map/division-location")
async def update_division_location(
    data: DivisionLocationUpdate,
    current_user: dict = Depends(get_current_admin),
):
    update_dict = {
        k: v for k, v in data.model_dump().items() if v is not None
    }
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["updated_by"] = current_user["id"]

    await db.division_location.update_one(
        {"id": "division_25id"},
        {"$set": update_dict},
        upsert=True,
    )
    await log_audit(
        user_id=current_user["id"],
        action_type="division_location_update",
        resource_type="division_location",
        resource_id="division_25id",
    )
    return await db.division_location.find_one(
        {"id": "division_25id"}, {"_id": 0}
    )


# ── Internal helpers ─────────────────────────────────────────────────────────

async def _update_division_for_deployment(dep: Deployment, user_id: str):
    """Update division location to reflect a deploying/deployed state."""
    state = "deploying" if dep.status == "deploying" else "deployed"
    loc_name = dep.destination_name or dep.start_location_name
    lat = dep.destination_latitude if dep.destination_latitude else dep.start_latitude
    lng = dep.destination_longitude if dep.destination_longitude else dep.start_longitude

    await db.division_location.update_one(
        {"id": "division_25id"},
        {"$set": {
            "state": state,
            "current_location_name": loc_name,
            "current_latitude": lat,
            "current_longitude": lng,
            "active_deployment_id": dep.id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user_id,
        }},
        upsert=True,
    )


async def _set_division_state(state, name, lat, lng, dep_id, user_id):
    await db.division_location.update_one(
        {"id": "division_25id"},
        {"$set": {
            "state": state,
            "current_location_name": name,
            "current_latitude": lat,
            "current_longitude": lng,
            "active_deployment_id": dep_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user_id,
        }},
        upsert=True,
    )


async def _reset_division_home(user_id: str):
    """Reset division to home station."""
    await db.division_location.update_one(
        {"id": "division_25id"},
        {"$set": {
            "state": "home_station",
            "current_location_name": HOME_STATION["name"],
            "current_latitude": HOME_STATION["latitude"],
            "current_longitude": HOME_STATION["longitude"],
            "active_deployment_id": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user_id,
        }},
        upsert=True,
    )
