"""BattlEye RCon bridge for Arma Reforger."""

from __future__ import annotations

import asyncio
import binascii
import logging
import re
import struct
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

BATTLEYE_PREFIX = b"BE"
RCON_TIMEOUT_SECONDS = 8

# ── RCON input-validation constants ──────────────────────────────────────────

# Maximum command length (bytes) that we will send over UDP.
MAX_RCON_COMMAND_LENGTH = 512

# Allowed characters: printable ASCII (space through tilde) — no control
# characters, no DEL (0x7F), no high-byte sequences.
_RCON_ALLOWED_RE = re.compile(r'^[\x20-\x7E]+$')


def validate_rcon_command(command: str) -> str:
    """Validate and sanitize an RCON command string.

    Raises ``ValueError`` with a human-readable message if the command is
    invalid.  Returns the stripped command on success.
    """
    command = command.strip()
    if not command:
        raise ValueError("RCON command must not be empty")
    if len(command) > MAX_RCON_COMMAND_LENGTH:
        raise ValueError(
            f"RCON command exceeds maximum length of {MAX_RCON_COMMAND_LENGTH} characters"
        )
    if not _RCON_ALLOWED_RE.match(command):
        raise ValueError(
            "RCON command contains disallowed characters; "
            "only printable ASCII (0x20–0x7E) is permitted"
        )
    return command


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
        # Per-server FIFO queues keyed by (host, port).  Each queue
        # serialises UDP send/recv to avoid packet collisions.
        self._queues: Dict[Tuple[str, int], asyncio.Queue] = {}
        self._workers: Dict[Tuple[str, int], asyncio.Task] = {}

    def _next_sequence(self) -> int:
        self._sequence = (self._sequence + 1) % 256
        return self._sequence

    # ── per-server command queue ────────────────────────────────────────

    def _get_queue(self, host: str, port: int) -> asyncio.Queue:
        key = (host, port)
        if key not in self._queues:
            self._queues[key] = asyncio.Queue()
        return self._queues[key]

    async def _ensure_worker(self, host: str, port: int) -> None:
        key = (host, port)
        task = self._workers.get(key)
        if task is None or task.done():
            self._workers[key] = asyncio.create_task(self._queue_worker(key))

    # How long (seconds) a queue worker waits for the next command before
    # shutting itself down and releasing its resources.
    _WORKER_IDLE_TIMEOUT: float = 300  # 5 minutes

    async def _queue_worker(self, key: Tuple[str, int]) -> None:
        """Process queued commands one at a time for *key* (host, port).

        The worker shuts itself down after ``_WORKER_IDLE_TIMEOUT`` seconds of
        inactivity so we don't leak tasks/queues for deprovisioned servers.
        """
        queue = self._queues[key]
        while True:
            try:
                future, password, command = await asyncio.wait_for(
                    queue.get(), timeout=self._WORKER_IDLE_TIMEOUT
                )
            except asyncio.TimeoutError:
                # No commands for a while — clean up and exit.
                self._queues.pop(key, None)
                self._workers.pop(key, None)
                return
            try:
                result = await self._execute_impl(key[0], key[1], password, command)
                if not future.done():
                    future.set_result(result)
            except Exception as exc:
                if not future.done():
                    future.set_exception(exc)
            finally:
                queue.task_done()

    async def execute(self, host: str, port: int, password: str, command: str) -> Tuple[bool, str]:
        """Enqueue *command* and wait for its result (FIFO per server)."""
        if not password:
            return False, "RCON is disabled because no password is configured"

        loop = asyncio.get_running_loop()
        future: asyncio.Future[Tuple[bool, str]] = loop.create_future()

        queue = self._get_queue(host, port)
        await queue.put((future, password, command))
        await self._ensure_worker(host, port)

        return await future

    class _DatagramProtocol(asyncio.DatagramProtocol):
        def __init__(self) -> None:
            self._queue: asyncio.Queue[object] = asyncio.Queue()

        def datagram_received(self, data: bytes, addr: Tuple[str, int]) -> None:
            self._queue.put_nowait(data)

        def error_received(self, exc: Exception) -> None:
            self._queue.put_nowait(exc)

        async def recv_datagram(self) -> bytes:
            item = await self._queue.get()
            if isinstance(item, Exception):
                raise item
            return item

    async def _open_datagram_endpoint(
        self, host: str, port: int
    ) -> Tuple[asyncio.DatagramTransport, "BERConClient._DatagramProtocol"]:
        loop = asyncio.get_running_loop()
        protocol = self._DatagramProtocol()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: protocol,
            remote_addr=(host, port),
        )
        return transport, protocol

    async def _recv_payload(self, protocol: "BERConClient._DatagramProtocol") -> Optional[bytes]:
        data = await asyncio.wait_for(protocol.recv_datagram(), timeout=RCON_TIMEOUT_SECONDS)
        return _parse_packet(data)

    async def _execute_impl(self, host: str, port: int, password: str, command: str) -> Tuple[bool, str]:
        """Low-level BattlEye UDP send/recv.  Called from the queue worker."""
        transport, protocol = await self._open_datagram_endpoint(host, port)

        try:
            login_packet = _wrap_payload(b"\x00" + password.encode("ascii", errors="ignore"))
            transport.sendto(login_packet)
            login_response = await self._recv_payload(protocol)
            if not login_response or len(login_response) < 2 or login_response[0] != 0x00:
                return False, "No valid BattlEye login response received"
            if login_response[1] != 0x01:
                return False, "BattlEye authentication failed"

            sequence = self._next_sequence()
            command_packet = _wrap_payload(
                b"\x01" + bytes([sequence]) + command.encode("ascii", errors="ignore")
            )
            transport.sendto(command_packet)

            fragments: Dict[int, str] = {}
            expected_parts: Optional[int] = None
            single_response: Optional[str] = None

            while True:
                payload = await self._recv_payload(protocol)
                if payload is None or len(payload) < 2:
                    continue

                packet_type = payload[0]
                packet_sequence = payload[1]

                if packet_type == 0x02:
                    # Server console message; acknowledge and continue waiting.
                    ack = _wrap_payload(b"\x02" + bytes([packet_sequence]))
                    transport.sendto(ack)
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
            transport.close()

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
