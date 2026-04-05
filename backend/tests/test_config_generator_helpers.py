"""
Unit tests for server_config_generator pure helper functions.

Tests normalisation utilities, mod entry formatting, and config
validation — all without MongoDB or Docker.
"""

import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from services.server_config_generator import (
    _deep_merge,
    _normalize_bool,
    _normalize_int,
    _normalize_any_int,
    _normalize_navmesh_streaming,
    _normalize_string_list,
    _sanitize_join_queue,
    _sanitize_persistence,
    format_mod_for_config,
    normalize_mod_entry,
    validate_config,
)


# ── _deep_merge ──────────────────────────────────────────────────────────────


class TestDeepMerge:
    def test_flat_merge(self):
        base = {"a": 1, "b": 2}
        override = {"b": 3, "c": 4}
        result = _deep_merge(base, override)
        assert result == {"a": 1, "b": 3, "c": 4}

    def test_nested_merge(self):
        base = {"a": {"x": 1, "y": 2}}
        override = {"a": {"y": 3, "z": 4}}
        result = _deep_merge(base, override)
        assert result == {"a": {"x": 1, "y": 3, "z": 4}}

    def test_override_replaces_non_dict(self):
        base = {"a": {"x": 1}}
        override = {"a": "replaced"}
        result = _deep_merge(base, override)
        assert result["a"] == "replaced"

    def test_none_override(self):
        base = {"a": 1}
        result = _deep_merge(base, None)
        assert result == {"a": 1}

    def test_empty_override(self):
        base = {"a": 1}
        result = _deep_merge(base, {})
        assert result == {"a": 1}

    def test_does_not_mutate_base(self):
        base = {"a": {"x": 1}}
        _deep_merge(base, {"a": {"y": 2}})
        assert base == {"a": {"x": 1}}

    def test_deeply_nested(self):
        base = {"a": {"b": {"c": 1}}}
        override = {"a": {"b": {"d": 2}}}
        result = _deep_merge(base, override)
        assert result == {"a": {"b": {"c": 1, "d": 2}}}


# ── _normalize_bool ──────────────────────────────────────────────────────────


class TestNormalizeBool:
    def test_true(self):
        assert _normalize_bool(True, False) is True

    def test_false(self):
        assert _normalize_bool(False, True) is False

    def test_string_returns_default(self):
        assert _normalize_bool("true", False) is False

    def test_int_returns_default(self):
        assert _normalize_bool(1, True) is True

    def test_none_returns_default(self):
        assert _normalize_bool(None, True) is True


# ── _normalize_int ───────────────────────────────────────────────────────────


class TestNormalizeInt:
    def test_positive_int(self):
        assert _normalize_int(42, 10) == 42

    def test_zero_returns_default(self):
        assert _normalize_int(0, 10) == 10

    def test_negative_returns_default(self):
        assert _normalize_int(-5, 10) == 10

    def test_string_number(self):
        assert _normalize_int("100", 10) == 100

    def test_invalid_string_returns_default(self):
        assert _normalize_int("abc", 10) == 10

    def test_none_returns_default(self):
        assert _normalize_int(None, 10) == 10

    def test_float_truncated(self):
        assert _normalize_int(5.7, 10) == 5


# ── _normalize_any_int ───────────────────────────────────────────────────────


class TestNormalizeAnyInt:
    def test_positive(self):
        assert _normalize_any_int(42, 0) == 42

    def test_zero(self):
        assert _normalize_any_int(0, 10) == 0

    def test_negative(self):
        assert _normalize_any_int(-5, 10) == -5

    def test_string_number(self):
        assert _normalize_any_int("100", 0) == 100

    def test_invalid_returns_default(self):
        assert _normalize_any_int("abc", 99) == 99

    def test_none_returns_default(self):
        assert _normalize_any_int(None, 7) == 7


# ── _normalize_navmesh_streaming ─────────────────────────────────────────────


class TestNormalizeNavmeshStreaming:
    def test_list_kept(self):
        assert _normalize_navmesh_streaming(["project1"]) == ["project1"]

    def test_empty_list_kept(self):
        assert _normalize_navmesh_streaming([]) == []

    def test_tuple_converted_to_list(self):
        result = _normalize_navmesh_streaming(("a", "b"))
        assert result == ["a", "b"]
        assert isinstance(result, list)

    def test_true_becomes_empty_list(self):
        assert _normalize_navmesh_streaming(True) == []

    def test_false_becomes_none(self):
        assert _normalize_navmesh_streaming(False) is None

    def test_none_becomes_none(self):
        assert _normalize_navmesh_streaming(None) is None

    def test_string_becomes_none(self):
        assert _normalize_navmesh_streaming("yes") is None

    def test_zero_becomes_none(self):
        assert _normalize_navmesh_streaming(0) is None


# ── _normalize_string_list ───────────────────────────────────────────────────


class TestNormalizeStringList:
    def test_valid_list(self):
        assert _normalize_string_list(["PC", "XBL"]) == ["PC", "XBL"]

    def test_strips_whitespace(self):
        assert _normalize_string_list(["  PC  ", " XBL "]) == ["PC", "XBL"]

    def test_filters_empty_strings(self):
        assert _normalize_string_list(["PC", "", "  ", "XBL"]) == ["PC", "XBL"]

    def test_non_list_returns_empty(self):
        assert _normalize_string_list("not a list") == []
        assert _normalize_string_list(42) == []
        assert _normalize_string_list(None) == []

    def test_tuple_accepted(self):
        assert _normalize_string_list(("PC", "XBL")) == ["PC", "XBL"]

    def test_mixed_types_stringified(self):
        assert _normalize_string_list([1, 2, 3]) == ["1", "2", "3"]


# ── _sanitize_join_queue ─────────────────────────────────────────────────────


class TestSanitizeJoinQueue:
    def test_valid_dict(self):
        result = _sanitize_join_queue({"maxSize": 10})
        assert result == {"maxSize": 10}

    def test_negative_maxsize_clamped(self):
        result = _sanitize_join_queue({"maxSize": -5})
        assert result == {"maxSize": 0}

    def test_non_dict_returns_none(self):
        assert _sanitize_join_queue("string") is None
        assert _sanitize_join_queue(42) is None
        assert _sanitize_join_queue(None) is None

    def test_missing_maxsize_defaults_zero(self):
        result = _sanitize_join_queue({})
        assert result == {"maxSize": 0}


# ── _sanitize_persistence ────────────────────────────────────────────────────


class TestSanitizePersistence:
    def test_valid_dict(self):
        result = _sanitize_persistence({"autoSaveInterval": 30, "hiveId": 1})
        assert result["autoSaveInterval"] == 30
        assert result["hiveId"] == 1

    def test_negative_auto_save_clamped(self):
        result = _sanitize_persistence({"autoSaveInterval": -10})
        assert result["autoSaveInterval"] == 0

    def test_non_dict_returns_empty(self):
        assert _sanitize_persistence("not a dict") == {}
        assert _sanitize_persistence(None) == {}

    def test_preserves_databases(self):
        result = _sanitize_persistence({"databases": {"db1": "val"}})
        assert result["databases"] == {"db1": "val"}

    def test_non_dict_databases_excluded(self):
        result = _sanitize_persistence({"databases": "not_a_dict"})
        assert "databases" not in result


# ── normalize_mod_entry ──────────────────────────────────────────────────────


class TestNormalizeModEntry:
    def test_basic_mod(self):
        mod = {"mod_id": "ABC123", "name": "TestMod"}
        result = normalize_mod_entry(mod)
        assert result["modId"] == "ABC123"
        assert result["name"] == "TestMod"

    def test_modId_alias(self):
        mod = {"modId": "ABC123", "name": "TestMod"}
        result = normalize_mod_entry(mod)
        assert result["modId"] == "ABC123"

    def test_id_alias(self):
        mod = {"id": "ABC123", "name": "TestMod"}
        result = normalize_mod_entry(mod)
        assert result["modId"] == "ABC123"

    def test_no_id_returns_empty(self):
        mod = {"name": "NoIdMod"}
        result = normalize_mod_entry(mod)
        assert result == {}

    def test_version_stored(self):
        mod = {"mod_id": "ABC", "name": "M", "version": "1.2.3"}
        result = normalize_mod_entry(mod)
        assert result["version"] == "1.2.3"

    def test_latest_version_omitted(self):
        mod = {"mod_id": "ABC", "name": "M", "version": "latest"}
        result = normalize_mod_entry(mod)
        assert "version" not in result

    def test_empty_version_omitted(self):
        mod = {"mod_id": "ABC", "name": "M", "version": ""}
        result = normalize_mod_entry(mod)
        assert "version" not in result

    def test_required_flag(self):
        mod = {"mod_id": "ABC", "name": "M", "required": True}
        result = normalize_mod_entry(mod)
        assert result["required"] is True

    def test_metadata_preserved(self):
        mod = {
            "mod_id": "ABC",
            "name": "M",
            "author": "Dev",
            "description": "A mod",
        }
        result = normalize_mod_entry(mod)
        assert result["author"] == "Dev"
        assert result["description"] == "A mod"

    def test_name_falls_back_to_id(self):
        mod = {"mod_id": "ABC123"}
        result = normalize_mod_entry(mod)
        assert result["name"] == "ABC123"


# ── format_mod_for_config ────────────────────────────────────────────────────


class TestFormatModForConfig:
    def test_basic_format(self):
        mod = {"modId": "ABC", "name": "TestMod", "author": "Dev"}
        result = format_mod_for_config(mod)
        assert result["modId"] == "ABC"
        assert result["name"] == "TestMod"
        # Metadata fields should NOT be in config output
        assert "author" not in result

    def test_version_included_when_present(self):
        mod = {"modId": "ABC", "name": "M", "version": "1.0.0"}
        result = format_mod_for_config(mod)
        assert result["version"] == "1.0.0"

    def test_required_included_when_bool(self):
        mod = {"modId": "ABC", "name": "M", "required": False}
        result = format_mod_for_config(mod)
        assert result["required"] is False

    def test_empty_mod_id(self):
        mod = {"modId": "", "name": "M"}
        result = format_mod_for_config(mod)
        assert result == {}


# ── validate_config ──────────────────────────────────────────────────────────


class TestValidateConfig:
    def test_valid_config(self):
        config = {
            "game": {
                "name": "Test Server",
                "scenarioId": "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
                "maxPlayers": 64,
            },
            "bindPort": 2001,
            "publicPort": 2001,
            "a2s": {"port": 17777},
            "rcon": {"port": 19999, "password": "secret"},
        }
        valid, errors = validate_config(config)
        assert valid is True
        assert errors == []

    def test_missing_name(self):
        config = {
            "game": {
                "scenarioId": "test",
                "maxPlayers": 64,
            },
            "bindPort": 2001,
            "publicPort": 2001,
            "a2s": {"port": 17777},
            "rcon": {"port": 19999, "password": "secret"},
        }
        valid, errors = validate_config(config)
        assert valid is False
        assert any("name" in e for e in errors)

    def test_empty_name(self):
        config = {
            "game": {
                "name": "   ",
                "scenarioId": "test",
                "maxPlayers": 64,
            },
            "bindPort": 2001,
            "publicPort": 2001,
            "a2s": {"port": 17777},
            "rcon": {"port": 19999, "password": "secret"},
        }
        valid, errors = validate_config(config)
        assert valid is False

    def test_missing_rcon_password(self):
        config = {
            "game": {
                "name": "Test",
                "scenarioId": "test",
            },
            "bindPort": 2001,
            "publicPort": 2001,
            "a2s": {"port": 17777},
            "rcon": {"port": 19999},
        }
        valid, errors = validate_config(config)
        assert valid is False
        assert any("rcon" in e.lower() for e in errors)

    def test_completely_empty_config(self):
        valid, errors = validate_config({})
        assert valid is False
        assert len(errors) > 0
