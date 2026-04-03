import os
import sys
from datetime import timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from routes.servers import _build_log_entries, _derive_troubleshooting, _normalize_server_contract, _parse_log_since
from services.server_config_generator import (
    _normalize_navmesh_streaming,
    _sanitize_operating,
    attempt_auto_recovery,
    format_mod_for_config,
    generate_reforger_config,
    mods_for_config,
    normalize_server_config,
)
from services.docker_agent import _normalize_host_cpu_percent
from services.reforger_orchestrator import ProvisioningResult, StageResult, extract_config_errors
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


# ── disableNavmeshStreaming normalization tests ──────────────────────


def test_normalize_navmesh_streaming_legacy_true_becomes_empty_array():
    """Legacy ``True`` must be converted to ``[]`` (disable all streaming)."""
    assert _normalize_navmesh_streaming(True) == []


def test_normalize_navmesh_streaming_legacy_false_becomes_none():
    """Legacy ``False`` must be omitted (None = streaming stays enabled)."""
    assert _normalize_navmesh_streaming(False) is None
    assert _normalize_navmesh_streaming(None) is None


def test_normalize_navmesh_streaming_preserves_array():
    """An array value should be kept as-is."""
    assert _normalize_navmesh_streaming([]) == []
    assert _normalize_navmesh_streaming(["Soldier"]) == ["Soldier"]


def test_normalize_navmesh_streaming_tuple_converts_to_list():
    """Tuples should be normalised to lists."""
    assert _normalize_navmesh_streaming(("Soldier",)) == ["Soldier"]


def test_generated_config_omits_navmesh_by_default():
    """Default config should NOT contain disableNavmeshStreaming."""
    server = {"id": "srv-nm", "name": "NM", "ports": {"game": 2001, "query": 17777, "rcon": 19999}}
    config = generate_reforger_config(server)
    assert "disableNavmeshStreaming" not in config.get("operating", {})


def test_generated_config_legacy_true_produces_array():
    """A legacy boolean True in the config should produce an array in output."""
    server = {
        "id": "srv-nm2", "name": "NM2",
        "ports": {"game": 2001, "query": 17777, "rcon": 19999},
        "config": {"operating": {"disableNavmeshStreaming": True}},
    }
    config = generate_reforger_config(server)
    assert config["operating"]["disableNavmeshStreaming"] == []


def test_normalize_config_navmesh_is_idempotent():
    """Normalizing with disableNavmeshStreaming=True twice should be stable."""
    server = {"id": "srv-nm3", "name": "NM3", "ports": {"game": 2001, "query": 17777, "rcon": 19999}}
    first = normalize_server_config({"operating": {"disableNavmeshStreaming": True}}, server)
    second = normalize_server_config(first, server)
    assert first == second


# ── _sanitize_operating tests ────────────────────────────────────────


def test_sanitize_operating_drops_unknown_keys():
    """Unknown keys must be stripped."""
    result = _sanitize_operating({"unknownField": True, "lobbyPlayerSynchronise": True})
    assert "unknownField" not in result
    assert result["lobbyPlayerSynchronise"] is True


def test_sanitize_operating_drops_wrong_types():
    """Values with incorrect types must be stripped."""
    result = _sanitize_operating({"lobbyPlayerSynchronise": "yes", "playerSaveTime": "fast"})
    assert "lobbyPlayerSynchronise" not in result
    assert "playerSaveTime" not in result


def test_sanitize_operating_rejects_bool_for_int_fields():
    """Booleans must be rejected for integer-typed keys (bool is subclass of int)."""
    result = _sanitize_operating({"playerSaveTime": True, "aiLimit": False})
    assert "playerSaveTime" not in result
    assert "aiLimit" not in result


def test_sanitize_operating_accepts_valid_int_fields():
    """Proper int values must be accepted."""
    result = _sanitize_operating({"playerSaveTime": 120, "aiLimit": -1})
    assert result["playerSaveTime"] == 120
    assert result["aiLimit"] == -1


def test_sanitize_operating_coerces_legacy_navmesh_bool():
    """Legacy boolean disableNavmeshStreaming must be coerced to array."""
    result = _sanitize_operating({"disableNavmeshStreaming": True})
    assert result["disableNavmeshStreaming"] == []
    # False → omit
    result2 = _sanitize_operating({"disableNavmeshStreaming": False})
    assert "disableNavmeshStreaming" not in result2


# ── auto-recovery tests ──────────────────────────────────────────────


def test_auto_recovery_fixes_type_mismatch():
    """Auto-recovery should fix a type-mismatch error in the config."""
    server = {
        "id": "srv-ar", "name": "AR",
        "ports": {"game": 2001, "query": 17777, "rcon": 19999},
        "config": {"operating": {"disableNavmeshStreaming": True}},
    }
    error_msg = 'Param "#/operating/disableNavmeshStreaming" has an incorrect type. Expected "array", but the value is "boolean"'
    recovered, descs = attempt_auto_recovery(server, error_msg)
    assert recovered is True
    assert len(descs) >= 1
    # After recovery, the config should have an array
    assert isinstance(server["config"]["operating"]["disableNavmeshStreaming"], list)


def test_auto_recovery_returns_false_for_unknown_errors():
    """Auto-recovery should return False for errors it can't fix."""
    server = {
        "id": "srv-ar2", "name": "AR2",
        "ports": {"game": 2001, "query": 17777, "rcon": 19999},
        "config": {},
    }
    recovered, descs = attempt_auto_recovery(server, "Some random engine error")
    assert recovered is False
    assert descs == []


# ── extract_config_errors tests ──────────────────────────────────────


def test_extract_config_errors_finds_type_errors():
    """Should detect type-mismatch error lines in container logs."""
    logs = (
        '2026-04-03T08:04:25.647Z BACKEND (E): Param "#/operating/disableNavmeshStreaming" has an incorrect type. Expected "array", but the value is "boolean"\n'
        '2026-04-03T08:04:25.647Z BACKEND (E): JSON is invalid!\n'
        '2026-04-03T08:04:25.647Z BACKEND (E): There are errors in server config!\n'
        '2026-04-03T08:04:25.647Z ENGINE : Normal log line\n'
    )
    errors = extract_config_errors(logs)
    assert len(errors) == 3
    assert any("incorrect type" in e for e in errors)
    assert any("JSON is invalid" in e for e in errors)
    assert any("errors in server config" in e for e in errors)


def test_extract_config_errors_returns_empty_for_clean_logs():
    """Clean logs should produce no config errors."""
    assert extract_config_errors("") == []
    assert extract_config_errors("Game started\nScenario loaded\n") == []


def test_normalize_server_contract_upgrades_legacy_partial_status():
    server = {
        "status": "provisioning_partial",
        "readiness_state": "ready",
        "provisioning_stages": {
            "sat_discovery": {"name": "sat_discovery", "status": "failed", "error": "missing config"},
        },
    }
    normalized = _normalize_server_contract(server)
    assert normalized["status"] == "running"
    assert normalized["provisioning_state"] == "ready"
    assert normalized["readiness_state"] == "degraded"
    assert normalized["provisioning_warnings"][0]["stage"] == "sat_discovery"


def test_provisioning_result_reports_running_when_container_started():
    result = ProvisioningResult(
        stages=[
            StageResult(name="container_creation", status="success"),
            StageResult(name="initial_startup", status="success"),
            StageResult(name="sat_discovery", status="failed"),
        ]
    )
    assert result.container_started is True
    assert result.overall_status == "running"
    assert result.readiness_state == "degraded"
    assert "follow-up stages need attention" in result.summary_message


def test_log_helpers_build_structured_entries_and_parse_since():
    logs = "2026-04-03T10:00:00Z Engine ready\n2026-04-03T10:00:05Z Scenario loaded"
    entries = _build_log_entries(logs)
    assert len(entries) == 2
    assert entries[0]["timestamp"] == "2026-04-03T10:00:00Z"
    assert entries[0]["line"] == "Engine ready"
    assert _parse_log_since("2026-04-03T10:00:05Z") == 1775210405
    assert _parse_log_since("1775210405") == 1775210405


def test_cpu_normalization_scales_multicore_usage_to_host_percent():
    assert _normalize_host_cpu_percent(250.0, 4) == 62.5
