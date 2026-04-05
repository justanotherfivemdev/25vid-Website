"""Unified server log aggregation across Docker, profile files, and RCON events."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

from database import db
from services.docker_agent import DockerAgent

logger = logging.getLogger(__name__)

docker_agent = DockerAgent()

_ISO_TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
_NANO_FRAC_RE = re.compile(r"(\.\d{6})\d+")
_PROFILE_LOG_PATTERNS = (
    "console.log",
    "console*.log",
    "backend*.log",
    "*.rpt",
)


def stable_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:8]


def parse_log_since(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        pass
    try:
        normalized = _NANO_FRAC_RE.sub(r"\1", value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return int(parsed.timestamp())
    except ValueError:
        return None


def parse_log_timestamp(value: Optional[str]) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        normalized = _NANO_FRAC_RE.sub(r"\1", value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def _source_label(source: str, path: str = "") -> str:
    if not path:
        return source
    return f"{source}:{Path(path).name}"


def _source_for_path(path: Path) -> str:
    name = path.name.lower()
    if "backend" in name:
        return "backend"
    if name.endswith(".rpt"):
        return "engine"
    if name.startswith("console"):
        return "console"
    return "profile"


def build_log_entry(
    raw_line: str,
    fallback_index: int,
    *,
    source: str = "docker",
    source_path: str = "",
    cursor_hint: str = "",
    fallback_timestamp: Optional[str] = None,
) -> dict:
    timestamp = None
    line = raw_line
    if " " in raw_line:
        possible_ts, possible_line = raw_line.split(" ", 1)
        if _ISO_TS_RE.match(possible_ts):
            timestamp = possible_ts
            line = possible_line
    timestamp = timestamp or fallback_timestamp or datetime.now(timezone.utc).isoformat()
    source_name = _source_label(source, source_path)
    cursor_parts = [source_name]
    if source_path:
        cursor_parts.append(source_path)
    cursor_parts.append(timestamp)
    cursor_parts.append(cursor_hint or str(fallback_index))
    cursor_parts.append(stable_hash(raw_line))
    cursor = "|".join(cursor_parts)
    return {
        "cursor": cursor,
        "timestamp": timestamp,
        "line": line,
        "raw": raw_line,
        "source": source_name,
        "stream": source_name,
        "path": source_path,
    }


def build_log_entries(
    logs: str,
    *,
    source: str = "docker",
    source_path: str = "",
    start_index: int = 0,
    cursor_prefix: str = "",
    fallback_timestamp: Optional[str] = None,
) -> list[dict]:
    return [
        build_log_entry(
            raw_line,
            start_index + index,
            source=source,
            source_path=source_path,
            cursor_hint=f"{cursor_prefix}{start_index + index}" if cursor_prefix else str(start_index + index),
            fallback_timestamp=fallback_timestamp,
        )
        for index, raw_line in enumerate((logs or "").splitlines())
        if raw_line.strip()
    ]


def _read_recent_file_records(path: Path, tail: int) -> list[tuple[int, str]]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    lines = [line for line in text.splitlines() if line.strip()]
    start_index = max(0, len(lines) - tail) if tail > 0 else 0
    return [
        (start_index + index, line)
        for index, line in enumerate(lines[start_index:])
    ]


def _count_file_lines(path: Path) -> int:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 0
    return len([line for line in text.splitlines() if line.strip()])


def discover_log_files(server: Dict[str, Any]) -> list[Path]:
    profile_root = Path(str(server.get("profile_path") or ""))
    if not profile_root.exists():
        return []
    matches: dict[str, Path] = {}
    for pattern in _PROFILE_LOG_PATTERNS:
        try:
            for match in profile_root.rglob(pattern):
                if match.is_file():
                    matches[str(match.resolve())] = match
        except OSError:
            continue
    return sorted(
        matches.values(),
        key=lambda item: item.stat().st_mtime if item.exists() else 0,
        reverse=True,
    )[:8]


async def _read_profile_log_entries(server: Dict[str, Any], tail: int, since: Optional[int]) -> list[dict]:
    files = await asyncio.to_thread(discover_log_files, server)
    entries: list[dict] = []
    for path in files:
        try:
            stat = await asyncio.to_thread(path.stat)
        except OSError:
            continue
        records = await asyncio.to_thread(_read_recent_file_records, path, tail)
        fallback_timestamp = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        file_entries = [
            build_log_entry(
                raw_line,
                line_number,
                source=_source_for_path(path),
                source_path=str(path),
                cursor_hint=f"L{line_number}",
                fallback_timestamp=fallback_timestamp,
            )
            for line_number, raw_line in records
        ]
        if since is not None:
            file_entries = [
                entry for entry in file_entries
                if parse_log_timestamp(entry["timestamp"]).timestamp() >= since
            ]
        entries.extend(file_entries)
    return entries


async def _read_rcon_log_entries(server_id: str, since: Optional[int], limit: int) -> list[dict]:
    query: Dict[str, Any] = {"server_id": server_id}
    if since is not None:
        query["timestamp"] = {"$gte": datetime.fromtimestamp(since, tz=timezone.utc)}
    docs = await db.server_log_events.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    docs.reverse()
    return [
        {
            "cursor": doc.get("cursor") or f"rcon|{doc.get('id')}",
            "timestamp": doc.get("timestamp").isoformat() if isinstance(doc.get("timestamp"), datetime) else str(doc.get("timestamp") or datetime.now(timezone.utc).isoformat()),
            "line": doc.get("line") or "",
            "raw": doc.get("raw") or doc.get("line") or "",
            "source": doc.get("source") or "rcon",
            "stream": doc.get("source") or "rcon",
            "path": "",
        }
        for doc in docs
        if doc.get("line")
    ]


def _sort_entries(entries: list[dict]) -> list[dict]:
    return sorted(
        entries,
        key=lambda entry: (
            parse_log_timestamp(entry.get("timestamp")).timestamp(),
            entry.get("cursor") or "",
        ),
    )


async def get_recent_server_log_entries(
    server: Dict[str, Any],
    *,
    tail: int = 200,
    since: Optional[int] = None,
) -> list[dict]:
    container_name = server.get("container_name") or server.get("name", "")
    docker_logs = await docker_agent.get_container_logs(container_name, tail=tail, since=since)
    docker_entries = build_log_entries(docker_logs, source="docker")
    profile_entries = await _read_profile_log_entries(server, tail=tail, since=since)
    rcon_entries = await _read_rcon_log_entries(str(server.get("id") or ""), since, tail)
    merged = _sort_entries([*docker_entries, *profile_entries, *rcon_entries])
    if tail > 0:
        return merged[-tail:]
    return merged


async def get_recent_server_log_text(
    server: Dict[str, Any],
    *,
    tail: int = 200,
    since: Optional[int] = None,
) -> str:
    entries = await get_recent_server_log_entries(server, tail=tail, since=since)
    return "\n".join(entry.get("raw") or entry.get("line") or "" for entry in entries)


async def record_server_log_event(
    server_id: str,
    *,
    line: str,
    source: str = "rcon",
    raw: str = "",
    metadata: Optional[dict] = None,
) -> dict:
    timestamp = datetime.now(timezone.utc)
    payload = {
        "id": f"logevt_{stable_hash(f'{server_id}|{timestamp.isoformat()}|{line}')}",
        "server_id": server_id,
        "timestamp": timestamp,
        "source": source,
        "line": line,
        "raw": raw or line,
        "metadata": metadata or {},
    }
    payload["cursor"] = f"{source}|{timestamp.isoformat()}|{stable_hash(payload['raw'])}"
    await db.server_log_events.insert_one(payload)
    return payload


async def stream_server_log_entries(
    server: Dict[str, Any],
    *,
    since: Optional[int] = None,
    tail: int = 0,
) -> AsyncIterator[dict]:
    server_id = str(server.get("id") or "")
    container_name = server.get("container_name") or server.get("name", "")
    queue: asyncio.Queue[Optional[dict]] = asyncio.Queue(maxsize=1024)
    stop_event = asyncio.Event()

    if tail > 0:
        for entry in await get_recent_server_log_entries(server, tail=tail, since=since):
            yield entry

    async def _queue_put_safe(entry: dict) -> None:
        """Put an entry on the queue with a timeout to prevent indefinite blocking."""
        try:
            await asyncio.wait_for(queue.put(entry), timeout=5.0)
        except asyncio.TimeoutError:
            logger.debug("Queue put timeout for server %s – dropping entry", server_id)

    _DOCKER_MAX_RETRIES = 10
    _DOCKER_MAX_BACKOFF = 30.0
    _DOCKER_BACKOFF_BASE = 1.0
    _DOCKER_BACKOFF_CAP_EXP = 5

    async def pump_docker() -> None:
        """Stream Docker container logs with retry on transient failures."""
        retry_count = 0
        while not stop_event.is_set() and retry_count < _DOCKER_MAX_RETRIES:
            try:
                async for chunk in docker_agent.stream_container_logs(container_name, tail=0, since=since):
                    for entry in build_log_entries(chunk, source="docker"):
                        await _queue_put_safe(entry)
                # Stream ended normally (container stopped) — no retry needed
                break
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                retry_count += 1
                backoff = min(
                    _DOCKER_MAX_BACKOFF,
                    _DOCKER_BACKOFF_BASE * (2 ** min(retry_count, _DOCKER_BACKOFF_CAP_EXP)),
                )
                logger.debug(
                    "Docker log pump error for %s (attempt %d/%d): %s – retrying in %.1fs",
                    server_id, retry_count, _DOCKER_MAX_RETRIES, exc, backoff,
                )
                await asyncio.sleep(backoff)

    async def pump_profile_files() -> None:
        positions: dict[str, dict[str, int]] = {}
        while not stop_event.is_set():
            try:
                files = await asyncio.to_thread(discover_log_files, server)
                for path in files:
                    path_str = str(path)
                    try:
                        stat = path.stat()
                    except OSError:
                        continue
                    current = positions.get(path_str)
                    if current is None:
                        positions[path_str] = {
                            "byte": stat.st_size,
                            "line": await asyncio.to_thread(_count_file_lines, path),
                        }
                        continue

                    previous_byte = current.get("byte", stat.st_size)
                    previous_line = current.get("line", 0)
                    if stat.st_size < previous_byte:
                        previous_byte = 0
                        previous_line = 0
                    if stat.st_size > previous_byte:
                        def _read_delta() -> str:
                            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                                handle.seek(previous_byte)
                                return handle.read()

                        chunk = await asyncio.to_thread(_read_delta)
                        delta_lines = [line for line in chunk.splitlines() if line.strip()]
                        fallback_timestamp = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
                        for index, raw_line in enumerate(delta_lines):
                            line_number = previous_line + index
                            entry = build_log_entry(
                                raw_line,
                                line_number,
                                source=_source_for_path(path),
                                source_path=path_str,
                                cursor_hint=f"L{line_number}",
                                fallback_timestamp=fallback_timestamp,
                            )
                            await _queue_put_safe(entry)
                        positions[path_str] = {"byte": stat.st_size, "line": previous_line + len(delta_lines)}
                    else:
                        positions[path_str] = {"byte": stat.st_size, "line": previous_line}
            except Exception as exc:
                logger.debug("Profile log pump error for %s: %s", server_id, exc)
            await asyncio.sleep(0.2)

    async def pump_rcon_events() -> None:
        last_seen = since
        seen_cursors: set[str] = set()
        while not stop_event.is_set():
            try:
                entries = await _read_rcon_log_entries(server_id, last_seen, 200)
                for entry in entries:
                    cursor = entry.get("cursor") or ""
                    if cursor in seen_cursors:
                        continue
                    ts = int(parse_log_timestamp(entry["timestamp"]).timestamp())
                    if last_seen is not None and ts < last_seen:
                        continue
                    await _queue_put_safe(entry)
                    if cursor:
                        seen_cursors.add(cursor)
                        if len(seen_cursors) > 2000:
                            seen_cursors = set(list(seen_cursors)[-1000:])
                    last_seen = max(last_seen or 0, ts)
            except Exception as exc:
                logger.debug("RCON log pump error for %s: %s", server_id, exc)
            await asyncio.sleep(0.2)

    tasks = [
        asyncio.create_task(pump_docker()),
        asyncio.create_task(pump_profile_files()),
        asyncio.create_task(pump_rcon_events()),
    ]

    try:
        while True:
            entry = await queue.get()
            if entry is None:
                break
            yield entry
    finally:
        stop_event.set()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
