"""
RCON bridge service for communicating with Arma Reforger game servers.

Implements the Source RCON protocol over async TCP using
``asyncio.open_connection``.  Each connection is authenticated on first
use and automatically re-established when it drops.

Packet format (little-endian):
    4 bytes  – packet size  (int32, excludes this field itself)
    4 bytes  – request id   (int32)
    4 bytes  – type         (int32: 3=auth, 2=command, 0=response)
    N bytes  – payload      (null-terminated ASCII string)
    1 byte   – empty null terminator
"""

import struct
import logging
import asyncio
from typing import Optional, Tuple, Dict

logger = logging.getLogger(__name__)

# ── Source RCON packet types ────────────────────────────────────────
SERVERDATA_AUTH = 3
SERVERDATA_AUTH_RESPONSE = 2
SERVERDATA_EXECCOMMAND = 2
SERVERDATA_RESPONSE_VALUE = 0

_DEFAULT_TIMEOUT = 10  # seconds


# ── Packet helpers ──────────────────────────────────────────────────

def _build_packet(request_id: int, packet_type: int, payload: str) -> bytes:
    """Build a Source RCON packet ready to send over TCP."""
    payload_bytes = payload.encode("utf-8") + b"\x00\x00"
    size = 4 + 4 + len(payload_bytes)  # id + type + body
    return struct.pack("<iii", size, request_id, packet_type) + payload_bytes


async def _read_packet(
    reader: asyncio.StreamReader,
    timeout: float = _DEFAULT_TIMEOUT,
) -> Tuple[int, int, str]:
    """Read a single Source RCON response packet.

    Returns ``(request_id, packet_type, payload)``.
    """
    size_data = await asyncio.wait_for(reader.readexactly(4), timeout=timeout)
    (size,) = struct.unpack("<i", size_data)

    body = await asyncio.wait_for(reader.readexactly(size), timeout=timeout)

    request_id, packet_type = struct.unpack("<ii", body[:8])
    # Payload sits between the two header ints and the trailing two nulls.
    payload = body[8:-2].decode("utf-8", errors="replace")
    return request_id, packet_type, payload


# ── RCONClient ──────────────────────────────────────────────────────

class RCONClient:
    """Async Source RCON client for a single game-server connection."""

    def __init__(self, host: str, port: int, password: str) -> None:
        self.host = host
        self.port = port
        self._password = password
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._authenticated = False
        self._request_id = 0
        self._lock = asyncio.Lock()

    # ── lifecycle ────────────────────────────────────────────────

    async def connect(self) -> bool:
        """Establish TCP connection and authenticate with the server."""
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=_DEFAULT_TIMEOUT,
            )
            logger.info("TCP connected to %s:%s", self.host, self.port)
            return await self._authenticate()
        except asyncio.TimeoutError:
            logger.error("Connection to %s:%s timed out", self.host, self.port)
            return False
        except OSError as exc:
            logger.error("Connection to %s:%s failed: %s", self.host, self.port, exc)
            return False

    async def disconnect(self) -> None:
        """Gracefully close the underlying TCP connection."""
        self._authenticated = False
        if self._writer is not None:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except OSError:
                pass
            finally:
                self._writer = None
                self._reader = None
        logger.info("Disconnected from %s:%s", self.host, self.port)

    @property
    def is_connected(self) -> bool:
        return self._writer is not None and self._authenticated

    # ── commands ─────────────────────────────────────────────────

    async def send_command(self, command: str) -> str:
        """Send an RCON command and return the server's response string.

        Automatically reconnects once if the connection has been dropped.
        """
        async with self._lock:
            if not self.is_connected:
                if not await self.connect():
                    raise ConnectionError(
                        f"Cannot connect to RCON at {self.host}:{self.port}"
                    )

            try:
                return await self._send(command)
            except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError):
                logger.warning(
                    "RCON connection lost to %s:%s – attempting reconnect",
                    self.host,
                    self.port,
                )
                await self.disconnect()
                if not await self.connect():
                    raise ConnectionError(
                        f"Reconnect to RCON at {self.host}:{self.port} failed"
                    )
                return await self._send(command)

    # ── internals ────────────────────────────────────────────────

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def _authenticate(self) -> bool:
        """Perform the RCON authentication handshake."""
        req_id = self._next_id()
        packet = _build_packet(req_id, SERVERDATA_AUTH, self._password)
        assert self._writer is not None and self._reader is not None

        self._writer.write(packet)
        await self._writer.drain()

        resp_id, _, _ = await _read_packet(self._reader)
        if resp_id == -1:
            logger.error("RCON authentication failed for %s:%s", self.host, self.port)
            self._authenticated = False
            return False

        logger.info("RCON authenticated with %s:%s", self.host, self.port)
        self._authenticated = True
        return True

    async def _send(self, command: str) -> str:
        """Send a command packet and return the response payload."""
        assert self._writer is not None and self._reader is not None

        req_id = self._next_id()
        packet = _build_packet(req_id, SERVERDATA_EXECCOMMAND, command)
        self._writer.write(packet)
        await self._writer.drain()

        resp_id, _, payload = await _read_packet(self._reader)
        if resp_id != req_id:
            logger.warning(
                "RCON response id mismatch (expected %d, got %d)", req_id, resp_id
            )
        return payload


# ── RCONPool ────────────────────────────────────────────────────────

class RCONPool:
    """Maintains a pool of :class:`RCONClient` instances keyed by server id."""

    def __init__(self) -> None:
        self._pool: Dict[str, RCONClient] = {}

    async def get_connection(
        self,
        server_id: str,
        host: str,
        port: int,
        password: str,
    ) -> RCONClient:
        """Return an existing connection or create a new one for *server_id*."""
        client = self._pool.get(server_id)
        if client is not None and client.is_connected:
            return client

        # Replace stale / missing entry
        if client is not None:
            await client.disconnect()

        client = RCONClient(host, port, password)
        if not await client.connect():
            raise ConnectionError(
                f"Failed to establish RCON connection for server {server_id}"
            )

        self._pool[server_id] = client
        return client

    async def execute(
        self,
        server_id: str,
        host: str,
        port: int,
        password: str,
        command: str,
    ) -> Tuple[bool, str]:
        """Execute an RCON command on the given server.

        Returns ``(success, response_or_error)``.
        """
        try:
            client = await self.get_connection(server_id, host, port, password)
            response = await client.send_command(command)
            return True, response
        except Exception as exc:
            logger.error("RCON execute failed for server %s: %s", server_id, exc)
            return False, str(exc)

    async def close_all(self) -> None:
        """Disconnect every client in the pool."""
        for server_id, client in list(self._pool.items()):
            try:
                await client.disconnect()
            except Exception as exc:
                logger.warning(
                    "Error closing RCON connection for %s: %s", server_id, exc
                )
        self._pool.clear()
        logger.info("All RCON connections closed")


# ── Module-level singleton ──────────────────────────────────────────
rcon_pool = RCONPool()
