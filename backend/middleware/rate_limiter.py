"""
In-memory per-user rate limiter for RCON commands.

Uses a sliding-window counter approach.  Each user + server pair gets a
window that tracks timestamps of recent commands.  If the count within
the window exceeds the threshold the request is rejected.

Thread-safe via asyncio (single event loop) — no external lock needed.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Tuple

# Default: max 10 RCON commands per 60-second window per user+server.
DEFAULT_MAX_COMMANDS = 10
DEFAULT_WINDOW_SECONDS = 60.0


class RconRateLimiter:
    """Sliding-window rate limiter keyed by (user_id, server_id)."""

    def __init__(
        self,
        max_commands: int = DEFAULT_MAX_COMMANDS,
        window_seconds: float = DEFAULT_WINDOW_SECONDS,
    ) -> None:
        self.max_commands = max_commands
        self.window_seconds = window_seconds
        # key → list of timestamps (monotonic)
        self._windows: dict[str, list[float]] = defaultdict(list)

    def _key(self, user_id: str, server_id: str) -> str:
        return f"{user_id}:{server_id}"

    def _trim(self, key: str) -> None:
        """Remove entries outside the current window."""
        cutoff = time.monotonic() - self.window_seconds
        entries = self._windows[key]
        # Find first index still within window
        idx = 0
        while idx < len(entries) and entries[idx] < cutoff:
            idx += 1
        if idx:
            self._windows[key] = entries[idx:]

    def check(self, user_id: str, server_id: str) -> Tuple[bool, int]:
        """Return (allowed, remaining) for the given user+server.

        Does **not** record the request — call :meth:`record` after the
        command has actually been dispatched.
        """
        key = self._key(user_id, server_id)
        self._trim(key)
        count = len(self._windows[key])
        remaining = max(0, self.max_commands - count)
        return count < self.max_commands, remaining

    def record(self, user_id: str, server_id: str) -> None:
        """Record a command execution for rate-limit tracking."""
        key = self._key(user_id, server_id)
        self._windows[key].append(time.monotonic())

    def reset(self, user_id: str, server_id: str) -> None:
        """Clear rate-limit state (useful for testing)."""
        key = self._key(user_id, server_id)
        self._windows.pop(key, None)


# Singleton used across the application
rcon_rate_limiter = RconRateLimiter()
