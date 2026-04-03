"""Minimal A2S helpers for Arma Reforger server discovery."""

from __future__ import annotations

import asyncio
import socket
import struct
from typing import Any, Dict, Optional

_HEADER = b"\xFF\xFF\xFF\xFF"
_INFO_REQUEST = _HEADER + b"\x54Source Engine Query\x00"
_CHALLENGE_RESPONSE = 0x41
_INFO_RESPONSE = 0x49


def _read_cstring(payload: bytes, offset: int) -> tuple[str, int]:
    end = payload.find(b"\x00", offset)
    if end == -1:
        return "", len(payload)
    return payload[offset:end].decode("utf-8", errors="replace"), end + 1


def _parse_info_response(payload: bytes) -> Optional[Dict[str, Any]]:
    if len(payload) < 6 or not payload.startswith(_HEADER):
        return None

    packet_type = payload[4]
    if packet_type != _INFO_RESPONSE:
        return None

    offset = 5
    if offset >= len(payload):
        return None
    protocol = payload[offset]
    offset += 1

    name, offset = _read_cstring(payload, offset)
    current_map, offset = _read_cstring(payload, offset)
    folder, offset = _read_cstring(payload, offset)
    game, offset = _read_cstring(payload, offset)
    if offset + 2 > len(payload):
        return None
    app_id = struct.unpack_from("<H", payload, offset)[0]
    offset += 2
    if offset + 5 > len(payload):
        return None

    players = payload[offset]
    max_players = payload[offset + 1]
    bots = payload[offset + 2]
    server_type = chr(payload[offset + 3])
    environment = chr(payload[offset + 4])
    offset += 5

    if offset + 2 > len(payload):
        return None
    visibility = payload[offset]
    vac = payload[offset + 1]
    offset += 2

    version, _ = _read_cstring(payload, offset)
    return {
        "protocol": protocol,
        "name": name,
        "map": current_map,
        "folder": folder,
        "game": game,
        "app_id": app_id,
        "player_count": players,
        "max_players": max_players,
        "bots": bots,
        "server_type": server_type,
        "environment": environment,
        "visibility": visibility,
        "vac": vac,
        "version": version,
    }


async def query_a2s_info(host: str, port: int, timeout_seconds: float = 3.0) -> Optional[Dict[str, Any]]:
    loop = asyncio.get_running_loop()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setblocking(False)

    try:
        await loop.sock_sendto(sock, _INFO_REQUEST, (host, port))
        data, _ = await asyncio.wait_for(loop.sock_recvfrom(sock, 4096), timeout=timeout_seconds)

        if len(data) >= 9 and data.startswith(_HEADER) and data[4] == _CHALLENGE_RESPONSE:
            challenge = data[5:9]
            await loop.sock_sendto(sock, _INFO_REQUEST + challenge, (host, port))
            data, _ = await asyncio.wait_for(loop.sock_recvfrom(sock, 4096), timeout=timeout_seconds)

        return _parse_info_response(data)
    except (asyncio.TimeoutError, OSError):
        return None
    finally:
        sock.close()

