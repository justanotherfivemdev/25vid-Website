import logging
from datetime import datetime, timezone

from database import db

valyu_logger = logging.getLogger("valyu")


async def upsert_map_event(entity_type: str, entity: dict, entity_id: str):
    """Create or update a map_event when an operation, intel, or campaign is created/updated."""
    lat = entity.get("lat") or entity.get("latitude")
    lng = entity.get("lng") or entity.get("longitude")

    if lat is None or lng is None:
        return

    title = entity.get("title") or entity.get("name") or "Untitled"
    description = entity.get("description") or entity.get("content", "")
    if len(description) > 500:
        description = description[:500]

    threat_level = entity.get("severity") or entity.get("threat_level") or "medium"
    source = "internal"
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "id": f"me_{entity_type}_{entity_id}",
        "type": entity_type,
        "title": title,
        "description": description,
        "latitude": float(lat),
        "longitude": float(lng),
        "threat_level": threat_level,
        "source": source,
        "origin_type": entity.get("origin_type", "25id"),
        "origin_unit_id": entity.get("origin_unit_id", ""),
        "origin_unit_name": entity.get("origin_unit_name", "25th Infantry Division"),
        "related_entity_id": entity_id,
        "updated_at": now,
        "metadata": {
            "entity_type": entity_type,
            "status": entity.get("status") or entity.get("activity_state") or entity.get("classification", ""),
            "campaign_id": entity.get("campaign_id", ""),
            "operation_type": entity.get("operation_type", ""),
            "category": entity.get("category", ""),
        },
    }

    await db.map_events.update_one(
        {"id": doc["id"]},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


async def remove_map_event(entity_type: str, entity_id: str):
    """Remove map_event when entity is deleted."""
    await db.map_events.delete_one({"id": f"me_{entity_type}_{entity_id}"})


async def backfill_map_events():
    """Backfill map_events from existing operations, intel, campaigns on startup."""
    existing_types = set()
    async for doc in db.map_events.find({}, {"type": 1, "_id": 0}):
        existing_types.add(doc.get("type"))

    valyu_logger.info(f"Backfilling map_events – existing types: {existing_types}")

    if "operation" not in existing_types:
        ops = await db.operations.find({}, {"_id": 0}).to_list(2000)
        for op in ops:
            await upsert_map_event("operation", op, op.get("id", ""))

    if "intel" not in existing_types:
        intels = await db.intel_briefings.find({}, {"_id": 0}).to_list(1000)
        for intel in intels:
            await upsert_map_event("intel", intel, intel.get("id", ""))

    if "campaign" not in existing_types:
        campaigns = await db.campaigns.find({}, {"_id": 0}).to_list(200)
        for camp in campaigns:
            camp_lat = camp.get("lat") or camp.get("latitude")
            camp_lng = camp.get("lng") or camp.get("longitude")
            if camp_lat and camp_lng:
                await upsert_map_event("campaign", camp, camp.get("id", ""))
            for obj in camp.get("objectives", []):
                if obj.get("lat") and obj.get("lng"):
                    obj_data = {**obj, "name": obj.get("name", "Objective"), "campaign_id": camp.get("id", "")}
                    await upsert_map_event("campaign", obj_data, obj.get("id", ""))

    valyu_logger.info("Map events backfill complete")
