"""Shared fan-out log streamer with ring buffer and subscriber model.

Replaces per-client stream task spawning in ws_server_logs.
One stream session per container fans out to all connected WebSocket clients.

"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from typing import Any, Dict, Optional

from services.server_logs import probe_source_availability, stream_server_log_entries

logger = logging.getLogger(__name__)

# Ring buffer capacity per server stream.
# 1500 entries ≈ 15-30 min of typical Reforger output at moderate verbosity.
_RING_BUFFER_SIZE = 1500

# Grace period before stopping a stream with no subscribers (seconds).
# Keeps the stream alive briefly so rapid tab-switch/reconnect doesn't restart it.
_IDLE_GRACE_SECONDS = 30


class _StreamSession:
    """Manages a single server's log stream and its subscribers."""

    def __init__(self, server: Dict[str, Any]) -> None:
        self.server = server
        self.server_id: str = str(server.get("id", ""))
        self.container_name: str = server.get("container_name") or server.get("name", "")
        self._ring: deque[dict] = deque(maxlen=_RING_BUFFER_SIZE)
        self._seq: int = 0
        self._subscribers: dict[int, asyncio.Queue] = {}
        self._next_sub_id: int = 0
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
        self._started = False
        self._lock = asyncio.Lock()
        # Diagnostics
        self.entries_total: int = 0
        self.entries_dropped: int = 0
        self.created_at: float = time.monotonic()
        # Source availability probed at start
        self.source_status: Dict[str, Any] = {}

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    @property
    def buffer_size(self) -> int:
        return len(self._ring)

    @property
    def last_seq(self) -> int:
        return self._seq

    @property
    def earliest_seq(self) -> int:
        if not self._ring:
            return 0
        return int(self._ring[0].get("seq", 0))

    def has_reconnect_gap(self, since_seq: int) -> bool:
        """Return True when a reconnect cursor predates our retained buffer."""
        if since_seq <= 0 or not self._ring:
            return False
        return self.earliest_seq > since_seq + 1

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    async def start(self) -> None:
        """Start the background stream pump if not already running."""
        async with self._lock:
            if self._started:
                return
            self._started = True
            self._stop_event.clear()

            # Probe source availability before starting the pump
            try:
                self.source_status = await probe_source_availability(self.server)
            except Exception as exc:
                logger.warning(
                    "log_streamer.probe_failed server=%s error=%s",
                    self.server_id, exc,
                )
                self.source_status = {}

            unavailable = [
                name for name, info in self.source_status.items()
                if not info.get("available", False)
            ]
            if unavailable:
                logger.warning(
                    "log_streamer.sources_unavailable server=%s unavailable=%s",
                    self.server_id, ",".join(unavailable),
                )

            self._task = asyncio.create_task(self._pump())
            logger.info(
                "log_streamer.stream_start server=%s container=%s sources=%s",
                self.server_id,
                self.container_name,
                {k: v.get("available", False) for k, v in self.source_status.items()},
            )

    async def stop(self) -> None:
        """Stop the background stream pump."""
        async with self._lock:
            if not self._started:
                return
            self._stop_event.set()
            if self._task:
                self._task.cancel()
                try:
                    await self._task
                except (asyncio.CancelledError, Exception):
                    pass
            self._started = False
            logger.info("log_streamer.stream_stop server=%s", self.server_id)

    async def _pump(self) -> None:
        """Background task: read from stream_server_log_entries and fan out.

        Restarts automatically if the generator exits or raises, so transient
        Docker or I/O errors never permanently kill the stream.
        """
        backoff = 1.0
        while not self._stop_event.is_set():
            _started_at = time.monotonic()
            try:
                async for entry in stream_server_log_entries(self.server, tail=0):
                    if self._stop_event.is_set():
                        return

                    seq = self._next_seq()
                    entry["seq"] = seq
                    self._ring.append(entry)
                    self.entries_total += 1

                    # Fan out to all subscribers. Iterate over a snapshot so
                    # subscribe()/unsubscribe() can safely mutate the dict without
                    # invalidating this loop.
                    dead_subs: list[int] = []
                    for sub_id, queue in list(self._subscribers.items()):
                        try:
                            queue.put_nowait(entry)
                        except asyncio.QueueFull:
                            self.entries_dropped += 1
                            # Drop oldest entry in subscriber's queue to make room
                            try:
                                queue.get_nowait()
                            except asyncio.QueueEmpty:
                                pass
                            try:
                                queue.put_nowait(entry)
                            except asyncio.QueueFull:
                                dead_subs.append(sub_id)

                    for sub_id in dead_subs:
                        self._subscribers.pop(sub_id, None)
                        logger.warning(
                            "log_streamer.subscriber_dropped sub=%d server=%s reason=queue_full",
                            sub_id, self.server_id,
                        )

                # Generator exited — reset backoff if it ran successfully for a while.
                if time.monotonic() - _started_at > 30:
                    backoff = 1.0
                if not self._stop_event.is_set():
                    logger.info(
                        "log_streamer.stream_restarting server=%s backoff=%.1f",
                        self.server_id, backoff,
                    )
                    await asyncio.sleep(backoff)
                    backoff = min(60.0, backoff * 2)

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error(
                    "log_streamer.pump_error server=%s error=%s",
                    self.server_id, exc,
                )
                if not self._stop_event.is_set():
                    await asyncio.sleep(backoff)
                    backoff = min(60.0, backoff * 2)

    def get_backfill(
        self,
        count: int = 500,
        since_seq: Optional[int] = None,
    ) -> list[dict]:
        """Get entries from the ring buffer for backfill on connect/reconnect.

        If since_seq is provided, returns all entries after that sequence number.
        Otherwise returns the last `count` entries.
        """
        if since_seq is not None and since_seq > 0:
            return [e for e in self._ring if e.get("seq", 0) > since_seq]
        entries = list(self._ring)
        return entries[-count:] if len(entries) > count else entries

    def subscribe(self) -> tuple[int, asyncio.Queue]:
        """Register a new subscriber. Returns (sub_id, queue)."""
        sub_id = self._next_sub_id
        self._next_sub_id += 1
        # 2048 entries ≈ enough to buffer short bursts without dropping
        queue: asyncio.Queue = asyncio.Queue(maxsize=2048)
        self._subscribers[sub_id] = queue
        logger.info(
            "log_streamer.subscribe sub=%d server=%s total_subs=%d",
            sub_id, self.server_id, len(self._subscribers),
        )
        return sub_id, queue

    def unsubscribe(self, sub_id: int) -> None:
        """Remove a subscriber."""
        self._subscribers.pop(sub_id, None)
        logger.info(
            "log_streamer.unsubscribe sub=%d server=%s remaining=%d",
            sub_id, self.server_id, len(self._subscribers),
        )

    def diagnostics(self) -> dict:
        """Return diagnostic info for health endpoints."""
        return {
            "server_id": self.server_id,
            "container_name": self.container_name,
            "started": self._started,
            "subscriber_count": self.subscriber_count,
            "buffer_size": self.buffer_size,
            "earliest_seq": self.earliest_seq,
            "last_seq": self._seq,
            "entries_total": self.entries_total,
            "entries_dropped": self.entries_dropped,
            "uptime_seconds": round(time.monotonic() - self.created_at, 1),
            "sources": self.source_status,
        }


class LogStreamerManager:
    """Global manager for server log stream sessions.

    Ensures one stream per server, handles lifecycle, provides subscriber API.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, _StreamSession] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    async def get_or_create(self, server: Dict[str, Any]) -> _StreamSession:
        """Get existing stream session or create a new one.

        The manager lock is released before calling session.start() so that
        a slow Docker probe does not block other concurrent callers.
        session.start() is idempotent (guarded by its own lock).
        """
        server_id = str(server.get("id", ""))
        async with self._lock:
            session = self._sessions.get(server_id)
            if session is None:
                session = _StreamSession(server)
                self._sessions[server_id] = session
                # Ensure cleanup task is running
                if self._cleanup_task is None or self._cleanup_task.done():
                    self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        # Start outside the lock — session.start() has its own idempotency guard.
        await session.start()
        return session

    async def remove(self, server_id: str) -> None:
        """Stop and remove a stream session."""
        async with self._lock:
            session = self._sessions.pop(server_id, None)
            if session:
                await session.stop()

    async def _cleanup_loop(self) -> None:
        """Periodically remove idle sessions (no subscribers for grace period)."""
        idle_since: dict[str, float] = {}

        while True:
            try:
                await asyncio.sleep(10)
                async with self._lock:
                    to_remove: list[str] = []
                    now = time.monotonic()

                    for server_id, session in self._sessions.items():
                        if session.subscriber_count == 0:
                            if server_id not in idle_since:
                                idle_since[server_id] = now
                            elif now - idle_since[server_id] > _IDLE_GRACE_SECONDS:
                                to_remove.append(server_id)
                        else:
                            idle_since.pop(server_id, None)

                    for server_id in to_remove:
                        session = self._sessions.pop(server_id, None)
                        idle_since.pop(server_id, None)
                        if session:
                            await session.stop()
                            logger.info(
                                "log_streamer.idle_cleanup server=%s", server_id,
                            )

                    if not self._sessions:
                        return

            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.error("log_streamer.cleanup_error error=%s", exc)
                await asyncio.sleep(30)

    def get_session(self, server_id: str) -> Optional[_StreamSession]:
        """Get a session without creating one (for diagnostics)."""
        return self._sessions.get(server_id)

    def diagnostics(self, server_id: Optional[str] = None) -> dict:
        """Return diagnostic info for all or a specific session."""
        if server_id:
            session = self._sessions.get(server_id)
            return session.diagnostics() if session else {"error": "no_active_session"}
        return {
            "active_sessions": len(self._sessions),
            "sessions": {
                sid: s.diagnostics() for sid, s in self._sessions.items()
            },
        }


# Global singleton — import and use this instance
log_streamer = LogStreamerManager()
