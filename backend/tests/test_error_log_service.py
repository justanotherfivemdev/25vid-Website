"""
Unit tests for error_log_service sanitisation helpers.

Tests _sanitise_body() which strips sensitive fields and Mongo-illegal
keys from request payloads before persisting them.
"""

import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.error_log_service import _sanitise_body, SEVERITY_LEVELS


class TestSanitiseBody:
    """_sanitise_body() redacts secrets and fixes Mongo-illegal keys."""

    def test_sensitive_password_redacted(self):
        body = {"username": "admin", "password": "supersecret"}
        result = _sanitise_body(body)
        assert result["username"] == "admin"
        assert result["password"] == "***"

    def test_sensitive_token_redacted(self):
        body = {"token": "abc123"}
        result = _sanitise_body(body)
        assert result["token"] == "***"

    def test_sensitive_authorization_redacted(self):
        body = {"authorization": "Bearer xyz"}
        result = _sanitise_body(body)
        assert result["authorization"] == "***"

    def test_sensitive_jwt_redacted(self):
        body = {"jwt": "eyJhbGci..."}
        result = _sanitise_body(body)
        assert result["jwt"] == "***"

    def test_sensitive_cookie_redacted(self):
        body = {"cookie": "session=abc"}
        result = _sanitise_body(body)
        assert result["cookie"] == "***"

    def test_sensitive_secret_redacted(self):
        body = {"secret": "my-secret-value"}
        result = _sanitise_body(body)
        assert result["secret"] == "***"

    def test_sensitive_access_token_redacted(self):
        body = {"access_token": "tok123"}
        result = _sanitise_body(body)
        assert result["access_token"] == "***"

    def test_sensitive_refresh_token_redacted(self):
        body = {"refresh_token": "ref456"}
        result = _sanitise_body(body)
        assert result["refresh_token"] == "***"

    def test_case_insensitive_matching(self):
        body = {"Password": "secret", "TOKEN": "abc"}
        result = _sanitise_body(body)
        assert result["Password"] == "***"
        assert result["TOKEN"] == "***"

    def test_non_sensitive_preserved(self):
        body = {"username": "admin", "action": "login"}
        result = _sanitise_body(body)
        assert result["username"] == "admin"
        assert result["action"] == "login"

    def test_mongo_unsafe_keys_fixed(self):
        body = {"$set": "value", "key.name": "test"}
        result = _sanitise_body(body)
        assert "_set" in result
        assert "key_name" in result

    def test_nested_dict_sanitised(self):
        body = {
            "data": {
                "password": "secret",
                "safe_field": "ok",
            }
        }
        result = _sanitise_body(body)
        assert result["data"]["password"] == "***"
        assert result["data"]["safe_field"] == "ok"

    def test_list_sanitised(self):
        body = [{"password": "secret"}, {"safe": "ok"}]
        result = _sanitise_body(body)
        assert result[0]["password"] == "***"
        assert result[1]["safe"] == "ok"

    def test_long_string_truncated(self):
        body = {"data": "x" * 3000}
        result = _sanitise_body(body)
        assert len(result["data"]) < 3000
        assert result["data"].endswith("...[truncated]")

    def test_short_string_preserved(self):
        body = {"data": "short"}
        result = _sanitise_body(body)
        assert result["data"] == "short"

    def test_none_input(self):
        assert _sanitise_body(None) is None

    def test_scalar_input(self):
        assert _sanitise_body(42) == 42
        assert _sanitise_body(True) is True

    def test_deeply_nested_depth_limit(self):
        """Recursion should stop at depth > 10 and return '***'."""
        nested = {"a": "value"}
        for _ in range(15):
            nested = {"nested": nested}
        result = _sanitise_body(nested)
        # Walk into the result; at some depth the value becomes '***'
        current = result
        found_sentinel = False
        for _ in range(20):
            if current == "***":
                found_sentinel = True
                break
            if isinstance(current, dict) and "nested" in current:
                current = current["nested"]
            else:
                break
        assert found_sentinel, "Expected depth limit to produce '***'"

    def test_empty_dict(self):
        assert _sanitise_body({}) == {}

    def test_empty_list(self):
        assert _sanitise_body([]) == []


class TestSeverityLevels:
    """Verify SEVERITY_LEVELS constant is well-formed."""

    def test_severity_levels_order(self):
        assert SEVERITY_LEVELS == ["debug", "info", "warning", "error", "critical"]

    def test_severity_levels_non_empty(self):
        assert len(SEVERITY_LEVELS) == 5
