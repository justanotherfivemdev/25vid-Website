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


# ── _parse_players_response tests ────────────────────────────────────

from routes.servers import _parse_players_response


def test_parse_players_response_pipe_separated():
    raw = (
        "Players on server:\n"
        "---\n"
        "Name | Ping\n"
        "1 | SomePlayer | 42ms\n"
        "2 | AnotherOne | 120ms\n"
    )
    result = _parse_players_response(raw)
    assert len(result) == 2
    assert result[0]["name"] == "SomePlayer"
    assert result[0]["ping"] == 42
    assert result[1]["name"] == "AnotherOne"
    assert result[1]["ping"] == 120


def test_parse_players_response_empty_and_header_only():
    assert _parse_players_response("") == []
    assert _parse_players_response("Players on server:\n---\n") == []
    assert _parse_players_response(None) == []


def test_parse_players_response_number_prefix_format():
    raw = "1. PlayerAlpha\n2. PlayerBravo\n"
    result = _parse_players_response(raw)
    assert len(result) == 2
    assert result[0]["name"] == "PlayerAlpha"
    assert result[1]["name"] == "PlayerBravo"


# ── normalize idempotency test ───────────────────────────────────────


def test_normalize_server_config_is_idempotent():
    """Normalizing an already-normalized config should produce the same result."""
    server = {
        "id": "srv-4",
        "name": "Charlie",
        "ports": {"game": 2001, "query": 17777, "rcon": 19999},
    }
    first_pass = normalize_server_config(
        {"game": {"name": "Charlie Custom", "playerCountLimit": 40}},
        server,
    )
    second_pass = normalize_server_config(first_pass, server)
    assert first_pass == second_pass


# ── mission header validation test ───────────────────────────────────

from routes.servers import _validate_mission_header
import pytest


def test_validate_mission_header_rejects_non_object():
    with pytest.raises(Exception):
        _validate_mission_header({"game": {"missionHeader": "not-an-object"}})

    with pytest.raises(Exception):
        _validate_mission_header({"game": {"missionHeader": [1, 2, 3]}})


def test_validate_mission_header_accepts_valid_dict():
    # Should not raise
    _validate_mission_header({"game": {"missionHeader": {"modes": ["Conflict"]}}})
    _validate_mission_header({"game": {"missionHeader": {}}})
    _validate_mission_header({})  # no missionHeader at all
