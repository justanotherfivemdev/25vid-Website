import os
import sys
import asyncio
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

import routes.servers as server_routes
from routes.servers import _build_log_entries, _derive_troubleshooting, _normalize_server_contract, _parse_log_line, _parse_log_since, _reject_ws, _resolve_server_root, _safe_resolve, _stable_hash, _validate_player_id
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
import services.reforger_orchestrator as reforger_orchestrator
from services.reforger_orchestrator import build_container_environment
from services.sat_config_service import normalize_sat_config
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
    """Only valid Reforger mod fields should appear."""
    mod = {
        "modId": "59673B6FBB95459F",
        "name": "BetterTracers",
        "version": "1.0.5",
        "required": False,
        "author": "SomeAuthor",
        "description": "A mod",
        "thumbnail_url": "https://example.com/img.jpg",
        "tags": ["WEAPON"],
        "metadata_source": "workshop",
    }
    result = format_mod_for_config(mod)
    assert result == {"modId": "59673B6FBB95459F", "name": "BetterTracers", "version": "1.0.5", "required": False}
    assert "author" not in result
    assert "description" not in result
    assert "thumbnail_url" not in result
    assert "tags" not in result


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
    """mods_for_config should preserve valid mod flags while stripping metadata."""
    mods = [
        {"modId": "59673B6FBB95459F", "name": "BetterTracers", "version": "1.0.5", "author": "Dev"},
        {"modId": "591AF5BDA9F7CE8B", "name": "Capture & Hold", "version": "", "description": "PvP", "required": False},
        {"modId": "5AAAC70D754245DD", "name": "Server Admin Tools"},
    ]
    result = mods_for_config(mods)
    assert len(result) == 3
    assert result[0] == {"modId": "59673B6FBB95459F", "name": "BetterTracers", "version": "1.0.5"}
    assert result[1] == {"modId": "591AF5BDA9F7CE8B", "name": "Capture & Hold", "required": False}  # no version
    assert result[2] == {"modId": "5AAAC70D754245DD", "name": "Server Admin Tools"}
    for entry in result:
        assert "author" not in entry
        assert "description" not in entry


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
    """The full config generation path should preserve valid mod flags and strip metadata."""
    server = {
        "id": "srv-mod-test",
        "name": "Test",
        "ports": {"game": 2001, "query": 17777, "rcon": 19999},
        "mods": [
            {"mod_id": "59673B6FBB95459F", "name": "BetterTracers", "version": "1.0.5", "author": "Dev"},
            {"mod_id": "591AF5BDA9F7CE8B", "name": "Capture & Hold", "version": "", "required": False},
        ],
    }
    config = generate_reforger_config(server)
    for mod in config["game"]["mods"]:
        assert "modId" in mod
        assert "name" in mod
        assert "author" not in mod
        assert "description" not in mod
    # Version should appear only for BetterTracers
    tracers = [m for m in config["game"]["mods"] if m["modId"] == "59673B6FBB95459F"][0]
    assert tracers["version"] == "1.0.5"
    capture = [m for m in config["game"]["mods"] if m["modId"] == "591AF5BDA9F7CE8B"][0]
    assert "version" not in capture
    assert capture["required"] is False


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
    assert normalized["provisioning_state"] == "warning"
    assert normalized["readiness_state"] == "ready"
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
    assert entries[0]["source"] == "docker"
    assert _parse_log_since("2026-04-03T10:00:05Z") == 1775210405
    assert _parse_log_since("1775210405") == 1775210405


def test_parse_log_since_handles_docker_nanosecond_timestamps():
    """Docker returns RFC 3339 Nano (9 frac digits); fromisoformat only handles 6."""
    nano_ts = "2026-04-03T10:00:05.123456789Z"
    result = _parse_log_since(nano_ts)
    assert result == 1775210405, f"Expected 1775210405, got {result}"


def test_reject_ws_accepts_before_closing():
    class FakeWebSocket:
        def __init__(self):
            self.accept_calls = 0
            self.closed = []

        async def accept(self):
            self.accept_calls += 1

        async def close(self, code: int, reason: str):
            self.closed.append((code, reason))

    websocket = FakeWebSocket()

    asyncio.run(_reject_ws(websocket, 4001, "Authentication required"))

    assert websocket.accept_calls == 1
    assert websocket.closed == [(4001, "Authentication required")]


def test_parse_log_line_rejects_non_iso_first_token():
    """Lines whose first word is not an ISO timestamp must NOT be split."""
    entry = _parse_log_line("Traceback (most recent call last)", 0)
    # The full raw line should be in 'line', not just the suffix
    assert entry["line"] == "Traceback (most recent call last)"
    assert entry["raw"] == "Traceback (most recent call last)"


def test_parse_log_line_accepts_docker_iso_timestamp():
    """Lines prefixed with an ISO timestamp should be split correctly."""
    entry = _parse_log_line("2026-04-03T10:00:00.000000000Z Engine started", 0)
    assert entry["timestamp"] == "2026-04-03T10:00:00.000000000Z"
    assert entry["line"] == "Engine started"


def test_log_cursor_is_stable_across_calls():
    """Log cursors must not change between calls (no process-salted hash)."""
    entry_a = _parse_log_line("2026-04-03T10:00:00Z Engine ready", 0)
    entry_b = _parse_log_line("2026-04-03T10:00:00Z Engine ready", 0)
    assert entry_a["cursor"] == entry_b["cursor"], "cursor changed between calls"
    # Stable hash is an 8-char hex string
    raw_hash = _stable_hash("hello")
    assert len(raw_hash) == 8
    assert all(ch in "0123456789abcdef" for ch in raw_hash)


def test_prepare_server_deployment_marks_server_created(monkeypatch):
    server = {
        "id": "srv-prep",
        "name": "Prep",
        "ports": {"game": 2001, "query": 17777, "rcon": 19999},
        "log_stats_enabled": True,
        "max_fps": 120,
        "startup_parameters": [],
    }

    async def fake_ensure_filesystem(_server):
        return None

    async def fake_write_config_file(_server):
        return True, "C:/reforger/srv-prep/Configs/server-config.json"

    async def fake_ensure_container(_server):
        return {
            "container_id": "container-123",
            "environment": {"ARMA_CONFIG": "server-config.json"},
            "volumes": {"C:/reforger/srv-prep/profile": "/home/profile"},
            "last_known_container_status": "created",
        }

    monkeypatch.setattr(reforger_orchestrator, "ensure_filesystem", fake_ensure_filesystem)
    monkeypatch.setattr(reforger_orchestrator, "write_config_file", fake_write_config_file)
    monkeypatch.setattr(reforger_orchestrator, "ensure_container", fake_ensure_container)

    updates = asyncio.run(reforger_orchestrator.prepare_server_deployment(server))

    assert updates["deployment_state"] == "created"
    assert updates["status"] == "created"
    assert updates["provisioning_state"] == "queued"
    assert updates["summary_message"].startswith("Server container created successfully")
    assert updates["provisioning_stages"]["container_creation"]["status"] == "success"


def test_player_id_validation_rejects_whitespace_and_control_chars():
    import pytest
    # Valid IDs
    _validate_player_id("76561198012345678")
    _validate_player_id("ABCDEF1234567890")
    _validate_player_id("player-abc.123_xyz")
    # Invalid IDs
    with pytest.raises(ValueError):
        _validate_player_id("")
    with pytest.raises(ValueError):
        _validate_player_id("player id with spaces")
    with pytest.raises(ValueError):
        _validate_player_id("player\nid")
    with pytest.raises(ValueError):
        _validate_player_id("player\x00id")
    with pytest.raises(ValueError):
        # Too long (> 128 chars)
        _validate_player_id("A" * 129)


def test_cpu_normalization_scales_multicore_usage_to_host_percent():
    assert _normalize_host_cpu_percent(250.0, 4) == 62.5


def test_normalize_sat_config_dedupes_admins_bans_and_messages():
    normalized = normalize_sat_config({
        "admins": [
            {"id": "d87d3925-7da4-4497-89bd-2b5b6e5aa770", "name": "Insane"},
            {"playerId": "d87d3925-7da4-4497-89bd-2b5b6e5aa770", "label": "Insane Updated"},
            {"guid": "e9c8eca4-40ca-4bea-895c-184b4e6fa320", "name": "LtLast"},
        ],
        "bans": [
            {"playerId": "00000000-0000-0000-0000-000000000002", "reason": "First reason"},
            {"id": "00000000-0000-0000-0000-000000000002", "reason": "Replacement reason"},
            "00000000-0000-0000-0000-000000000003",
        ],
        "serverMessage": [
            "Alpha",
            "Alpha",
            " Bravo ",
            "",
        ],
        "eventsApiEventsEnabled": "event_a\nevent_b\nevent_a\n",
    })

    assert normalized["admins"] == {
        "d87d3925-7da4-4497-89bd-2b5b6e5aa770": "Insane Updated",
        "e9c8eca4-40ca-4bea-895c-184b4e6fa320": "LtLast",
    }
    assert normalized["bans"] == {
        "00000000-0000-0000-0000-000000000002": "Replacement reason",
        "00000000-0000-0000-0000-000000000003": "",
    }
    assert normalized["serverMessage"] == ["Alpha", "Bravo"]
    assert normalized["eventsApiEventsEnabled"] == ["event_a", "event_b"]


def test_normalize_sat_config_dedupes_message_objects_by_payload():
    normalized = normalize_sat_config({
        "repeatedChatMessages": [
            {"message": " Status check ", "intervalMinutes": 15},
            {"message": "Status check", "intervalMinutes": 15},
            {"message": "", "intervalMinutes": 30},
        ],
        "scheduledChatMessages": [
            {"message": "Server restart soon", "hour": 22, "minute": 0},
            {"message": "Server restart soon", "hour": 22, "minute": 0},
            {"message": "Other message", "hour": 23, "minute": 30},
        ],
    })

    assert normalized["repeatedChatMessages"] == [
        {"message": "Status check", "intervalMinutes": 15},
    ]
    assert normalized["scheduledChatMessages"] == [
        {"message": "Server restart soon", "hour": 22, "minute": 0},
        {"message": "Other message", "hour": 23, "minute": 30},
    ]


def test_build_container_environment_includes_rcon_port():
    """Container env should expose RCON_PORT matching the server's allocated port."""
    server = {
        "id": "srv-rcon-port",
        "name": "RCON Port Test",
        "ports": {"game": 2011, "query": 17787, "rcon": 20009},
        "config": {
            "rcon": {"password": "testpass", "permission": "admin"},
            "game": {"scenarioId": "{ECC61978EDCC2B5A}Missions/23_campaign.conf"},
        },
        "mods": [],
        "max_fps": 60,
        "startup_parameters": [],
    }
    env = build_container_environment(server)
    assert env["RCON_PORT"] == "20009"
    assert env["RCON_PASSWORD"] == "testpass"
    assert env["RCON_PERMISSION"] == "admin"


def test_build_container_environment_rcon_port_uses_default_when_missing():
    """When no RCON port is configured, RCON_PORT env should default to 19999."""
    server = {
        "id": "srv-rcon-default",
        "name": "Default RCON",
        "ports": {"game": 2001, "query": 17777},
        "config": {
            "game": {"scenarioId": "{ECC61978EDCC2B5A}Missions/23_campaign.conf"},
        },
        "mods": [],
        "max_fps": 120,
        "startup_parameters": [],
    }
    env = build_container_environment(server)
    assert env["RCON_PORT"] == "19999"


class _FakeManagedServersCollection:
    def __init__(self, server):
        self.server = server

    async def find_one(self, query, projection=None):
        if not self.server or query.get("id") != self.server.get("id"):
            return None
        return self.server


def _file_manager_server(tmp_path, server_id="srv-files", stale_config=False):
    config_root = tmp_path / "configs"
    profile_root = tmp_path / "profiles"
    workshop_root = tmp_path / "workshop"
    config_dir = config_root / server_id
    profile_dir = profile_root / server_id
    workshop_dir = workshop_root / server_id

    config_dir.mkdir(parents=True)
    profile_dir.mkdir(parents=True)
    workshop_dir.mkdir(parents=True)

    config_file = config_dir / "server.json"
    config_file.write_text('{"name":"Test"}', encoding="utf-8")
    (profile_dir / "mod-config.json").write_text('{"enabled":true}', encoding="utf-8")
    (workshop_dir / "readme.txt").write_text("hello", encoding="utf-8")

    if stale_config:
        config_path = (tmp_path / "stale" / "Configs" / "server.json").as_posix()
    else:
        config_path = config_file.as_posix()

    return {
        "id": server_id,
        "config_path": config_path,
        "profile_path": "",
        "workshop_path": "",
        "volumes": {
            config_root.as_posix(): "/reforger/Configs",
            profile_root.as_posix(): "/home/profile",
            workshop_root.as_posix(): "/reforger/workshop",
        },
    }, {
        "config_dir": config_dir,
        "profile_dir": profile_dir,
        "workshop_dir": workshop_dir,
    }


def test_safe_resolve_allows_root_only_when_requested(tmp_path):
    base = tmp_path / "root"
    base.mkdir()

    assert _safe_resolve(base.as_posix(), "", allow_root=True) == base.resolve()

    with pytest.raises(server_routes.HTTPException, match="Path is required"):
        _safe_resolve(base.as_posix(), "")

    with pytest.raises(server_routes.HTTPException, match="Path traversal is not allowed"):
        _safe_resolve(base.as_posix(), "../outside", allow_root=True)


def test_resolve_server_root_falls_back_to_server_scoped_paths(tmp_path):
    server, paths = _file_manager_server(tmp_path)
    server["config_path"] = ""

    assert Path(_resolve_server_root(server, "config")) == paths["config_dir"]
    assert Path(_resolve_server_root(server, "profile")) == paths["profile_dir"]
    assert Path(_resolve_server_root(server, "workshop")) == paths["workshop_dir"]


def test_resolve_server_root_prefers_existing_derived_path_over_stale_record(tmp_path):
    server, paths = _file_manager_server(tmp_path, stale_config=True)

    assert Path(_resolve_server_root(server, "config")) == paths["config_dir"]


def test_list_file_roots_uses_fallback_paths_without_leaking_host_paths(tmp_path, monkeypatch):
    server, _ = _file_manager_server(tmp_path)
    server["config_path"] = ""

    monkeypatch.setattr(
        server_routes,
        "db",
        SimpleNamespace(managed_servers=_FakeManagedServersCollection(server)),
    )

    roots = asyncio.run(server_routes.list_file_roots(server["id"], current_user={"id": "tester"}))

    assert {root["key"]: root["exists"] for root in roots} == {
        "config": True,
        "profile": True,
        "workshop": True,
    }
    assert all("path" not in root for root in roots)


def test_browse_server_files_accepts_empty_root_path_and_uses_fallbacks(tmp_path, monkeypatch):
    server, paths = _file_manager_server(tmp_path, stale_config=True)

    monkeypatch.setattr(
        server_routes,
        "db",
        SimpleNamespace(managed_servers=_FakeManagedServersCollection(server)),
    )

    result = asyncio.run(
        server_routes.browse_server_files(
            server["id"],
            root="config",
            path="",
            current_user={"id": "tester"},
        )
    )

    assert result["root"] == "config"
    assert result["path"] == ""
    assert "base" not in result
    assert any(entry["name"] == "server.json" for entry in result["entries"])
    assert paths["config_dir"] == Path(_resolve_server_root(server, "config"))


def test_read_server_file_uses_fallback_root_when_stored_paths_are_stale(tmp_path, monkeypatch):
    server, _ = _file_manager_server(tmp_path, stale_config=True)

    monkeypatch.setattr(
        server_routes,
        "db",
        SimpleNamespace(managed_servers=_FakeManagedServersCollection(server)),
    )

    result = asyncio.run(
        server_routes.read_server_file(
            server["id"],
            root="config",
            path="server.json",
            current_user={"id": "tester"},
        )
    )

    assert result["name"] == "server.json"
    assert result["root"] == "config"
    assert '"name":"Test"' in result["content"]


# ── Readiness and notification tests ─────────────────────────────────


def test_sat_excluded_from_follow_up_checklist():
    """SAT and profile stages should not appear in operator-facing follow-up checklists."""
    from services.server_notifications import _collect_follow_up_checklist

    server = {
        "provisioning_warnings": [
            {"stage": "sat_discovery", "message": "ServerAdminTools_Config.json was not discovered"},
            {"stage": "profile_generation", "message": "Profile structure not found"},
            {"stage": "mod_sync", "message": "Mod version mismatch"},
        ],
        "provisioning_stages": {
            "sat_discovery": {"name": "sat_discovery", "status": "failed", "error": "SAT config not found"},
            "mod_sync": {"name": "mod_sync", "status": "failed", "error": "mod version mismatch"},
            "container_creation": {"name": "container_creation", "status": "success"},
        },
    }
    checklist = _collect_follow_up_checklist(server)
    stage_names = [item["stage"] for item in checklist]
    assert "sat_discovery" not in stage_names, "SAT discovery should be excluded from follow-up checklist"
    assert "profile_generation" not in stage_names, "Profile generation should be excluded from follow-up checklist"
    assert "mod_sync" in stage_names, "Real operational warnings should still be included"


def test_sat_failure_does_not_degrade_readiness_when_container_runs():
    """Non-readiness stage failures (SAT, profile) should not set readiness_state to degraded."""
    result = ProvisioningResult()
    result.stages = [
        StageResult(name="record_creation", status="success"),
        StageResult(name="filesystem_preparation", status="success"),
        StageResult(name="config_write", status="success"),
        StageResult(name="container_creation", status="success"),
        StageResult(name="initial_startup", status="success"),
        StageResult(name="readiness_check", status="success"),
        StageResult(name="sat_discovery", status="failed", error="SAT config not found"),
        StageResult(name="profile_generation", status="failed", error="Profile not found"),
    ]
    assert result.container_started is True
    failed = [
        s for s in result.failed_stages
        if s.name not in {"record_creation", "filesystem_preparation", "config_write", "container_creation", "initial_startup"}
    ]
    NON_READINESS_STAGE_NAMES = {"sat_discovery", "profile_generation"}
    readiness_relevant = [s for s in failed if s.name not in NON_READINESS_STAGE_NAMES]
    assert len(readiness_relevant) == 0, "SAT/profile failures should not affect readiness"


def test_real_stage_failure_still_degrades_readiness():
    """Non-core stage failures that are NOT supplemental tooling should degrade readiness."""
    result = ProvisioningResult()
    result.stages = [
        StageResult(name="record_creation", status="success"),
        StageResult(name="container_creation", status="success"),
        StageResult(name="initial_startup", status="success"),
        StageResult(name="readiness_check", status="failed", error="Server did not signal readiness"),
        StageResult(name="sat_discovery", status="failed", error="SAT config not found"),
    ]
    assert result.container_started is True
    failed = [
        s for s in result.failed_stages
        if s.name not in {"record_creation", "filesystem_preparation", "config_write", "container_creation", "initial_startup"}
    ]
    NON_READINESS_STAGE_NAMES = {"sat_discovery", "profile_generation"}
    readiness_relevant = [s for s in failed if s.name not in NON_READINESS_STAGE_NAMES]
    assert len(readiness_relevant) == 1, "readiness_check failure should still degrade readiness"
    assert readiness_relevant[0].name == "readiness_check"


def test_detection_model_has_human_fields():
    """WatcherDetection model should have human-friendly fields."""
    from models.server import WatcherDetection
    detection = WatcherDetection(
        server_id="srv-1",
        title="Test Detection",
        human_summary="Something went wrong.",
        human_impact="Players may experience lag.",
        human_action="Restart the server if lag persists.",
        source_type="system",
    )
    assert detection.human_summary == "Something went wrong."
    assert detection.human_impact == "Players may experience lag."
    assert detection.human_action == "Restart the server if lag persists."
    assert detection.source_type == "system"
    assert detection.log_snapshot == []
    assert detection.ignored_at is None


def test_detection_model_supports_ignored_status():
    """WatcherDetection should support 'ignored' as a valid status."""
    from models.server import WatcherDetection
    detection = WatcherDetection(
        server_id="srv-1",
        title="Known Issue",
        status="ignored",
        verdict_notes="This is expected behavior.",
    )
    assert detection.status == "ignored"


def test_log_snapshot_capture_returns_entries():
    """capture_log_snapshot should handle empty log scenarios gracefully."""
    from services.server_logs import build_log_entries

    entries = build_log_entries(
        "line1\nline2\nERROR something broke\nline4\nline5",
        source="docker",
    )
    assert len(entries) == 5
    assert "ERROR something broke" in entries[2]["line"]
