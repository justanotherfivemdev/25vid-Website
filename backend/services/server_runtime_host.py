"""Resolve the host address used to reach game-server UDP ports."""

from __future__ import annotations

import os
import socket
from functools import lru_cache


def _resolves(host: str) -> bool:
    try:
        socket.getaddrinfo(host, None)
        return True
    except socket.gaierror:
        return False


@lru_cache(maxsize=1)
def get_server_runtime_host() -> str:
    explicit = str(os.environ.get("SERVER_RUNTIME_HOST", "")).strip()
    if explicit:
        return explicit

    for candidate in ("host.docker.internal", "127.0.0.1"):
        if _resolves(candidate):
            return candidate

    return "127.0.0.1"


def reset_server_runtime_host_cache() -> None:
    get_server_runtime_host.cache_clear()
