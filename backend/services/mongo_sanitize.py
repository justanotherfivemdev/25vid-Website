"""Helpers for making arbitrary payloads safe for MongoDB storage."""


def mongo_safe_key(key: str) -> str:
    """Return a MongoDB-safe version of a dict key."""
    safe = str(key).replace('.', '_')
    if safe.startswith('$'):
        safe = f'_{safe[1:]}'
    return safe


def sanitize_mongo_payload(value):
    """Recursively strip Mongo-illegal key names from nested payloads."""
    if isinstance(value, dict):
        return {
            mongo_safe_key(raw_key): sanitize_mongo_payload(raw_val)
            for raw_key, raw_val in value.items()
        }
    if isinstance(value, list):
        return [sanitize_mongo_payload(item) for item in value]
    return value
