import os
import sys
from datetime import timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from routes.servers import _derive_troubleshooting
from services.server_config_generator import generate_reforger_config, normalize_server_config
from services.server_metrics_collector import _PERIOD_DELTAS


def test_normalize_server_config_upgrades_legacy_flat_shape():
    server = {
        "id": "srv-1",
        "name": "Alpha",
        "ports": {"game": 2001, "query": 17777, "rcon": 19999},
    }
    normalized = normalize_server_config(
        {
            "name": "Alpha Custom",
            "playerCountLimit": 80,
            "disableThirdPerson": True,
            "VONTransmitCrossFaction": False,
            "missionHeader": {"modes": ["Conflict"]},
        },
        server,
    )

    assert normalized["game"]["name"] == "Alpha Custom"
    assert normalized["game"]["playerCountLimit"] == 80
    assert normalized["game"]["gameProperties"]["disableThirdPerson"] is True
    assert normalized["game"]["gameProperties"]["VONTransmitCrossFaction"] is False
    assert normalized["game"]["missionHeader"] == {"modes": ["Conflict"]}


def test_generate_reforger_config_uses_nested_canonical_shape():
    server = {
        "id": "srv-2",
        "name": "Bravo",
        "ports": {"game": 2201, "query": 18888, "rcon": 21111},
        "environment": {"rcon_password": "secret"},
        "mods": [{"mod_id": "abc", "name": "Server Admin Tools"}],
        "config": {
            "game": {
                "name": "Bravo Live",
                "missionHeader": {"rotations": [1, 2]},
                "gameProperties": {
                    "disableThirdPerson": True,
                    "VONTransmitCrossFaction": False,
                },
            }
        },
    }

    generated = generate_reforger_config(server)

    assert generated["game"]["name"] == "Bravo Live"
    assert generated["game"]["missionHeader"] == {"rotations": [1, 2]}
    assert generated["game"]["gameProperties"]["disableThirdPerson"] is True
    assert generated["game"]["gameProperties"]["VONTransmitCrossFaction"] is False
    assert generated["gameHostBindPort"] == 2201
    assert generated["a2s"]["port"] == 18888
    assert generated["rcon"]["port"] == 21111


def test_derive_troubleshooting_prefers_runtime_mounts_for_cd_target():
    server = {
        "id": "srv-3",
        "container_name": "25vid-gs-srv3",
        "volumes": {"/srv/configs": "/app/server-configs"},
        "environment": {},
    }
    runtime = {
        "actual_container_name": "25vid-gs-srv3-real",
        "working_dir": "/game",
        "mounts": [
            {"source": "/mnt/reforger/configs", "destination": "/app/server-configs"},
            {"source": "/mnt/reforger/profiles", "destination": "/app/profiles"},
        ],
    }

    details = _derive_troubleshooting(server, runtime)

    assert details["actual_container_name"] == "25vid-gs-srv3-real"
    assert details["config_directory"] == "/mnt/reforger/configs/srv-3"
    assert details["profile_directory"] == "/mnt/reforger/profiles/srv-3"
    assert details["cd_target"] == "/mnt/reforger/profiles/srv-3"


def test_metrics_period_support_includes_30_days():
    assert _PERIOD_DELTAS["30d"] == timedelta(days=30)
