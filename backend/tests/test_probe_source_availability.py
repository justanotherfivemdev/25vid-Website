"""Tests for probe_source_availability() in services/server_logs.py."""

import os
import sys
import asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from services.server_logs import probe_source_availability


def _run(coro):
    """Run an async function synchronously."""
    return asyncio.get_event_loop().run_until_complete(coro)


# ── Docker source ──────────────────────────────────────────────────────────


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_docker_no_container_name(mock_db, mock_docker):
    """No container_name → docker unavailable with reason no_container_name."""
    server = {"id": "srv-1", "name": "", "container_name": ""}
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    result = _run(probe_source_availability(server))
    assert result["docker"]["available"] is False
    assert result["docker"]["reason"] == "no_container_name"


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_docker_ping_fails(mock_db, mock_docker):
    """Docker ping fails → docker unavailable, no detail field leaked."""
    mock_docker.ping = AsyncMock(return_value=(False, "connection refused to /var/run/docker.sock"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    server = {"id": "srv-1", "container_name": "my-server"}
    result = _run(probe_source_availability(server))
    assert result["docker"]["available"] is False
    assert result["docker"]["reason"] == "docker_unavailable"
    # Must NOT leak internal details to clients
    assert "detail" not in result["docker"]


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_docker_container_not_found(mock_db, mock_docker):
    """Docker is up but container doesn't exist → container_not_found."""
    mock_docker.ping = AsyncMock(return_value=(True, None))
    mock_docker.get_container = AsyncMock(return_value=None)
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    server = {"id": "srv-1", "container_name": "nonexistent"}
    result = _run(probe_source_availability(server))
    assert result["docker"]["available"] is False
    assert result["docker"]["reason"] == "container_not_found"


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_docker_available(mock_db, mock_docker):
    """Docker is up and container exists → available."""
    mock_docker.ping = AsyncMock(return_value=(True, None))
    mock_docker.get_container = AsyncMock(return_value=MagicMock())
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    server = {"id": "srv-1", "container_name": "my-server"}
    result = _run(probe_source_availability(server))
    assert result["docker"]["available"] is True


# ── Profile source ─────────────────────────────────────────────────────────


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_profile_no_path(mock_db, mock_docker):
    """No profile_path → profile unavailable."""
    mock_docker.ping = AsyncMock(return_value=(False, "no docker"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    server = {"id": "srv-1", "container_name": "x"}
    result = _run(probe_source_availability(server))
    assert result["profile"]["available"] is False
    assert result["profile"]["reason"] == "no_profile_path"


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_profile_path_not_found(mock_db, mock_docker):
    """profile_path set to non-existent dir → path_not_found."""
    mock_docker.ping = AsyncMock(return_value=(False, "no docker"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    server = {"id": "srv-1", "container_name": "x", "profile_path": "/nonexistent/path/xyzzy"}
    result = _run(probe_source_availability(server))
    assert result["profile"]["available"] is False
    assert result["profile"]["reason"] == "path_not_found"


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_profile_path_is_file_not_directory(mock_db, mock_docker):
    """profile_path points to a file, not a directory → not_a_directory."""
    mock_docker.ping = AsyncMock(return_value=(False, "no docker"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    with tempfile.NamedTemporaryFile(suffix=".txt") as tmp:
        server = {"id": "srv-1", "container_name": "x", "profile_path": tmp.name}
        result = _run(probe_source_availability(server))
        assert result["profile"]["available"] is False
        assert result["profile"]["reason"] == "not_a_directory"


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_profile_path_exists_no_log_files(mock_db, mock_docker):
    """profile_path is a valid dir but contains no log files → no_log_files."""
    mock_docker.ping = AsyncMock(return_value=(False, "no docker"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    with tempfile.TemporaryDirectory() as tmpdir:
        server = {"id": "srv-1", "container_name": "x", "profile_path": tmpdir}
        result = _run(probe_source_availability(server))
        assert result["profile"]["available"] is False
        assert result["profile"]["reason"] == "no_log_files"


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_profile_path_with_log_files(mock_db, mock_docker):
    """profile_path has matching log files → available with file_count."""
    mock_docker.ping = AsyncMock(return_value=(False, "no docker"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    with tempfile.TemporaryDirectory() as tmpdir:
        (Path(tmpdir) / "console.log").write_text("test log line\n")
        (Path(tmpdir) / "backend_001.log").write_text("another line\n")
        server = {"id": "srv-1", "container_name": "x", "profile_path": tmpdir}
        result = _run(probe_source_availability(server))
        assert result["profile"]["available"] is True
        assert result["profile"]["file_count"] == 2


# ── RCON source ────────────────────────────────────────────────────────────


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_rcon_has_events(mock_db, mock_docker):
    """RCON has stored events → available with has_events=True."""
    mock_docker.ping = AsyncMock(return_value=(False, "no docker"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=1)

    server = {"id": "srv-1", "container_name": "x"}
    result = _run(probe_source_availability(server))
    assert result["rcon"]["available"] is True
    assert result["rcon"]["has_events"] is True


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_rcon_no_events(mock_db, mock_docker):
    """RCON has no events → available with has_events=False."""
    mock_docker.ping = AsyncMock(return_value=(False, "no docker"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(return_value=0)

    server = {"id": "srv-1", "container_name": "x"}
    result = _run(probe_source_availability(server))
    assert result["rcon"]["available"] is True
    assert result["rcon"]["has_events"] is False


@patch("services.server_logs.docker_agent")
@patch("services.server_logs.db")
def test_rcon_db_error(mock_db, mock_docker):
    """DB query fails → rcon unavailable with reason db_error."""
    mock_docker.ping = AsyncMock(return_value=(False, "no docker"))
    mock_db.server_log_events = MagicMock()
    mock_db.server_log_events.count_documents = AsyncMock(side_effect=Exception("connection timeout"))

    server = {"id": "srv-1", "container_name": "x"}
    result = _run(probe_source_availability(server))
    assert result["rcon"]["available"] is False
    assert result["rcon"]["reason"] == "db_error"
