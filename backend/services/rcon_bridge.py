"""BattlEye RCon bridge for Arma Reforger."""

from __future__ import annotations

import asyncio
import binascii
import logging
import socket
import struct
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

BATTLEYE_PREFIX = b"BE"
RCON_TIMEOUT_SECONDS = 8


def _wrap_payload(payload: bytes) -> bytes:
    checksum = struct.pack("<I", binascii.crc32(payload) & 0xFFFFFFFF)
    return BATTLEYE_PREFIX + checksum + b"\xFF" + payload


def _parse_packet(data: bytes) -> Optional[bytes]:
    if len(data) < 8 or not data.startswith(BATTLEYE_PREFIX) or data[6] != 0xFF:
        return None
    payload = data[7:]
    expected = struct.unpack("<I", data[2:6])[0]
    actual = binascii.crc32(payload) & 0xFFFFFFFF
    if expected != actual:
        return None
    return payload


class BERConClient:
    def __init__(self) -> None:
        self._sequence = 0

    def _next_sequence(self) -> int:
        self._sequence = (self._sequence + 1) % 256
        return self._sequence

    async def _recv_payload(self, loop: asyncio.AbstractEventLoop, sock: socket.socket) -> Optional[bytes]:
        data, _ = await asyncio.wait_for(loop.sock_recvfrom(sock, 65535), timeout=RCON_TIMEOUT_SECONDS)
        return _parse_packet(data)

    async def execute(self, host: str, port: int, password: str, command: str) -> Tuple[bool, str]:
        if not password:
            return False, "RCON is disabled because no password is configured"

        loop = asyncio.get_running_loop()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)

        try:
            login_packet = _wrap_payload(b"\x00" + password.encode("ascii", errors="ignore"))
            await loop.sock_sendto(sock, login_packet, (host, port))
            login_response = await self._recv_payload(loop, sock)
            if not login_response or len(login_response) < 2 or login_response[0] != 0x00:
                return False, "No valid BattlEye login response received"
            if login_response[1] != 0x01:
                return False, "BattlEye authentication failed"

            sequence = self._next_sequence()
            command_packet = _wrap_payload(
                b"\x01" + bytes([sequence]) + command.encode("ascii", errors="ignore")
            )
            await loop.sock_sendto(sock, command_packet, (host, port))

            fragments: Dict[int, str] = {}
            expected_parts: Optional[int] = None
            single_response: Optional[str] = None

            while True:
                payload = await self._recv_payload(loop, sock)
                if payload is None or len(payload) < 2:
                    continue

                packet_type = payload[0]
                packet_sequence = payload[1]

                if packet_type == 0x02:
                    # Server console message; acknowledge and continue waiting.
                    ack = _wrap_payload(b"\x02" + bytes([packet_sequence]))
                    await loop.sock_sendto(sock, ack, (host, port))
                    continue

                if packet_type != 0x01 or packet_sequence != sequence:
                    continue

                response_payload = payload[2:]
                if len(response_payload) >= 3 and response_payload[0] == 0x00:
                    expected_parts = response_payload[1]
                    part_index = response_payload[2]
                    fragments[part_index] = response_payload[3:].decode("utf-8", errors="replace")
                    if expected_parts > 0 and len(fragments) >= expected_parts:
                        break
                    continue

                single_response = response_payload.decode("utf-8", errors="replace")
                break

            if single_response is not None:
                return True, single_response
            if expected_parts:
                return True, "".join(fragments.get(i, "") for i in range(expected_parts))
            return True, ""
        except asyncio.TimeoutError:
            return False, "BattlEye RCON timed out"
        except OSError as exc:
            logger.error("BattlEye RCON socket error: %s", exc)
            return False, str(exc)
        finally:
            sock.close()

    async def probe(self, host: str, port: int, password: str) -> Dict[str, str]:
        if not password:
            return {"state": "disabled", "detail": "RCON password is not configured"}

        ok, response = await self.execute(host, port, password, "#status")
        if ok:
            return {"state": "connected", "detail": "BattlEye RCON is reachable"}
        if "authentication failed" in response.lower():
            return {"state": "auth_failed", "detail": response}
        if "timed out" in response.lower():
            return {"state": "unavailable", "detail": response}
        return {"state": "error", "detail": response}


bercon_client = BERConClient()
