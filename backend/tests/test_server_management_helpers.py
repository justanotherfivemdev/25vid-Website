import os
import sys
from datetime import timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from routes.servers import _derive_troubleshooting
from services.server_config_generator import (
    format_mod_for_config,
    generate_reforger_config,
    mods_for_config,
    normalize_server_config,
)
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
    assert normalized["game"]["maxPlayers"] == 80
    assert normalized["game"]["gameProperties"]["disableThirdPerson"] is True
    assert normalized["game"]["gameProperties"]["VONCanTransmitCrossFaction"] is False
    assert normalized["game"]["gameProperties"]["missionHeader"] == {"modes": ["Conflict"]}
    assert "missionHeader" not in normalized["game"]  # must NOT be at game level


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
                "gameProperties": {
                    "disableThirdPerson": True,
                    "VONTransmitCrossFaction": False,
                    "missionHeader": {"rotations": [1, 2]},
                },
            }
        },
    }

    generated = generate_reforger_config(server)

    assert generated["game"]["name"] == "Bravo Live"
    assert generated["game"]["gameProperties"]["missionHeader"] == {"rotations": [1, 2]}
    assert "missionHeader" not in generated["game"]  # must NOT be at game level
    assert generated["game"]["gameProperties"]["disableThirdPerson"] is True
    assert generated["game"]["gameProperties"]["VONCanTransmitCrossFaction"] is False
    assert generated["bindPort"] == 2201
    assert generated["publicPort"] == 2201
    assert generated["a2s"]["port"] == 18888
    assert generated["rcon"]["port"] == 21111


def test_derive_troubleshooting_prefers_runtime_mounts_for_cd_target():
    server = {
        "id": "srv-3",
        "container_name": "reforger-srv-3",
        "volumes": {
            "/mnt/reforger/srv-3/Configs": "/reforger/Configs",
            "/mnt/reforger/srv-3/profile": "/home/profile",
        },
        "environment": {},
    }
    runtime = {
        "actual_container_name": "reforger-srv-3-real",
        "working_dir": "/reforger",
        "mounts": [
            {"source": "/mnt/reforger/srv-3/Configs", "destination": "/reforger/Configs"},
            {"source": "/mnt/reforger/srv-3/profile", "destination": "/home/profile"},
        ],
    }

    details = _derive_troubleshooting(server, runtime)

    assert details["actual_container_name"] == "reforger-srv-3-real"
    assert details["config_directory"] == "/mnt/reforger/srv-3/Configs"
    assert details["profile_directory"] == "/mnt/reforger/srv-3/profile"
    assert details["cd_target"] == "/mnt/reforger/srv-3/profile"


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
        _validate_mission_header({"game": {"gameProperties": {"missionHeader": "not-an-object"}}})

    with pytest.raises(Exception):
        _validate_mission_header({"game": {"gameProperties": {"missionHeader": [1, 2, 3]}}})

    # Also reject at legacy location
    with pytest.raises(Exception):
        _validate_mission_header({"game": {"missionHeader": "not-an-object"}})


def test_validate_mission_header_accepts_valid_dict():
    # Should not raise — canonical location
    _validate_mission_header({"game": {"gameProperties": {"missionHeader": {"modes": ["Conflict"]}}}})
    _validate_mission_header({"game": {"gameProperties": {"missionHeader": {}}}})
    # Should not raise — legacy location (still accepted for input)
    _validate_mission_header({"game": {"missionHeader": {"modes": ["Conflict"]}}})
    _validate_mission_header({"game": {"missionHeader": {}}})
    _validate_mission_header({})  # no missionHeader at all


# ── format_mod_for_config / mods_for_config tests ───────────────────


def test_format_mod_for_config_emits_only_valid_fields():
    """Only modId, name, and (when set) version should appear."""
    mod = {
        "modId": "59673B6FBB95459F",
        "name": "BetterTracers",
        "version": "1.0.5",
        "author": "SomeAuthor",
        "description": "A mod",
        "thumbnail_url": "https://example.com/img.jpg",
        "tags": ["WEAPON"],
        "metadata_source": "workshop",
    }
    result = format_mod_for_config(mod)
    assert result == {"modId": "59673B6FBB95459F", "name": "BetterTracers", "version": "1.0.5"}
    assert "author" not in result
    assert "description" not in result
    assert "thumbnail_url" not in result
    assert "tags" not in result
    assert "required" not in result


def test_format_mod_for_config_omits_empty_version():
    """An empty or blank version must not appear in the output."""
    assert "version" not in format_mod_for_config({"modId": "AAA", "name": "X", "version": ""})
    assert "version" not in format_mod_for_config({"modId": "AAA", "name": "X", "version": "  "})
    assert "version" not in format_mod_for_config({"modId": "AAA", "name": "X"})


def test_format_mod_for_config_omits_latest_version():
    """Version set to 'latest' (case-insensitive) must be omitted."""
    assert "version" not in format_mod_for_config({"modId": "AAA", "name": "X", "version": "latest"})
    assert "version" not in format_mod_for_config({"modId": "AAA", "name": "X", "version": "Latest"})
    assert "version" not in format_mod_for_config({"modId": "AAA", "name": "X", "version": "LATEST"})


def test_format_mod_for_config_empty_mod_returns_empty():
    """A mod entry without an id should produce an empty dict."""
    assert format_mod_for_config({}) == {}
    assert format_mod_for_config({"name": "NoId"}) == {}


def test_mods_for_config_strips_metadata():
    """mods_for_config should produce a clean list with no metadata fields."""
    mods = [
        {"modId": "59673B6FBB95459F", "name": "BetterTracers", "version": "1.0.5", "author": "Dev"},
        {"modId": "591AF5BDA9F7CE8B", "name": "Capture & Hold", "version": "", "description": "PvP"},
        {"modId": "5AAAC70D754245DD", "name": "Server Admin Tools"},
    ]
    result = mods_for_config(mods)
    assert len(result) == 3
    assert result[0] == {"modId": "59673B6FBB95459F", "name": "BetterTracers", "version": "1.0.5"}
    assert result[1] == {"modId": "591AF5BDA9F7CE8B", "name": "Capture & Hold"}  # no version
    assert result[2] == {"modId": "5AAAC70D754245DD", "name": "Server Admin Tools"}
    for entry in result:
        assert "author" not in entry
        assert "description" not in entry
        assert "required" not in entry


def test_mods_for_config_skips_empty_entries():
    """Entries that produce empty dicts (no mod_id) should be filtered out."""
    mods = [
        {"modId": "59673B6FBB95459F", "name": "BetterTracers"},
        {},
        {"name": "NoId"},
    ]
    result = mods_for_config(mods)
    assert len(result) == 1
    assert result[0]["modId"] == "59673B6FBB95459F"


def test_generate_reforger_config_mods_have_no_metadata():
    """The full config generation path should produce clean mod entries."""
    server = {
        "id": "srv-mod-test",
        "name": "Test",
        "ports": {"game": 2001, "query": 17777, "rcon": 19999},
        "mods": [
            {"mod_id": "59673B6FBB95459F", "name": "BetterTracers", "version": "1.0.5", "author": "Dev"},
            {"mod_id": "591AF5BDA9F7CE8B", "name": "Capture & Hold", "version": ""},
        ],
    }
    config = generate_reforger_config(server)
    for mod in config["game"]["mods"]:
        assert "modId" in mod
        assert "name" in mod
        assert "author" not in mod
        assert "required" not in mod
        assert "description" not in mod
    # Version should appear only for BetterTracers
    tracers = [m for m in config["game"]["mods"] if m["modId"] == "59673B6FBB95459F"][0]
    assert tracers["version"] == "1.0.5"
    capture = [m for m in config["game"]["mods"] if m["modId"] == "591AF5BDA9F7CE8B"][0]
    assert "version" not in capture
