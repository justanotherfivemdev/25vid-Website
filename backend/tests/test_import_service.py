import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from services.import_service import sanitize_import_user_fields, build_generated_import_email


def test_sanitize_import_user_fields_maps_personnel_log_fields():
    raw = {
        "username": "Ghost Actual",
        "discord_username": "Ghost",
        "rank": "SGT",
        "billet": "Squad Leader",
        "specialization": "Medic / RTO",
    }

    sanitized = sanitize_import_user_fields(raw)

    assert sanitized["username"] == "Ghost Actual"
    assert sanitized["discord_username"] == "Ghost"
    assert sanitized["rank"] == "SGT"
    assert sanitized["billet"] == "Squad Leader"
    assert sanitized["favorite_role"] == "Squad Leader"
    assert sanitized["specialization"] == "Medic / RTO"


def test_build_generated_import_email_uses_available_identifiers():
    generated = build_generated_import_email({
        "username": "Ghost Actual",
        "discord_username": "Ghost",
    })

    assert generated == "imported_ghost_actual@25thid.local"
