import uuid
import secrets
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
    if raw.get("permissions"):
        payload["permissions"] = split_permissions(raw["permissions"])
    if raw.get("unit"):
        payload["unit"] = raw["unit"]
        payload.setdefault("company", raw["unit"])
    if raw.get("status"):
        payload["status"] = raw["status"].lower()

    return payload


async def upsert_user_from_import(mapped_fields: Dict[str, str]) -> tuple:
    update_fields = sanitize_import_user_fields(mapped_fields)
    email = update_fields.get("email")
    discord_id = update_fields.get("discord_id")

    existing_by_email = None
    existing_by_discord = None

    if email:
        existing_by_email = await db.users.find_one({"email": email}, {"_id": 0})
    if discord_id:
        existing_by_discord = await db.users.find_one({"discord_id": discord_id}, {"_id": 0})

    if existing_by_email and existing_by_discord and existing_by_email["id"] != existing_by_discord["id"]:
        raise ValueError(
            "Conflicting identifiers: provided email and discord_id belong to different existing accounts"
        )

    existing = existing_by_email or existing_by_discord

    if existing:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": existing["id"]}, {"$set": update_fields})
        return "updated", existing.get("email") or existing.get("discord_id") or existing.get("id")

    if email and not discord_id:
        return "skipped_missing_discord", email

    generated_email = email or f"imported_discord_{discord_id}@25thid.local"
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
        status=update_fields.get("status", "recruit"),
        discord_id=update_fields.get("discord_id"),
        discord_username=update_fields.get("discord_username"),
        discord_linked=bool(update_fields.get("discord_id")),
        pre_registered=True,
        permissions=update_fields.get("permissions", []),
        unit=update_fields.get("unit"),
        company=update_fields.get("company"),
        is_active=False,
    )

    doc = new_user.model_dump()
    doc["join_date"] = doc["join_date"].isoformat()
    await db.users.insert_one(doc)
    return "created", generated_email
