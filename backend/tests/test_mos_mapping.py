"""
Unit tests for mos_mapping utility.

Tests the get_mos_display() function which maps specialization/billet
strings to standardised MOS code/title dictionaries.
"""

import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.mos_mapping import get_mos_display, MOS_MAP, DEFAULT_MOS


class TestGetMosDisplayExact:
    """Exact match lookups against MOS_MAP."""

    def test_infantry(self):
        assert get_mos_display("infantry") == {"mos_code": "11B", "mos_title": "Infantry"}

    def test_infantryman(self):
        assert get_mos_display("infantryman") == {"mos_code": "11B", "mos_title": "Infantry"}

    def test_rifleman(self):
        assert get_mos_display("rifleman") == {"mos_code": "11B", "mos_title": "Infantry"}

    def test_11b(self):
        assert get_mos_display("11b") == {"mos_code": "11B", "mos_title": "Infantry"}

    def test_medic(self):
        assert get_mos_display("medic") == {"mos_code": "68W", "mos_title": "Medic"}

    def test_combat_medic(self):
        assert get_mos_display("combat medic") == {"mos_code": "68W", "mos_title": "Medic"}

    def test_68w(self):
        assert get_mos_display("68w") == {"mos_code": "68W", "mos_title": "Medic"}

    def test_signal(self):
        assert get_mos_display("signal") == {"mos_code": "25U", "mos_title": "Signal"}

    def test_comms(self):
        assert get_mos_display("comms") == {"mos_code": "25U", "mos_title": "Signal"}

    def test_forward_observer(self):
        assert get_mos_display("forward observer") == {"mos_code": "13F", "mos_title": "Fires"}

    def test_engineer(self):
        assert get_mos_display("engineer") == {"mos_code": "12B", "mos_title": "Engineer"}

    def test_armor(self):
        assert get_mos_display("armor") == {"mos_code": "19K", "mos_title": "Armor"}

    def test_pilot(self):
        assert get_mos_display("pilot") == {"mos_code": "15A", "mos_title": "Aviation"}

    def test_intel(self):
        assert get_mos_display("intel") == {"mos_code": "35F", "mos_title": "Intel"}

    def test_logistics(self):
        assert get_mos_display("logistics") == {"mos_code": "92A", "mos_title": "Logistics"}

    def test_leadership(self):
        assert get_mos_display("leadership") == {"mos_code": "N/A", "mos_title": "Leadership / Command"}

    def test_commander(self):
        assert get_mos_display("commander") == {"mos_code": "N/A", "mos_title": "Leadership / Command"}


class TestGetMosDisplayCaseInsensitive:
    """Input is lowered before lookup."""

    def test_upper_case(self):
        result = get_mos_display("INFANTRY")
        assert result["mos_code"] == "11B"

    def test_mixed_case(self):
        result = get_mos_display("Combat Medic")
        assert result["mos_code"] == "68W"

    def test_whitespace_stripping(self):
        result = get_mos_display("  signal  ")
        assert result["mos_code"] == "25U"


class TestGetMosDisplayFuzzy:
    """Fuzzy matching — keyword containment."""

    def test_autorifleman_matches_infantry(self):
        result = get_mos_display("autorifleman")
        assert result["mos_code"] == "11B"

    def test_machine_gunner_matches_infantry(self):
        result = get_mos_display("machine gunner")
        assert result["mos_code"] == "11B"

    def test_corpsman_matches_medic(self):
        result = get_mos_display("corpsman")
        assert result["mos_code"] == "68W"


class TestGetMosDisplayBilletFallback:
    """When specialization doesn't match, billet is used for leadership detection."""

    def test_billet_commander_fallback(self):
        result = get_mos_display("", billet="Company Commander")
        assert result["mos_code"] == "N/A"
        assert result["mos_title"] == "Leadership / Command"

    def test_billet_xo_fallback(self):
        result = get_mos_display("", billet="Executive Officer XO")
        assert result["mos_code"] == "N/A"

    def test_billet_s3_fallback(self):
        result = get_mos_display("", billet="S3 Operations")
        assert result["mos_code"] == "N/A"

    def test_billet_first_sergeant_fallback(self):
        result = get_mos_display("", billet="First Sergeant")
        assert result["mos_code"] == "N/A"

    def test_billet_sergeant_major_fallback(self):
        result = get_mos_display("", billet="Sergeant Major")
        assert result["mos_code"] == "N/A"

    def test_specialization_takes_priority_over_billet(self):
        """Specialization match should be used even when billet also matches."""
        result = get_mos_display("medic", billet="Commander")
        assert result["mos_code"] == "68W"  # medic match, not leadership


class TestGetMosDisplayEdgeCases:
    """Edge cases and defaults."""

    def test_both_empty(self):
        result = get_mos_display("", "")
        assert result == DEFAULT_MOS

    def test_both_none(self):
        result = get_mos_display(None, None)
        assert result == DEFAULT_MOS

    def test_specialization_none_no_billet(self):
        result = get_mos_display(None)
        assert result == DEFAULT_MOS

    def test_unrecognised_specialization_no_billet(self):
        result = get_mos_display("space marine")
        assert result == DEFAULT_MOS

    def test_unrecognised_both(self):
        result = get_mos_display("space marine", "janitor")
        assert result == DEFAULT_MOS

    def test_all_mos_map_keys_resolve(self):
        """Every key in MOS_MAP should produce a valid result."""
        for key in MOS_MAP:
            result = get_mos_display(key)
            assert result["mos_code"] is not None, f"Key {key!r} did not resolve"
            assert result["mos_title"] is not None, f"Key {key!r} missing mos_title"

    def test_default_mos_is_infantry(self):
        assert DEFAULT_MOS == {"mos_code": "11B", "mos_title": "Infantry"}
