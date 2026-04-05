"""
Unit tests for mod_issue_engine pure functions.

Tests entry classification, signature normalisation, mod reference
extraction, and finding grouping — all without MongoDB.
"""

import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.mod_issue_engine import (
    ISSUE_PATTERNS,
    _classify_entry,
    _extract_mod_reference,
    _group_findings,
    _normalise_signature,
)


# ── _classify_entry ──────────────────────────────────────────────────────────


class TestClassifyEntry:
    """_classify_entry() matches log lines against ISSUE_PATTERNS."""

    def test_workshop_download_failure(self):
        entry = {"line": "curl error 23: Write body failed for /tmp/download"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "workshop-download"
        assert result["issue_type"] == "mod-download"

    def test_workshop_failed_to_download(self):
        entry = {"line": "failed to download mod 5A1B2C3D from workshop"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "workshop-download"

    def test_rcon_battleye(self):
        entry = {"line": "BattlEye RCON connection lost at 10:30"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "battleye-rcon"
        assert result["issue_type"] == "admin-channel"

    def test_rcon_bercon(self):
        entry = {"line": "BERCON handshake timeout"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "battleye-rcon"

    def test_performance_fps(self):
        entry = {"line": "Server FPS dropped below threshold: 12 fps"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "performance"
        assert result["severity"] == "high"

    def test_performance_hitch(self):
        entry = {"line": "Server thread hitch detected: 450ms"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "performance"

    def test_config_validation_error(self):
        entry = {"line": "JSON is invalid: additional properties not allowed"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "config"
        assert result["severity"] == "high"

    def test_script_exception(self):
        entry = {"line": "Script error: null reference exception in GameMode.c"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "runtime-script"
        assert result["issue_type"] == "mod-runtime"

    def test_stack_trace(self):
        entry = {"line": "stack trace follows: ModManager.Init()"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "runtime-script"

    def test_network_timeout(self):
        entry = {"line": "Connection timed out to master server"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "network"
        assert result["issue_type"] == "connectivity"

    def test_generic_error(self):
        entry = {"line": "engine reported a warning about resource loading"}
        result = _classify_entry(entry)
        assert result is not None
        assert result["source_category"] == "engine"

    def test_empty_line_returns_none(self):
        assert _classify_entry({"line": ""}) is None
        assert _classify_entry({"line": "   "}) is None
        assert _classify_entry({}) is None

    def test_benign_line_returns_none(self):
        entry = {"line": "Player connected successfully"}
        assert _classify_entry(entry) is None

    def test_raw_field_fallback(self):
        entry = {"raw": "failed to download content"}
        result = _classify_entry(entry)
        assert result is not None

    def test_preserves_source(self):
        entry = {"line": "error in module", "source": "stdout"}
        result = _classify_entry(entry)
        assert result["source"] == "stdout"

    def test_preserves_timestamp(self):
        entry = {"line": "warning: stale data", "timestamp": "2024-01-01T00:00:00Z"}
        result = _classify_entry(entry)
        assert result["timestamp"] == "2024-01-01T00:00:00Z"

    def test_missing_source_defaults_unknown(self):
        entry = {"line": "failed to connect"}
        result = _classify_entry(entry)
        assert result["source"] == "unknown"

    def test_result_has_required_keys(self):
        entry = {"line": "exception thrown in script"}
        result = _classify_entry(entry)
        required_keys = {
            "source_category", "issue_type", "severity",
            "impact_summary", "recommended_actions", "line",
            "source", "timestamp",
        }
        assert required_keys.issubset(result.keys())


# ── _normalise_signature ─────────────────────────────────────────────────────


class TestNormaliseSignature:
    """_normalise_signature() produces deterministic dedup hashes."""

    def test_deterministic(self):
        sig1 = _normalise_signature("engine", "Error at line 42")
        sig2 = _normalise_signature("engine", "Error at line 42")
        assert sig1 == sig2

    def test_strips_timestamps(self):
        sig1 = _normalise_signature("engine", "2024-01-15T10:30:00Z Error occurred")
        sig2 = _normalise_signature("engine", "2024-06-20T14:00:00Z Error occurred")
        assert sig1 == sig2

    def test_strips_hex_addresses(self):
        sig1 = _normalise_signature("engine", "Crash at 0xDEADBEEF in module")
        sig2 = _normalise_signature("engine", "Crash at 0x12345678 in module")
        assert sig1 == sig2

    def test_strips_numbers(self):
        sig1 = _normalise_signature("engine", "Error on line 100")
        sig2 = _normalise_signature("engine", "Error on line 200")
        assert sig1 == sig2

    def test_different_categories_different_sigs(self):
        sig1 = _normalise_signature("engine", "error message")
        sig2 = _normalise_signature("config", "error message")
        assert sig1 != sig2

    def test_whitespace_normalised(self):
        sig1 = _normalise_signature("engine", "error    multiple   spaces")
        sig2 = _normalise_signature("engine", "error multiple spaces")
        assert sig1 == sig2


# ── _extract_mod_reference ───────────────────────────────────────────────────


class TestExtractModReference:
    """_extract_mod_reference() attempts to attribute a log line to a mod."""

    def test_matches_mod_id(self):
        mods = [{"mod_id": "5A1B2C3D", "name": "TestMod"}]
        mod_id, mod_name, confidence = _extract_mod_reference(
            "Error loading mod 5A1B2C3D resources", mods
        )
        assert mod_id == "5A1B2C3D"
        assert mod_name == "TestMod"
        assert confidence == 0.95

    def test_matches_mod_name(self):
        mods = [{"mod_id": "abc123", "name": "SuperWeapons"}]
        mod_id, mod_name, confidence = _extract_mod_reference(
            "SuperWeapons failed to initialise", mods
        )
        assert mod_id == "abc123"
        assert mod_name == "SuperWeapons"
        assert confidence == 0.8

    def test_unattributed_fallback(self):
        mods = [{"mod_id": "abc123", "name": "SomeMod"}]
        mod_id, mod_name, confidence = _extract_mod_reference(
            "Generic engine error", mods
        )
        assert mod_id == "unattributed"
        assert confidence == 0.2

    def test_empty_mods_list(self):
        mod_id, mod_name, confidence = _extract_mod_reference("any error", [])
        assert mod_id == "unattributed"

    def test_mod_id_takes_priority_over_name(self):
        mods = [{"mod_id": "ABC123", "name": "ABC123"}]
        _, _, confidence = _extract_mod_reference("ABC123 error", mods)
        assert confidence == 0.95  # mod_id match, not name match

    def test_case_insensitive_matching(self):
        mods = [{"mod_id": "DEF456", "name": "MyMod"}]
        mod_id, _, confidence = _extract_mod_reference("def456 failed", mods)
        assert mod_id == "DEF456"
        assert confidence == 0.95

    def test_modId_alias(self):
        """Supports 'modId' key as well as 'mod_id'."""
        mods = [{"modId": "XYZ789", "name": "AltKey"}]
        mod_id, _, _ = _extract_mod_reference("XYZ789 crashed", mods)
        assert mod_id == "XYZ789"


# ── _group_findings ──────────────────────────────────────────────────────────


class TestGroupFindings:
    """_group_findings() deduplicates and enriches classified entries."""

    def test_groups_duplicate_entries(self):
        entries = [
            {"line": "curl error 23 download failed", "source": "stdout"},
            {"line": "curl error 23 download failed", "source": "stderr"},
        ]
        findings = _group_findings(entries, [])
        # Same normalised signature → grouped into one finding
        assert len(findings) == 1
        assert len(findings[0]["evidence"]) == 2

    def test_different_errors_separate_groups(self):
        entries = [
            {"line": "curl error 23 download failed", "source": "stdout"},
            {"line": "Script error: null reference exception", "source": "stdout"},
        ]
        findings = _group_findings(entries, [])
        assert len(findings) >= 2

    def test_source_streams_collected(self):
        entries = [
            {"line": "error occurred in engine", "source": "stdout"},
            {"line": "error occurred in engine", "source": "stderr"},
        ]
        findings = _group_findings(entries, [])
        assert len(findings) == 1
        assert sorted(findings[0]["source_streams"]) == ["stderr", "stdout"]

    def test_benign_entries_filtered(self):
        entries = [
            {"line": "Player joined successfully"},
            {"line": "Map loaded correctly"},
        ]
        findings = _group_findings(entries, [])
        assert len(findings) == 0

    def test_severity_escalation(self):
        """If any entry is high/critical severity, the group gets elevated."""
        entries = [
            {"line": "warning from engine", "source": "stdout"},  # low
            {"line": "exception at runtime", "source": "stdout"},  # high
        ]
        findings = _group_findings(entries, [])
        high_findings = [f for f in findings if f["severity"] in ("high", "critical")]
        assert len(high_findings) >= 1

    def test_finding_has_required_fields(self):
        entries = [{"line": "error in something failed", "source": "test"}]
        findings = _group_findings(entries, [])
        assert len(findings) >= 1
        f = findings[0]
        required_keys = {
            "mod_id", "mod_name", "confidence_score", "severity",
            "source_category", "issue_type", "impact_summary",
            "recommended_actions", "error_pattern", "error_signature",
            "source_streams", "evidence",
        }
        assert required_keys.issubset(f.keys())


# ── ISSUE_PATTERNS structure ─────────────────────────────────────────────────


class TestIssuePatterns:
    """Verify the ISSUE_PATTERNS list is well-formed."""

    def test_all_patterns_have_required_keys(self):
        required = {"pattern", "source_category", "issue_type", "severity", "summary", "actions"}
        for i, rule in enumerate(ISSUE_PATTERNS):
            missing = required - set(rule.keys())
            assert not missing, f"Pattern {i} missing keys: {missing}"

    def test_all_patterns_are_compiled_regex(self):
        import re
        for i, rule in enumerate(ISSUE_PATTERNS):
            assert hasattr(rule["pattern"], "search"), f"Pattern {i} is not compiled regex"

    def test_actions_are_non_empty_lists(self):
        for i, rule in enumerate(ISSUE_PATTERNS):
            assert isinstance(rule["actions"], list), f"Pattern {i} actions not a list"
            assert len(rule["actions"]) > 0, f"Pattern {i} has empty actions"
