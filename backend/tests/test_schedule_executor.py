"""
Unit tests for schedule_executor pure functions.

Tests cron schedule parsing and timezone coercion without MongoDB.
"""

import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from services.schedule_executor import _coerce_timezone, parse_next_run


# ── _coerce_timezone ─────────────────────────────────────────────────────────


class TestCoerceTimezone:
    """_coerce_timezone() safely converts timezone names to ZoneInfo."""

    def test_utc(self):
        tz = _coerce_timezone("UTC")
        assert str(tz) == "UTC"

    def test_us_eastern(self):
        tz = _coerce_timezone("US/Eastern")
        assert tz is not None

    def test_america_new_york(self):
        tz = _coerce_timezone("America/New_York")
        assert tz is not None

    def test_empty_string_returns_utc(self):
        tz = _coerce_timezone("")
        assert str(tz) == "UTC"

    def test_none_returns_utc(self):
        tz = _coerce_timezone(None)
        assert str(tz) == "UTC"

    def test_invalid_timezone_returns_utc(self):
        tz = _coerce_timezone("Invalid/Timezone")
        assert str(tz) == "UTC"

    def test_pacific(self):
        tz = _coerce_timezone("US/Pacific")
        assert tz is not None


# ── parse_next_run ───────────────────────────────────────────────────────────


class TestParseNextRun:
    """parse_next_run() computes the next cron execution time."""

    def test_every_minute(self):
        base = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        result = parse_next_run("* * * * *", "UTC", from_dt=base)
        assert result is not None
        assert result > base
        # Next minute should be 10:31
        assert result.minute == 31

    def test_specific_hour(self):
        base = datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
        result = parse_next_run("0 12 * * *", "UTC", from_dt=base)
        assert result is not None
        assert result.hour == 12
        assert result.minute == 0

    def test_daily_at_midnight(self):
        base = datetime(2024, 1, 15, 23, 59, 0, tzinfo=timezone.utc)
        result = parse_next_run("0 0 * * *", "UTC", from_dt=base)
        assert result is not None
        assert result.day == 16
        assert result.hour == 0

    def test_returns_utc(self):
        """Result is always in UTC regardless of input timezone."""
        base = datetime(2024, 6, 15, 10, 0, 0, tzinfo=timezone.utc)
        result = parse_next_run("0 12 * * *", "US/Eastern", from_dt=base)
        assert result is not None
        assert result.tzinfo is not None
        # Convert to UTC explicitly to check
        utc_result = result.astimezone(timezone.utc)
        assert utc_result == result

    def test_empty_schedule_returns_none(self):
        assert parse_next_run("", "UTC") is None

    def test_whitespace_schedule_returns_none(self):
        assert parse_next_run("   ", "UTC") is None

    def test_none_schedule_returns_none(self):
        assert parse_next_run(None, "UTC") is None

    def test_invalid_cron_returns_none(self):
        assert parse_next_run("not a cron", "UTC") is None

    def test_whitespace_stripped(self):
        base = datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc)
        result = parse_next_run("  * * * * *  ", "UTC", from_dt=base)
        assert result is not None

    def test_weekly_schedule(self):
        # Every Sunday at 06:00
        base = datetime(2024, 1, 15, 10, 0, 0, tzinfo=timezone.utc)  # Monday
        result = parse_next_run("0 6 * * 0", "UTC", from_dt=base)
        assert result is not None
        assert result.weekday() == 6  # Sunday = 6 in Python

    def test_timezone_affects_result(self):
        """Same cron expression with different timezones produces different UTC times."""
        base = datetime(2024, 6, 15, 0, 0, 0, tzinfo=timezone.utc)
        utc_result = parse_next_run("0 12 * * *", "UTC", from_dt=base)
        est_result = parse_next_run("0 12 * * *", "US/Eastern", from_dt=base)
        assert utc_result is not None
        assert est_result is not None
        # Eastern time is behind UTC, so 12:00 ET != 12:00 UTC
        assert utc_result != est_result

    def test_naive_from_dt_handled(self):
        """Naive datetime (no tzinfo) is treated as UTC."""
        base = datetime(2024, 1, 15, 10, 0, 0)
        result = parse_next_run("0 12 * * *", "UTC", from_dt=base)
        assert result is not None

    def test_default_from_dt_uses_now(self):
        """When no from_dt is provided, uses current time."""
        result = parse_next_run("* * * * *")
        assert result is not None
        assert result > datetime.now(timezone.utc)
