"""Routes for NATO markers, deployments, and division location management."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import ValidationError

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
    RoutePoint,
    DEPLOYMENT_STATUSES,
    DEPLOYMENT_ORIGIN_TYPES,
    DivisionLocation,
    DivisionLocationUpdate,
    DIVISION_STATES,
    HOME_STATION,
)
from middleware.auth import get_current_user, get_current_admin
from middleware.rbac import require_permission, Permission
from services.audit_service import log_audit
from services.error_log_service import log_error, log_exception
from services.mongo_sanitize import sanitize_mongo_payload

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
        "deployment_origin_types": DEPLOYMENT_ORIGIN_TYPES,
    }


@router.get("/map/location-entities")
async def get_location_entities(current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS))):
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
    current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS)),
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
    current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS)),
):
    existing = await db.nato_markers.find_one({"id": marker_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Marker not found")

    update_dict = data.model_dump(exclude_unset=True)
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
    current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS)),
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
    """Return active deployments for the Global Threat Map live display."""
    await _auto_advance_deployment_phases()
    deployments = await db.deployments.find(
        {"status": {"$in": ["deploying", "deployed", "endex", "rtb"]}, "is_active": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return deployments


@router.get("/map/deployments/active-deployed")
async def list_active_deployed(current_user: dict = Depends(get_current_user)):
    """Return deployments currently in the 'deployed' phase (active and is_active).

    Used by the Operations Manager to let admins attribute operations
    to a specific live deployment.
    """
    await _auto_advance_deployment_phases()
    deployments = await db.deployments.find(
        {"status": "deployed", "is_active": True},
        {"_id": 0, "id": 1, "title": 1, "unit_name": 1, "origin_type": 1, "status": 1},
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
    origin_type: str = Query(default=None),
    current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS)),
):
    """Return deployments filtered by origin_type. Shows all if no filter given."""
    query = {}
    if origin_type:
        query["origin_type"] = origin_type
    deployments = await db.deployments.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return deployments


@router.post("/admin/map/deployments")
async def create_deployment(
    data: DeploymentCreate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS)),
):
    try:
        dep = Deployment(
            title=data.title,
            unit_name=data.unit_name,
            origin_type=data.origin_type,
            origin_unit_id=data.origin_unit_id,
            status=data.status,
            is_active=data.is_active,
            total_duration_hours=data.total_duration_hours,
            route_points=data.route_points,
            notes=data.notes,
            created_by=current_user["id"],
        )
        # Auto-set started_at when creating as deploying
        if dep.status == "deploying":
            dep.started_at = datetime.now(timezone.utc).isoformat()
    except ValidationError as exc:
        logging.error("Deployment validation failed: %s", exc)
        await log_error(
            source="deployment",
            message=f"Deployment creation validation failed: {exc}",
            severity="warning",
            error_type="ValidationError",
            request_path="/api/admin/map/deployments",
            request_method="POST",
            request_body=data.model_dump(),
            user_id=current_user.get("id"),
            metadata={"action": "create_deployment"},
        )
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        await log_exception(
            "deployment", exc,
            request_path="/api/admin/map/deployments",
            request_method="POST",
            request_body=data.model_dump(),
            user_id=current_user.get("id"),
            metadata={"action": "create_deployment"},
        )
        raise

    try:
        await db.deployments.insert_one(sanitize_mongo_payload(dep.model_dump()))
    except Exception as exc:
        await log_exception(
            "deployment", exc,
            request_path="/api/admin/map/deployments",
            request_method="POST",
            request_body=data.model_dump(),
            user_id=current_user.get("id"),
            metadata={"action": "create_deployment", "phase": "db_insert"},
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save deployment: {exc}",
        )

    # If deploying 25th deployment, update division location
    if dep.status == "deploying" and dep.is_active and dep.origin_type == "25th":
        try:
            await _update_division_for_deployment(dep, current_user["id"])
        except Exception as exc:
            logging.error("Failed to update division location: %s", exc)
            await log_exception(
                "deployment", exc,
                request_path="/api/admin/map/deployments",
                request_method="POST",
                metadata={"action": "update_division", "deployment_id": dep.id},
            )

    try:
        await log_audit(
            user_id=current_user["id"],
            action_type="deployment_create",
            resource_type="deployment",
            resource_id=dep.id,
        )
    except Exception as exc:
        logging.error("Failed to write audit log for deployment create: %s", exc)

    return dep.model_dump()


@router.put("/admin/map/deployments/{deployment_id}")
async def update_deployment(
    deployment_id: str,
    data: DeploymentUpdate,
    current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS)),
):
    existing = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deployment not found")

    update_dict = data.model_dump(exclude_unset=True)
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")

    old_status = existing.get("status")
    new_status = update_dict.get("status")

    # Auto-set started_at when transitioning to deploying
    if new_status == "deploying" and not existing.get("started_at"):
        update_dict["started_at"] = datetime.now(timezone.utc).isoformat()

    # Auto-set return_started_at when transitioning to rtb
    if new_status == "rtb" and not existing.get("return_started_at"):
        update_dict["return_started_at"] = datetime.now(timezone.utc).isoformat()

    # Serialize route_points if present
    if "route_points" in update_dict and update_dict["route_points"] is not None:
        update_dict["route_points"] = [
            rp.model_dump() if isinstance(rp, RoutePoint) else rp
            for rp in update_dict["route_points"]
        ]

    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        await db.deployments.update_one(
            {"id": deployment_id},
            {"$set": sanitize_mongo_payload(update_dict)},
        )
    except Exception as exc:
        await log_exception(
            "deployment", exc,
            request_path=f"/api/admin/map/deployments/{deployment_id}",
            request_method="PUT",
            request_body=data.model_dump(exclude_unset=True),
            user_id=current_user.get("id"),
            metadata={"action": "update_deployment", "deployment_id": deployment_id},
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update deployment: {exc}",
        )

    # Update division location for 25th origin deployments on status change
    if new_status and new_status != old_status:
        updated = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
        try:
            dep_obj = Deployment(**updated)
        except ValidationError as exc:
            logging.error("Deployment reconstruction failed: %s", exc)
            await log_error(
                source="deployment",
                message=f"Deployment reconstruction after update failed: {exc}",
                severity="error",
                error_type="ValidationError",
                request_path=f"/api/admin/map/deployments/{deployment_id}",
                request_method="PUT",
                request_body=data.model_dump(exclude_unset=True),
                user_id=current_user.get("id"),
                metadata={
                    "action": "update_deployment",
                    "deployment_id": deployment_id,
                    "stored_document": {k: v for k, v in updated.items()
                                        if k not in ("_id",)},
                },
            )
            raise HTTPException(status_code=422, detail=str(exc))

        if dep_obj.origin_type == "25th":
            try:
                if new_status == "deploying":
                    await _update_division_for_deployment(dep_obj, current_user["id"])
                elif new_status in ("completed", "cancelled"):
                    await _reset_division_home(current_user["id"])
            except Exception as exc:
                logging.error("Failed to update division location: %s", exc)
                await log_exception(
                    "deployment", exc,
                    request_path=f"/api/admin/map/deployments/{deployment_id}",
                    request_method="PUT",
                    metadata={"action": "update_division", "deployment_id": deployment_id},
                )

    try:
        await log_audit(
            user_id=current_user["id"],
            action_type="deployment_update",
            resource_type="deployment",
            resource_id=deployment_id,
            before={"status": existing.get("status")},
            after={"status": data.status} if data.status else {},
        )
    except Exception as exc:
        logging.error("Failed to write audit log for deployment update: %s", exc)

    updated = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
    return updated


@router.delete("/admin/map/deployments/{deployment_id}")
async def delete_deployment(
    deployment_id: str,
    current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS)),
):
    existing = await db.deployments.find_one({"id": deployment_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deployment not found")

    # Archive deployment to history before permanent deletion
    try:
        await db.deployment_history.insert_one({
            **existing,
            "deleted_by": current_user["id"],
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logging.error("Failed to archive deployment %s to history: %s",
                      deployment_id, exc)

    # If this was the active deployment, reset division home before deletion
    div = await db.division_location.find_one({"id": "division_25id"}, {"_id": 0})
    if div and div.get("active_deployment_id") == deployment_id:
        try:
            await _reset_division_home(current_user["id"])
        except Exception as exc:
            logging.error("Failed to reset division home on delete (deployment %s): %s",
                          deployment_id, exc)
            await log_error(
                source="deployment",
                message=f"Division location reset failed during deployment deletion: {exc}",
                severity="warning",
                error_type=type(exc).__name__,
                request_path=f"/api/admin/map/deployments/{deployment_id}",
                request_method="DELETE",
                user_id=current_user.get("id"),
                metadata={"action": "reset_division_home", "deployment_id": deployment_id},
            )

    try:
        result = await db.deployments.delete_one({"id": deployment_id})
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=409,
                detail="Deployment was already deleted by another request",
            )
    except HTTPException:
        raise
    except Exception as exc:
        await log_exception(
            "deployment", exc,
            request_path=f"/api/admin/map/deployments/{deployment_id}",
            request_method="DELETE",
            user_id=current_user.get("id"),
            metadata={"action": "delete_deployment", "deployment_id": deployment_id},
        )
        raise HTTPException(status_code=500, detail=f"Failed to delete deployment: {exc}")

    try:
        await log_audit(
            user_id=current_user["id"],
            action_type="deployment_delete",
            resource_type="deployment",
            resource_id=deployment_id,
        )
    except Exception as exc:
        logging.error("Failed to write audit log for deployment delete: %s", exc)

    return {"message": "Deployment deleted"}


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
    current_user: dict = Depends(require_permission(Permission.MANAGE_DEPLOYMENTS)),
):
    update_dict = data.model_dump(exclude_unset=True)
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

async def _auto_advance_deployment_phases():
    """Auto-advance deployments through time-based phase transitions.

    - deploying → deployed  when started_at + total_duration_hours has passed.
    - rtb → completed       when return_started_at + return_duration_hours has passed.
    """
    now = datetime.now(timezone.utc)
    transitioning_deps = await db.deployments.find(
        {"status": {"$in": ["deploying", "rtb"]}, "is_active": True}, {"_id": 0}
    ).to_list(200)

    for dep in transitioning_deps:
        status = dep.get("status")
        if status == "deploying" and dep.get("started_at"):
            try:
                started = datetime.fromisoformat(dep["started_at"])
                duration = dep.get("total_duration_hours", 0)
                if now >= started + timedelta(hours=duration):
                    await db.deployments.update_one(
                        {"id": dep["id"]},
                        {"$set": {
                            "status": "deployed",
                            "updated_at": now.isoformat(),
                        }},
                    )
            except (ValueError, TypeError):
                pass
        elif status == "rtb" and dep.get("return_started_at"):
            try:
                ret_started = datetime.fromisoformat(dep["return_started_at"])
                ret_duration = dep.get("return_duration_hours", 0)
                if now >= ret_started + timedelta(hours=ret_duration):
                    await db.deployments.update_one(
                        {"id": dep["id"]},
                        {"$set": {
                            "status": "completed",
                            "is_active": False,
                            "updated_at": now.isoformat(),
                        }},
                    )
            except (ValueError, TypeError):
                pass

async def _update_division_for_deployment(dep: Deployment, user_id: str):
    """Update division location based on the deployment's last route point."""
    # Use the last route point as destination; fall back to HOME_STATION
    if dep.route_points:
        last_rp = max(dep.route_points, key=lambda rp: rp.order)
        loc_name = last_rp.name
        lat = last_rp.latitude
        lng = last_rp.longitude
    else:
        loc_name = HOME_STATION["name"]
        lat = HOME_STATION["latitude"]
        lng = HOME_STATION["longitude"]

    # This helper is only called for active deployments
    state = "deploying"

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
