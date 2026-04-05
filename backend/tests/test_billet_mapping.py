"""
Unit tests for billet_mapping utility.

Tests the get_billet_display() function which maps billet strings to
standardised acronym/full_title dictionaries.
"""

import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.billet_mapping import get_billet_display, BILLET_MAP


class TestGetBilletDisplayExact:
    """Exact match lookups against BILLET_MAP."""

    def test_commanding_officer(self):
        result = get_billet_display("commanding officer")
        assert result == {"acronym": "CO", "full_title": "Commanding Officer"}

    def test_commander(self):
        result = get_billet_display("commander")
        assert result == {"acronym": "CO", "full_title": "Commanding Officer"}

    def test_xo(self):
        result = get_billet_display("xo")
        assert result == {"acronym": "XO", "full_title": "Executive Officer"}

    def test_executive_officer(self):
        result = get_billet_display("Executive Officer")
        assert result == {"acronym": "XO", "full_title": "Executive Officer"}

    def test_first_sergeant(self):
        result = get_billet_display("first sergeant")
        assert result == {"acronym": "1SG", "full_title": "First Sergeant"}

    def test_1sg(self):
        result = get_billet_display("1SG")
        assert result == {"acronym": "1SG", "full_title": "First Sergeant"}

    def test_platoon_leader(self):
        result = get_billet_display("platoon leader")
        assert result == {"acronym": "PL", "full_title": "Platoon Leader"}

    def test_squad_leader(self):
        result = get_billet_display("squad leader")
        assert result == {"acronym": "SL", "full_title": "Squad Leader"}

    def test_team_leader(self):
        result = get_billet_display("team leader")
        assert result == {"acronym": "TL", "full_title": "Team Leader"}

    def test_fireteam_leader(self):
        result = get_billet_display("fireteam leader")
        assert result == {"acronym": "TL", "full_title": "Team Leader"}

    def test_rto(self):
        result = get_billet_display("rto")
        assert result == {"acronym": "RTO", "full_title": "Radio Telephone Operator"}

    def test_combat_medic(self):
        result = get_billet_display("combat medic")
        assert result == {"acronym": "MED", "full_title": "Combat Medic"}

    def test_s3(self):
        result = get_billet_display("s3")
        assert result == {"acronym": "S3", "full_title": "Operations Officer"}

    def test_s_dash_3(self):
        result = get_billet_display("s-3")
        assert result == {"acronym": "S3", "full_title": "Operations Officer"}

    def test_s1(self):
        result = get_billet_display("s1")
        assert result == {"acronym": "S1", "full_title": "Personnel"}

    def test_s4(self):
        result = get_billet_display("s4")
        assert result == {"acronym": "S4", "full_title": "Logistics"}

    def test_sergeant_major(self):
        result = get_billet_display("sergeant major")
        assert result == {"acronym": "SGM", "full_title": "Sergeant Major"}

    def test_csm(self):
        result = get_billet_display("csm")
        assert result == {"acronym": "SGM", "full_title": "Sergeant Major"}

    def test_platoon_sergeant(self):
        result = get_billet_display("platoon sergeant")
        assert result == {"acronym": "PSG", "full_title": "Platoon Sergeant"}

    def test_plt_sgt(self):
        result = get_billet_display("plt sgt")
        assert result == {"acronym": "PSG", "full_title": "Platoon Sergeant"}


class TestGetBilletDisplayCaseInsensitive:
    """Case-insensitive matching (input is lowered before lookup)."""

    def test_upper_case(self):
        result = get_billet_display("COMMANDING OFFICER")
        assert result["acronym"] == "CO"

    def test_mixed_case(self):
        result = get_billet_display("Platoon Leader")
        assert result["acronym"] == "PL"

    def test_whitespace_stripping(self):
        result = get_billet_display("  squad leader  ")
        assert result["acronym"] == "SL"


class TestGetBilletDisplayFuzzy:
    """Fuzzy matching — keyword containment in either direction."""

    def test_contains_keyword(self):
        # "company commander" contains "commander"
        result = get_billet_display("company commander")
        assert result["acronym"] == "CO"

    def test_keyword_contains_input(self):
        # "med" (input) is contained in "medic" (keyword)
        result = get_billet_display("med")
        assert result["acronym"] == "MED"

    def test_logistics_officer(self):
        result = get_billet_display("logistics officer")
        assert result["acronym"] is not None  # Should match either S4 or another


class TestGetBilletDisplayEdgeCases:
    """Edge cases and fallback behaviour."""

    def test_empty_string(self):
        result = get_billet_display("")
        assert result == {"acronym": None, "full_title": None}

    def test_none_input(self):
        # The function checks `if not billet` which catches None
        result = get_billet_display(None)
        assert result == {"acronym": None, "full_title": None}

    def test_unrecognised_billet(self):
        result = get_billet_display("space marine")
        assert result == {"acronym": None, "full_title": None}

    def test_whitespace_only(self):
        # Whitespace-only input strips to empty string "".
        # Empty string then fuzzy-matches via `key in keyword` since ""
        # is a substring of every keyword.  This is current behaviour —
        # the function only short-circuits on falsy input (None / ""),
        # but the stripped result is non-falsy since `"   "` is truthy,
        # so it proceeds to the lookup with key="".
        result = get_billet_display("   ")
        # The function matches because "" is contained in every BILLET_MAP key
        assert result["acronym"] is not None

    def test_all_billet_map_keys_resolve(self):
        """Every key in BILLET_MAP should resolve to a valid result."""
        for key in BILLET_MAP:
            result = get_billet_display(key)
            assert result["acronym"] is not None, f"Key {key!r} did not resolve"
            assert result["full_title"] is not None, f"Key {key!r} missing full_title"
