import asyncio

import pytest

import services.rcon_bridge as rcon_bridge
from services.rcon_bridge import BERConClient, _parse_packet, _wrap_payload


class FakeBERconServer(asyncio.DatagramProtocol):
    def __init__(
        self,
        password: str,
        mode: str = "single",
        require_console_ack: bool = False,
    ) -> None:
        self.password = password
        self.mode = mode
        self.require_console_ack = require_console_ack
        self.transport: asyncio.DatagramTransport | None = None
        self.client_addr = None
        self.ack_received = asyncio.Event()
        self._pending_sequence: int | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, addr) -> None:
        payload = _parse_packet(data)
        if payload is None or len(payload) < 1 or self.transport is None:
            return

        self.client_addr = addr
        packet_type = payload[0]

        if packet_type == 0x00:
            sent_password = payload[1:].decode("ascii", errors="ignore")
            login_ok = sent_password == self.password
            login_response = _wrap_payload(b"\x00" + (b"\x01" if login_ok else b"\x00"))
            self.transport.sendto(login_response, addr)
            return

        if packet_type == 0x01 and len(payload) >= 2:
            sequence = payload[1]
            if self.mode == "timeout":
                return

            if self.require_console_ack:
                self._pending_sequence = sequence
                self.transport.sendto(_wrap_payload(b"\x02" + b"\x63" + b"log"), addr)
                return

            self._send_command_response(sequence, addr)
            return

        if packet_type == 0x02 and len(payload) >= 2:
            if payload[1] == 0x63:
                self.ack_received.set()
                if self._pending_sequence is not None:
                    self._send_command_response(self._pending_sequence, addr)
                    self._pending_sequence = None

    def _send_command_response(self, sequence: int, addr) -> None:
        if self.transport is None:
            return

        if self.mode == "fragmented":
            frag0 = _wrap_payload(b"\x01" + bytes([sequence]) + b"\x00\x02\x00Hello ")
            frag1 = _wrap_payload(b"\x01" + bytes([sequence]) + b"\x00\x02\x01World")
            self.transport.sendto(frag0, addr)
            self.transport.sendto(frag1, addr)
            return

        self.transport.sendto(_wrap_payload(b"\x01" + bytes([sequence]) + b"OK"), addr)


async def _run_case(mode: str = "single", require_console_ack: bool = False):
    loop = asyncio.get_running_loop()
    server = FakeBERconServer(password="secret", mode=mode, require_console_ack=require_console_ack)
    transport, _ = await loop.create_datagram_endpoint(
        lambda: server,
        local_addr=("127.0.0.1", 0),
    )
    host, port = transport.get_extra_info("sockname")

    client = BERConClient()
    try:
        result = await client.execute(host, port, "secret", "#restart")
        return result, server
    finally:
        transport.close()


def test_auth_and_command_roundtrip_success():
    (ok, response), _ = asyncio.run(_run_case(mode="single"))
    assert ok is True
    assert response == "OK"


def test_fragmented_response_and_console_ack():
    async def _scenario():
        result, server = await _run_case(mode="fragmented", require_console_ack=True)
        await asyncio.wait_for(server.ack_received.wait(), timeout=0.5)
        return result

    ok, response = asyncio.run(_scenario())
    assert ok is True
    assert response == "Hello World"


def test_timeout_returns_expected_failure(monkeypatch):
    monkeypatch.setattr(rcon_bridge, "RCON_TIMEOUT_SECONDS", 0.05)
    ok, response = asyncio.run(_run_case(mode="timeout"))[0]
    assert ok is False
    assert "timed out" in response.lower()


def test_execute_works_when_loop_sock_methods_are_unavailable(monkeypatch):
    async def _scenario():
        loop = asyncio.get_running_loop()

        async def _boom(*args, **kwargs):
            raise NotImplementedError("legacy socket path is unavailable")

        try:
            monkeypatch.setattr(loop, "sock_sendto", _boom, raising=False)
        except (AttributeError, TypeError):
            pass
        try:
            monkeypatch.setattr(loop, "sock_recvfrom", _boom, raising=False)
        except (AttributeError, TypeError):
            pass

        (ok, response), _ = await _run_case(mode="single")
        return ok, response

    ok, response = asyncio.run(_scenario())
    assert ok is True
    assert response == "OK"
