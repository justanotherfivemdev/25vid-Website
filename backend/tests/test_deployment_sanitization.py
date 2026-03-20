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
        "route_points": [
            {
                "plane.spoof": {
                    "$type": "C-17",
                    "callsign": "RCH123",
                },
                "order": 0,
                "name": "Ramstein",
                "latitude": 49.4369,
                "longitude": 7.6003,
            }
        ]
    }

    sanitized = sanitize_mongo_payload(payload)

    route_point = sanitized["route_points"][0]
    assert "plane_spoof" in route_point
    assert "plane.spoof" not in route_point
    assert "_type" in route_point["plane_spoof"]
    assert "$type" not in route_point["plane_spoof"]


def test_error_log_body_sanitizes_mongo_unsafe_keys_and_sensitive_values():
    body = {
        "plane.spoof": {"$type": "C-17"},
        "authorization": "top-secret",
    }

    sanitized = _sanitise_body(body)

    assert sanitized["plane_spoof"]["_type"] == "C-17"
    assert sanitized["authorization"] == "***"
