"""
Unit tests for RCON security features: input validation, rate limiting,
command queuing, and security headers middleware.

These tests are self-contained and do not require a running backend or
MongoDB connection.
"""

import asyncio
import time

import pytest

# ── validate_rcon_command ────────────────────────────────────────────────────

from services.rcon_bridge import validate_rcon_command, MAX_RCON_COMMAND_LENGTH


class TestValidateRconCommand:
    def test_valid_simple_command(self):
        assert validate_rcon_command("#status") == "#status"

    def test_valid_command_with_args(self):
        assert validate_rcon_command("#kick 3 \"Disrupting flow\"") == "#kick 3 \"Disrupting flow\""

    def test_strips_whitespace(self):
        assert validate_rcon_command("  #players  ") == "#players"

    def test_empty_string_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            validate_rcon_command("")

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError, match="must not be empty"):
            validate_rcon_command("   ")

    def test_too_long_raises(self):
        cmd = "A" * (MAX_RCON_COMMAND_LENGTH + 1)
        with pytest.raises(ValueError, match="exceeds maximum length"):
            validate_rcon_command(cmd)

    def test_exact_max_length_ok(self):
        cmd = "A" * MAX_RCON_COMMAND_LENGTH
        assert validate_rcon_command(cmd) == cmd

    def test_control_char_null_raises(self):
        with pytest.raises(ValueError, match="disallowed characters"):
            validate_rcon_command("hello\x00world")

    def test_control_char_newline_raises(self):
        with pytest.raises(ValueError, match="disallowed characters"):
            validate_rcon_command("hello\nworld")

    def test_control_char_tab_raises(self):
        with pytest.raises(ValueError, match="disallowed characters"):
            validate_rcon_command("hello\tworld")

    def test_del_char_raises(self):
        with pytest.raises(ValueError, match="disallowed characters"):
            validate_rcon_command("hello\x7Fworld")

    def test_high_byte_raises(self):
        with pytest.raises(ValueError, match="disallowed characters"):
            validate_rcon_command("héllo")

    def test_printable_ascii_ok(self):
        # All printable ASCII 0x20-0x7E (leading space gets stripped)
        cmd = "".join(chr(c) for c in range(0x20, 0x7F))
        assert validate_rcon_command(cmd) == cmd.strip()


# ── RconRateLimiter ──────────────────────────────────────────────────────────

from middleware.rate_limiter import RconRateLimiter


class TestRconRateLimiter:
    def test_allows_under_limit(self):
        limiter = RconRateLimiter(max_commands=3, window_seconds=60)
        for _ in range(3):
            ok, _ = limiter.check("user1", "srv1")
            assert ok
            limiter.record("user1", "srv1")

    def test_blocks_over_limit(self):
        limiter = RconRateLimiter(max_commands=2, window_seconds=60)
        limiter.record("user1", "srv1")
        limiter.record("user1", "srv1")
        ok, remaining = limiter.check("user1", "srv1")
        assert not ok
        assert remaining == 0

    def test_remaining_decrements(self):
        limiter = RconRateLimiter(max_commands=5, window_seconds=60)
        _, rem = limiter.check("u", "s")
        assert rem == 5
        limiter.record("u", "s")
        _, rem = limiter.check("u", "s")
        assert rem == 4

    def test_different_users_independent(self):
        limiter = RconRateLimiter(max_commands=1, window_seconds=60)
        limiter.record("user_a", "srv1")
        ok_a, _ = limiter.check("user_a", "srv1")
        ok_b, _ = limiter.check("user_b", "srv1")
        assert not ok_a
        assert ok_b

    def test_different_servers_independent(self):
        limiter = RconRateLimiter(max_commands=1, window_seconds=60)
        limiter.record("user1", "srv_a")
        ok_a, _ = limiter.check("user1", "srv_a")
        ok_b, _ = limiter.check("user1", "srv_b")
        assert not ok_a
        assert ok_b

    def test_window_expiration(self):
        limiter = RconRateLimiter(max_commands=1, window_seconds=0.1)
        limiter.record("u", "s")
        ok, _ = limiter.check("u", "s")
        assert not ok
        # Wait for window to expire
        time.sleep(0.15)
        ok, _ = limiter.check("u", "s")
        assert ok

    def test_reset_clears(self):
        limiter = RconRateLimiter(max_commands=1, window_seconds=60)
        limiter.record("u", "s")
        ok, _ = limiter.check("u", "s")
        assert not ok
        limiter.reset("u", "s")
        ok, _ = limiter.check("u", "s")
        assert ok


# ── SecurityHeadersMiddleware ────────────────────────────────────────────────

from starlette.testclient import TestClient
from fastapi import FastAPI
from middleware.security_headers import SecurityHeadersMiddleware


class TestSecurityHeadersMiddleware:
    @pytest.fixture
    def app(self):
        _app = FastAPI()
        _app.add_middleware(SecurityHeadersMiddleware)

        @_app.get("/test")
        def _test():
            return {"ok": True}

        return _app

    def test_x_frame_options(self, app):
        client = TestClient(app)
        r = client.get("/test")
        assert r.headers["X-Frame-Options"] == "DENY"

    def test_x_content_type_options(self, app):
        client = TestClient(app)
        r = client.get("/test")
        assert r.headers["X-Content-Type-Options"] == "nosniff"

    def test_hsts(self, app):
        client = TestClient(app)
        r = client.get("/test")
        assert "max-age=31536000" in r.headers["Strict-Transport-Security"]

    def test_referrer_policy(self, app):
        client = TestClient(app)
        r = client.get("/test")
        assert r.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

    def test_csp_present(self, app):
        client = TestClient(app)
        r = client.get("/test")
        csp = r.headers["Content-Security-Policy"]
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        assert "object-src 'none'" in csp

    def test_permissions_policy(self, app):
        client = TestClient(app)
        r = client.get("/test")
        assert "camera=()" in r.headers["Permissions-Policy"]


# ── BERConClient queue ───────────────────────────────────────────────────────

from services.rcon_bridge import BERConClient


class TestBERConClientQueue:
    def test_no_password_returns_disabled(self):
        client = BERConClient()
        ok, msg = asyncio.get_event_loop().run_until_complete(
            client.execute("127.0.0.1", 19999, "", "#status")
        )
        assert not ok
        assert "disabled" in msg.lower() or "no password" in msg.lower()

    def test_queue_is_created_per_server(self):
        client = BERConClient()
        q1 = client._get_queue("host1", 1001)
        q2 = client._get_queue("host1", 1002)
        q3 = client._get_queue("host1", 1001)
        assert q1 is q3  # same key reuses queue
        assert q1 is not q2  # different port = different queue
