"""
Unit tests for MongoDB payload sanitization helpers.

Tests mongo_safe_key() and sanitize_mongo_payload() which prevent
Mongo-illegal characters (dots, $-prefix) in document keys.
"""

import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.mongo_sanitize import mongo_safe_key, sanitize_mongo_payload


class TestMongoSafeKey:
    """mongo_safe_key() strips dots and dollar-sign prefixes."""

    def test_safe_key_unchanged(self):
        assert mongo_safe_key("name") == "name"

    def test_dot_replaced_with_underscore(self):
        assert mongo_safe_key("plane.spoof") == "plane_spoof"

    def test_multiple_dots(self):
        assert mongo_safe_key("a.b.c") == "a_b_c"

    def test_dollar_prefix_stripped(self):
        assert mongo_safe_key("$type") == "_type"

    def test_dollar_in_middle_preserved(self):
        # Only the leading $ is special in MongoDB keys
        assert mongo_safe_key("my$field") == "my$field"

    def test_dollar_and_dot_combined(self):
        assert mongo_safe_key("$set.value") == "_set_value"

    def test_empty_string(self):
        assert mongo_safe_key("") == ""

    def test_numeric_input(self):
        # str(key) is called first
        assert mongo_safe_key(123) == "123"

    def test_leading_dollar_only(self):
        assert mongo_safe_key("$") == "_"

    def test_double_dollar(self):
        assert mongo_safe_key("$$nested") == "_$nested"


class TestSanitizeMongoPayload:
    """sanitize_mongo_payload() recursively sanitises nested structures."""

    def test_flat_dict(self):
        payload = {"$type": "value", "name.space": "test"}
        result = sanitize_mongo_payload(payload)
        assert result == {"_type": "value", "name_space": "test"}

    def test_nested_dict(self):
        payload = {
            "outer": {
                "$inner": "val",
                "key.name": {"$deep": True},
            }
        }
        result = sanitize_mongo_payload(payload)
        assert "_inner" in result["outer"]
        assert "key_name" in result["outer"]
        assert "_deep" in result["outer"]["key_name"]

    def test_list_of_dicts(self):
        payload = [{"$a": 1}, {"b.c": 2}]
        result = sanitize_mongo_payload(payload)
        assert result == [{"_a": 1}, {"b_c": 2}]

    def test_dict_with_list(self):
        payload = {
            "items": [
                {"$key": "value"},
                {"safe": "ok"},
            ]
        }
        result = sanitize_mongo_payload(payload)
        assert result["items"][0] == {"_key": "value"}
        assert result["items"][1] == {"safe": "ok"}

    def test_scalar_values_untouched(self):
        assert sanitize_mongo_payload("hello") == "hello"
        assert sanitize_mongo_payload(42) == 42
        assert sanitize_mongo_payload(None) is None
        assert sanitize_mongo_payload(True) is True

    def test_empty_dict(self):
        assert sanitize_mongo_payload({}) == {}

    def test_empty_list(self):
        assert sanitize_mongo_payload([]) == []

    def test_deeply_nested(self):
        payload = {"a": {"b": {"c": {"$d": "deep"}}}}
        result = sanitize_mongo_payload(payload)
        assert result["a"]["b"]["c"]["_d"] == "deep"

    def test_mixed_list_types(self):
        payload = [{"$x": 1}, "string", 42, None, [{"y.z": 2}]]
        result = sanitize_mongo_payload(payload)
        assert result[0] == {"_x": 1}
        assert result[1] == "string"
        assert result[2] == 42
        assert result[3] is None
        assert result[4] == [{"y_z": 2}]

    def test_values_are_preserved(self):
        """Key names change, but values remain identical."""
        payload = {"$type": "C-17", "callsign": "RCH123"}
        result = sanitize_mongo_payload(payload)
        assert result["_type"] == "C-17"
        assert result["callsign"] == "RCH123"
