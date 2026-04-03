import os
import sys
from pathlib import Path


os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes.operations_plans import _detect_image_type


def test_detect_image_type_supports_allowed_formats():
    assert _detect_image_type(b"\x89PNG\r\n\x1a\npayload") == "png"
    assert _detect_image_type(b"\xff\xd8\xff\xe0payload") == "jpeg"
    assert _detect_image_type(b"RIFF\x24\x00\x00\x00WEBPpayload") == "webp"


def test_detect_image_type_rejects_unknown_bytes():
    assert _detect_image_type(b"not-an-image") is None
