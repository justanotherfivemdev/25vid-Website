"""Unit tests for the log monitor parser.

Tests regex pattern matching, normalisation, fingerprinting, and parsing
logic against sample Arma Reforger console log lines.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from services.log_monitor import (
    parse_log_line,
    normalise_message,
    compute_fingerprint,
    ERROR_PATTERNS,
)


# ---------------------------------------------------------------------------
# Pattern matching tests
# ---------------------------------------------------------------------------


class TestParseLogLine:
    """Verify parse_log_line detects and classifies known error patterns."""

    def test_backend_error_detected(self):
        line = "2024-06-15 12:34:56.789 BACKEND (E): Failed to initialise subsystem"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "backend-error"
        assert result["severity"] == "critical"
        assert result["timestamp_str"] == "2024-06-15 12:34:56.789"

    def test_addon_load_error(self):
        line = "ADDON_LOAD_ERROR: Could not load addon 5AAAC70D754245DD"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "addon-load"
        assert result["severity"] == "high"
        assert result["mod_guid"] == "5AAAC70D754245DD"

    def test_failed_to_load_addon(self):
        line = "Failed to load addon 1234567890ABCDEF from workshop"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "addon-load"
        assert result["mod_guid"] == "1234567890ABCDEF"

    def test_fragmentizer_error(self):
        line = "Fragmentizer: Error processing mesh data for object"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "fragmentizer"
        assert result["severity"] == "high"

    def test_script_error(self):
        line = "SCRIPT (E): NullPointerException in ModScript.c at line 42"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "script-error"
        assert result["severity"] == "high"

    def test_resource_error(self):
        line = "RESOURCE (E): Failed to load texture pack"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "resource-error"
        assert result["severity"] == "medium"

    def test_network_error(self):
        line = "NETWORK (E): Connection refused to backend service"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "network-error"

    def test_world_error(self):
        line = "WORLD (E): Terrain load failed for chunk 12,45"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "world-error"

    def test_null_reference(self):
        line = "NullReferenceException: Object reference not set"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "null-reference"
        assert result["severity"] == "high"

    def test_crash_detected(self):
        line = "CRASH: Unhandled exception at 0x7FFE12345678"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "crash"
        assert result["severity"] == "critical"

    def test_segfault(self):
        line = "Signal: SIGSEGV (segfault) received"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "crash"

    def test_mod_mismatch(self):
        line = "Mod mismatch detected: client has v1.2, server has v1.3"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "mod-mismatch"

    def test_config_error(self):
        line = "CONFIG (E): Server config validation failed"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "config-error"

    def test_generic_error(self):
        line = "ERROR: Something went wrong in processing"
        result = parse_log_line(line)
        assert result is not None
        assert result["category"] == "generic-error"
        assert result["severity"] == "low"

    def test_fatal_error(self):
        line = "FATAL: Out of memory"
        result = parse_log_line(line)
        assert result is not None
        # Should match generic-error (FATAL)
        assert result["severity"] == "low"

    def test_non_error_line_returns_none(self):
        line = "Player JohnDoe connected from 192.168.1.1"
        result = parse_log_line(line)
        assert result is None

    def test_empty_line_returns_none(self):
        assert parse_log_line("") is None
        assert parse_log_line("   ") is None

    def test_timestamp_extraction_iso(self):
        line = "2024-01-15T10:30:45.123Z BACKEND (E): test error"
        result = parse_log_line(line)
        assert result is not None
        assert result["timestamp_str"] == "2024-01-15T10:30:45.123Z"

    def test_timestamp_extraction_space(self):
        line = "2024-01-15 10:30:45 BACKEND (E): another error"
        result = parse_log_line(line)
        assert result is not None
        assert result["timestamp_str"] == "2024-01-15 10:30:45"

    def test_mod_guid_extraction_16char(self):
        line = "ADDON_LOAD_ERROR in mod ABCDEF0123456789"
        result = parse_log_line(line)
        assert result is not None
        assert result["mod_guid"] == "ABCDEF0123456789"

    def test_no_mod_guid_when_absent(self):
        line = "BACKEND (E): Generic error without any GUID"
        result = parse_log_line(line)
        assert result is not None
        assert result["mod_guid"] is None

    def test_message_truncation(self):
        long_msg = "ERROR: " + "x" * 2000
        result = parse_log_line(long_msg)
        assert result is not None
        assert len(result["message"]) <= 1000
        assert len(result["raw"]) <= 2000

    def test_fingerprint_stability(self):
        """Same normalised message should produce the same fingerprint."""
        line1 = "2024-01-01 00:00:00 BACKEND (E): Failed at line 42"
        line2 = "2024-12-31 23:59:59 BACKEND (E): Failed at line 99"
        r1 = parse_log_line(line1)
        r2 = parse_log_line(line2)
        assert r1 is not None and r2 is not None
        # After normalisation (timestamps and numbers removed), fingerprints should match
        assert r1["fingerprint"] == r2["fingerprint"]

    def test_fingerprint_differs_for_different_messages(self):
        line1 = "BACKEND (E): Failed to initialise"
        line2 = "BACKEND (E): Failed to connect"
        r1 = parse_log_line(line1)
        r2 = parse_log_line(line2)
        assert r1 is not None and r2 is not None
        assert r1["fingerprint"] != r2["fingerprint"]


# ---------------------------------------------------------------------------
# Normalisation tests
# ---------------------------------------------------------------------------


class TestNormaliseMessage:
    def test_removes_timestamps(self):
        msg = "2024-01-15T10:30:45.123Z Error occurred"
        result = normalise_message(msg)
        assert "2024" not in result
        assert "error occurred" in result

    def test_removes_hex_addresses(self):
        msg = "Access violation at 0x7FFE12345678"
        result = normalise_message(msg)
        assert "0x7FFE" not in result
        assert "<hex>" in result

    def test_removes_numbers(self):
        msg = "Failed at line 42 of module 7"
        result = normalise_message(msg)
        assert "42" not in result
        assert "<num>" in result

    def test_removes_file_paths(self):
        msg = "Error in C:\\Users\\admin\\mod\\script.c"
        result = normalise_message(msg)
        assert "C:\\Users" not in result
        assert "<path>" in result

    def test_removes_guids(self):
        msg = "Addon 5AAAC70D754245DD failed to load"
        result = normalise_message(msg)
        assert "5AAAC70D" not in result
        assert "<guid>" in result

    def test_lowercases_output(self):
        msg = "BACKEND Error: Something FAILED"
        result = normalise_message(msg)
        assert result == result.lower()


# ---------------------------------------------------------------------------
# Fingerprint tests
# ---------------------------------------------------------------------------


class TestComputeFingerprint:
    def test_returns_hex_string(self):
        fp = compute_fingerprint("test message")
        assert len(fp) == 32  # MD5 hex digest
        assert all(c in "0123456789abcdef" for c in fp)

    def test_deterministic(self):
        assert compute_fingerprint("hello") == compute_fingerprint("hello")

    def test_different_inputs_differ(self):
        assert compute_fingerprint("hello") != compute_fingerprint("world")


# ---------------------------------------------------------------------------
# Pattern coverage test
# ---------------------------------------------------------------------------


class TestPatternCoverage:
    """Ensure all defined patterns can actually match something."""

    def test_all_patterns_are_reachable(self):
        """Each pattern in ERROR_PATTERNS should match at least one test string."""
        test_strings = {
            "backend-error": "BACKEND (E): test",
            "addon-load": "ADDON_LOAD_ERROR: test",
            "fragmentizer": "Fragmentizer: test",
            "script-error": "SCRIPT (E): test",
            "resource-error": "RESOURCE (E): test",
            "network-error": "NETWORK (E): test",
            "world-error": "WORLD (E): test",
            "null-reference": "NullReferenceException: test",
            "crash": "CRASH: test",
            "mod-mismatch": "mod mismatch detected",
            "config-error": "CONFIG (E): test",
            "physics-error": "PHYSICS (E): test",
            "ai-error": "AI (E): test",
            "generic-error": "ERROR: test",
        }
        for pattern in ERROR_PATTERNS:
            category = pattern["category"]
            test_line = test_strings.get(category)
            assert test_line is not None, f"No test string for category {category}"
            assert pattern["regex"].search(test_line), (
                f"Pattern for {category} did not match test string: {test_line}"
            )
