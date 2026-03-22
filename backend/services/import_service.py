import uuid
import secrets
import re
from datetime import datetime, timezone
from typing import Dict, Any

from config import pwd_context, IMPORT_EMAIL_ADAPTER
from database import db
from models.user import User
from services.auth_service import normalize_email
from google_sheets_import import split_permissions


def validate_import_email(raw_email: str) -> str:
    try:
        validated = IMPORT_EMAIL_ADAPTER.validate_python(raw_email)
    except Exception as exc:
        raise ValueError(f"Invalid email '{raw_email}'") from exc
    return normalize_email(str(validated))


def sanitize_import_user_fields(raw: Dict[str, str]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}

    if raw.get("username"):
        payload["username"] = raw["username"]
    if raw.get("email"):
        payload["email"] = validate_import_email(raw["email"])
    if raw.get("discord_id"):
        payload["discord_id"] = raw["discord_id"]
    if raw.get("discord_username"):
        payload["discord_username"] = raw["discord_username"]
    if raw.get("rank"):
        payload["rank"] = raw["rank"]
    if raw.get("role"):
        payload["role"] = raw["role"].lower()
    if raw.get("billet"):
        payload["billet"] = raw["billet"]
        payload.setdefault("favorite_role", raw["billet"])
    if raw.get("favorite_role"):
        payload["favorite_role"] = raw["favorite_role"]
    if raw.get("specialization"):
        payload["specialization"] = raw["specialization"]
    if raw.get("permissions"):
        payload["permissions"] = split_permissions(raw["permissions"])
    if raw.get("unit"):
        payload["unit"] = raw["unit"]
        payload.setdefault("company", raw["unit"])
    if raw.get("status"):
        payload["status"] = raw["status"].lower()

    return payload


def build_generated_import_email(update_fields: Dict[str, Any]) -> str:
    if update_fields.get("email"):
        return update_fields["email"]

    raw_identifier = (
        update_fields.get("discord_id")
        or update_fields.get("username")
        or update_fields.get("discord_username")
        or f"prereg-{uuid.uuid4()}"
    )
    safe_identifier = re.sub(r"[^a-z0-9]+", "_", str(raw_identifier).strip().lower()).strip("_")
    if not safe_identifier:
        safe_identifier = f"prereg_{uuid.uuid4().hex[:8]}"
    return f"imported_{safe_identifier}@25thid.local"


async def upsert_user_from_import(mapped_fields: Dict[str, str]) -> tuple:
    update_fields = sanitize_import_user_fields(mapped_fields)
    email = update_fields.get("email")
    discord_id = update_fields.get("discord_id")
    username = update_fields.get("username")
    discord_username = update_fields.get("discord_username")

    existing_records = []

    if email:
        found = await db.users.find_one({"email": email}, {"_id": 0})
        if found:
            existing_records.append(found)
    if discord_id:
        found = await db.users.find_one({"discord_id": discord_id}, {"_id": 0})
        if found:
            existing_records.append(found)
    if username:
        found = await db.users.find_one({"username": username}, {"_id": 0})
        if found:
            existing_records.append(found)
    if discord_username:
        found = await db.users.find_one({"discord_username": discord_username}, {"_id": 0})
        if found:
            existing_records.append(found)

    unique_existing = {record["id"]: record for record in existing_records}
    if len(unique_existing) > 1:
        raise ValueError(
            "Conflicting identifiers: the imported fields match multiple existing accounts"
        )

    existing = next(iter(unique_existing.values()), None)

    if existing:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": existing["id"]}, {"$set": update_fields})
        return "updated", (
            existing.get("email")
            or existing.get("discord_id")
            or existing.get("username")
            or existing.get("discord_username")
            or existing.get("id")
        )

    generated_email = build_generated_import_email(update_fields)
    generated_username = (
        update_fields.get("username")
        or update_fields.get("discord_username")
        or f"PreReg_{str(uuid.uuid4())[:8]}"
    )

    new_user = User(
        email=generated_email,
        username=generated_username,
        password_hash=pwd_context.hash(secrets.token_urlsafe(32)),
        role=update_fields.get("role", "member"),
        rank=update_fields.get("rank"),
        specialization=update_fields.get("specialization"),
        status=update_fields.get("status", "recruit"),
        favorite_role=update_fields.get("favorite_role"),
        discord_id=update_fields.get("discord_id"),
        discord_username=update_fields.get("discord_username"),
        discord_linked=bool(update_fields.get("discord_id")),
        pre_registered=True,
        permissions=update_fields.get("permissions", []),
        unit=update_fields.get("unit"),
        company=update_fields.get("company"),
        billet=update_fields.get("billet"),
        is_active=False,
    )

    doc = new_user.model_dump()
    doc["join_date"] = doc["join_date"].isoformat()
    await db.users.insert_one(doc)
    return "created", generated_email
