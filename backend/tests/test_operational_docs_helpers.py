"""
Unit tests for operational-docs helper functions.

Covers (no MongoDB required):
  - sanitize_filename: safe character stripping and extension normalisation.
  - document_checksum: deterministic SHA-256 digest.
  - _clean_extracted_text: whitespace / blank-line normalisation.
  - extract_text_from_document: .txt extraction path.
  - _safe_relative_doc_path: path-traversal rejection and happy-path posix output.
"""

import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from fastapi import HTTPException

from services.operational_docs import (
    _clean_extracted_text,
    document_checksum,
    extract_text_from_document,
    sanitize_filename,
)
import routes.operational_docs as operational_docs_mod


# ---------------------------------------------------------------------------
# sanitize_filename
# ---------------------------------------------------------------------------

class TestSanitizeFilename:
    def test_alphanumeric_preserved(self):
        assert sanitize_filename("report.txt") == "report.txt"

    def test_spaces_replaced_with_dash(self):
        result = sanitize_filename("my report.txt")
        assert " " not in result
        assert result.endswith(".txt")

    def test_path_traversal_basename_only(self):
        result = sanitize_filename("../../etc/passwd")
        assert "/" not in result
        assert "\\" not in result

    def test_unsupported_extension_falls_back_to_txt(self):
        result = sanitize_filename("malware.exe")
        assert result.endswith(".txt")

    def test_empty_stem_becomes_document(self):
        # A stem composed entirely of special chars (all stripped) falls back to "document"
        result = sanitize_filename("!!!.txt")
        assert result == "document.txt"

    def test_supported_extensions_preserved(self):
        assert sanitize_filename("brief.pdf").endswith(".pdf")
        assert sanitize_filename("brief.docx").endswith(".docx")
        assert sanitize_filename("brief.txt").endswith(".txt")

    def test_extension_lowercased(self):
        result = sanitize_filename("REPORT.PDF")
        assert result.endswith(".pdf")

    def test_special_chars_stripped_from_stem(self):
        result = sanitize_filename("oper@tion!brief.txt")
        assert "@" not in result
        assert "!" not in result
        assert result.endswith(".txt")


# ---------------------------------------------------------------------------
# document_checksum
# ---------------------------------------------------------------------------

class TestDocumentChecksum:
    def test_deterministic(self):
        data = b"hello world"
        assert document_checksum(data) == document_checksum(data)

    def test_different_data_different_checksum(self):
        assert document_checksum(b"aaa") != document_checksum(b"bbb")

    def test_returns_hex_string(self):
        result = document_checksum(b"test")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)


# ---------------------------------------------------------------------------
# _clean_extracted_text
# ---------------------------------------------------------------------------

class TestCleanExtractedText:
    def test_strips_extra_blank_lines(self):
        text = "line1\n\n\n\n\nline2"
        result = _clean_extracted_text(text)
        assert "\n\n\n" not in result
        assert "line1" in result
        assert "line2" in result

    def test_normalises_crlf(self):
        text = "line1\r\nline2\rline3"
        result = _clean_extracted_text(text)
        assert "\r" not in result

    def test_collapses_inline_whitespace(self):
        result = _clean_extracted_text("word1    word2\t  word3")
        assert "  " not in result

    def test_strips_surrounding_whitespace(self):
        result = _clean_extracted_text("  \n  content  \n  ")
        assert result == result.strip()


# ---------------------------------------------------------------------------
# extract_text_from_document
# ---------------------------------------------------------------------------

class TestExtractTextFromDocument:
    def test_txt_extraction(self):
        data = b"Operation Alpha\nObjective: capture the hill\n"
        text, status, error = extract_text_from_document("opord.txt", "text/plain", data)
        assert status == "parsed"
        assert error is None
        assert "Operation Alpha" in text

    def test_txt_extraction_utf8_decode(self):
        content = "Résumé\nñoño"
        data = content.encode("utf-8")
        text, status, error = extract_text_from_document("notes.txt", "text/plain", data)
        assert status == "parsed"
        assert "Résumé" in text

    def test_unsupported_extension_fails(self):
        _, status, error = extract_text_from_document("file.xyz", "application/octet-stream", b"data")
        assert status == "failed"
        assert error is not None


# ---------------------------------------------------------------------------
# _safe_relative_doc_path
# ---------------------------------------------------------------------------

class TestSafeRelativeDocPath:
    """Tests _safe_relative_doc_path via direct module patching."""

    def test_valid_path_returns_posix_relative(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            upload_root = Path(tmpdir)
            subdir = upload_root / "operational-docs"
            subdir.mkdir()
            target = subdir / "brief.txt"
            target.touch()

            original = operational_docs_mod.UPLOAD_DIR
            operational_docs_mod.UPLOAD_DIR = upload_root
            try:
                result = operational_docs_mod._safe_relative_doc_path(target)
            finally:
                operational_docs_mod.UPLOAD_DIR = original

            assert result == "operational-docs/brief.txt"
            assert "\\" not in result

    def test_path_outside_upload_dir_raises(self):
        with tempfile.TemporaryDirectory() as upload_tmp, \
             tempfile.TemporaryDirectory() as other_tmp:
            upload_root = Path(upload_tmp)
            outside = Path(other_tmp) / "secret.txt"
            outside.touch()

            original = operational_docs_mod.UPLOAD_DIR
            operational_docs_mod.UPLOAD_DIR = upload_root
            try:
                with pytest.raises(HTTPException) as exc_info:
                    operational_docs_mod._safe_relative_doc_path(outside)
            finally:
                operational_docs_mod.UPLOAD_DIR = original

            assert exc_info.value.status_code == 500

    def test_path_traversal_via_dotdot_raises(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            upload_root = Path(tmpdir) / "uploads"
            upload_root.mkdir()
            # Craft a path that looks inside but resolves outside
            traversal = upload_root / ".." / "etc" / "passwd"

            original = operational_docs_mod.UPLOAD_DIR
            operational_docs_mod.UPLOAD_DIR = upload_root
            try:
                with pytest.raises(HTTPException) as exc_info:
                    operational_docs_mod._safe_relative_doc_path(traversal)
            finally:
                operational_docs_mod.UPLOAD_DIR = original

            assert exc_info.value.status_code == 500
