import os
from pathlib import Path
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_SECRET", "test-secret")

sys.path.append(str(Path(__file__).resolve().parents[1]))

from services.mongo_sanitize import sanitize_mongo_payload
from services.error_log_service import _sanitise_body


def test_deployment_payload_sanitizes_mongo_unsafe_keys():
    payload = {
        "waypoints": [
            {
                "plane.spoof": {
                    "$type": "C-17",
                    "callsign": "RCH123",
                },
                "name": "Ramstein",
            }
        ]
    }

    sanitized = sanitize_mongo_payload(payload)

    waypoint = sanitized["waypoints"][0]
    assert "plane_spoof" in waypoint
    assert "plane.spoof" not in waypoint
    assert "_type" in waypoint["plane_spoof"]
    assert "$type" not in waypoint["plane_spoof"]


def test_error_log_body_sanitizes_mongo_unsafe_keys_and_sensitive_values():
    body = {
        "plane.spoof": {"$type": "C-17"},
        "authorization": "top-secret",
    }

    sanitized = _sanitise_body(body)

    assert sanitized["plane_spoof"]["_type"] == "C-17"
    assert sanitized["authorization"] == "***"
