"""Async Docker facade for local Arma Reforger container orchestration."""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Dict, Optional, Tuple

from config import DOCKER_SOCKET_PATH

logger = logging.getLogger(__name__)

_docker_client = None


def _get_client():
    global _docker_client
    if _docker_client is not None:
        return _docker_client

    try:
        import docker
    except ImportError:
        logger.warning("docker package is not installed")
        return None

    try:
        _docker_client = docker.DockerClient(base_url=DOCKER_SOCKET_PATH)
        _docker_client.ping()
    except Exception as exc:
        logger.warning("Unable to connect to Docker daemon at %s: %s", DOCKER_SOCKET_PATH, exc)
        _docker_client = None
    return _docker_client


def _cpu_core_count(stats: dict) -> int:
    try:
        cpu = stats["cpu_stats"]
        return len(cpu["cpu_usage"].get("percpu_usage", [])) or int(cpu.get("online_cpus") or 1)
    except (KeyError, TypeError, ValueError):
        return 1


def _calculate_cpu_percent(stats: dict) -> float:
    try:
        cpu = stats["cpu_stats"]
        pre = stats["precpu_stats"]
        delta_container = cpu["cpu_usage"]["total_usage"] - pre["cpu_usage"]["total_usage"]
        delta_system = cpu["system_cpu_usage"] - pre["system_cpu_usage"]
        num_cpus = _cpu_core_count(stats)
        if delta_system > 0:
            return round((delta_container / delta_system) * num_cpus * 100.0, 2)
    except (KeyError, TypeError, ZeroDivisionError):
        return 0.0
    return 0.0


def _normalize_host_cpu_percent(raw_cpu_percent: float, cpu_core_count: int) -> float:
    if cpu_core_count <= 0:
        return round(raw_cpu_percent, 2)
    return round(max(0.0, raw_cpu_percent / cpu_core_count), 2)


class DockerAgent:
    async def ping(self) -> Tuple[bool, Optional[str]]:
        client = _get_client()
        if client is None:
            return False, "Docker client is not available"
        try:
            await asyncio.to_thread(client.ping)
            return True, None
        except Exception as exc:
            logger.error("Failed to ping Docker daemon: %s", exc)
            return False, str(exc)

    async def ensure_image(self, image: str) -> Tuple[bool, Optional[str]]:
        client = _get_client()
        if client is None:
            return False, "Docker client is not available"
        try:
            await asyncio.to_thread(client.images.get, image)
            return True, None
        except Exception:
            try:
                await asyncio.to_thread(client.images.pull, image)
                return True, None
            except Exception as exc:
                logger.error("Failed to pull image %s: %s", image, exc)
                return False, str(exc)

    async def get_container(self, container_name: str):
        client = _get_client()
        if client is None:
            return None
        try:
            return await asyncio.to_thread(client.containers.get, container_name)
        except Exception:
            return None

    async def create_container(
        self,
        *,
        image: str,
        container_name: str,
        ports: Dict[str, int],
        environment: Dict[str, str],
        volumes: Dict[str, Dict[str, str]],
    ) -> Tuple[bool, str]:
        client = _get_client()
        if client is None:
            return False, "Docker client is not available"

        ok, error = await self.ensure_image(image)
        if not ok:
            return False, error or "Failed to pull image"

        existing = await self.get_container(container_name)
        if existing is not None:
            return True, getattr(existing, "id", "")

        try:
            container = await asyncio.to_thread(
                client.containers.create,
                image=image,
                name=container_name,
                detach=True,
                ports={
                    f"{ports['game']}/udp": ports["game"],
                    f"{ports['query']}/udp": ports["query"],
                    f"{ports['rcon']}/udp": ports["rcon"],
                },
                environment=environment,
                volumes=volumes,
                restart_policy={"Name": "unless-stopped"},
                tty=False,
                stdin_open=False,
            )
            logger.info("Created container %s (%s)", container_name, container.id)
            return True, container.id
        except Exception as exc:
            logger.error("Failed to create container %s: %s", container_name, exc)
            return False, str(exc)

    async def start_existing_container(self, container_name: str) -> Tuple[bool, Optional[str]]:
        container = await self.get_container(container_name)
        if container is None:
            return False, "Container does not exist"
        try:
            await asyncio.to_thread(container.start)
            await asyncio.to_thread(container.reload)
            return True, None
        except Exception as exc:
            logger.error("Failed to start container %s: %s", container_name, exc)
            return False, str(exc)

    async def stop_container(self, container_name: str, timeout: int = 30) -> Tuple[bool, Optional[str]]:
        container = await self.get_container(container_name)
        if container is None:
            return False, "Container does not exist"
        try:
            await asyncio.to_thread(container.stop, timeout=timeout)
            return True, None
        except Exception as exc:
            logger.error("Failed to stop container %s: %s", container_name, exc)
            return False, str(exc)

    async def restart_container(self, container_name: str, timeout: int = 30) -> Tuple[bool, Optional[str]]:
        container = await self.get_container(container_name)
        if container is None:
            return False, "Container does not exist"
        try:
            await asyncio.to_thread(container.restart, timeout=timeout)
            return True, None
        except Exception as exc:
            logger.error("Failed to restart container %s: %s", container_name, exc)
            return False, str(exc)

    async def remove_container(self, container_name: str, force: bool = False) -> Tuple[bool, Optional[str]]:
        container = await self.get_container(container_name)
        if container is None:
            return True, None
        try:
            await asyncio.to_thread(container.remove, force=force)
            return True, None
        except Exception as exc:
            logger.error("Failed to remove container %s: %s", container_name, exc)
            return False, str(exc)

    async def inspect_container(self, container_name: str) -> Optional[Dict[str, Any]]:
        container = await self.get_container(container_name)
        if container is None:
            return None
        try:
            await asyncio.to_thread(container.reload)
            attrs = container.attrs
            state = attrs.get("State", {})
            network = attrs.get("NetworkSettings", {})
            ports = network.get("Ports", {})
            mounts = attrs.get("Mounts", [])
            return {
                "id": container.id,
                "name": attrs.get("Name", "").lstrip("/"),
                "image": attrs.get("Config", {}).get("Image", ""),
                "status": state.get("Status", "unknown"),
                "running": state.get("Running", False),
                "started_at": state.get("StartedAt"),
                "finished_at": state.get("FinishedAt"),
                "exit_code": state.get("ExitCode"),
                "mounts": mounts,
                "ports": ports,
            }
        except Exception as exc:
            logger.error("Failed to inspect container %s: %s", container_name, exc)
            return None

    async def get_container_status(self, container_name: str) -> Optional[Dict[str, Any]]:
        details = await self.inspect_container(container_name)
        if details is None:
            return None
        return {
            "status": details["status"],
            "running": details["running"],
            "started_at": details["started_at"],
        }

    async def get_container_logs(
        self,
        container_name: str,
        tail: int = 200,
        since: Optional[int] = None,
    ) -> str:
        container = await self.get_container(container_name)
        if container is None:
            return ""
        try:
            kwargs: Dict[str, Any] = {"tail": tail, "timestamps": True}
            if since is not None:
                kwargs["since"] = since
            log_bytes = await asyncio.to_thread(container.logs, **kwargs)
            if isinstance(log_bytes, bytes):
                return log_bytes.decode("utf-8", errors="replace")
            return str(log_bytes)
        except Exception as exc:
            logger.error("Failed to fetch logs for %s: %s", container_name, exc)
            return ""

    async def stream_container_logs(
        self,
        container_name: str,
        *,
        tail: int = 0,
        since: Optional[int] = None,
    ):
        container = await self.get_container(container_name)
        if container is None:
            return

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Optional[str]] = asyncio.Queue()
        stop_event = threading.Event()

        def _pump_logs() -> None:
            stream = None
            try:
                kwargs: Dict[str, Any] = {
                    "stream": True,
                    "follow": True,
                    "timestamps": True,
                    "tail": tail,
                }
                if since is not None:
                    kwargs["since"] = since
                stream = container.logs(**kwargs)
                for chunk in stream:
                    if stop_event.is_set():
                        break
                    text = chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else str(chunk)
                    asyncio.run_coroutine_threadsafe(queue.put(text), loop)
            except Exception as exc:
                logger.error("Failed to stream logs for %s: %s", container_name, exc)
            finally:
                if hasattr(stream, "close"):
                    try:
                        stream.close()
                    except Exception:
                        pass
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        worker = threading.Thread(target=_pump_logs, name=f"log-stream-{container_name}", daemon=True)
        worker.start()

        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            stop_event.set()

    async def get_container_ip(self, container_name: str) -> Optional[str]:
        container = await self.get_container(container_name)
        if container is None:
            return None
        try:
            await asyncio.to_thread(container.reload)
            networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
            for net_info in networks.values():
                ip = net_info.get("IPAddress")
                if ip:
                    return ip
        except Exception as exc:
            logger.debug("Could not resolve IP for %s: %s", container_name, exc)
        return None

    async def get_container_stats(self, container_name: str) -> Optional[Dict[str, Any]]:
        container = await self.get_container(container_name)
        if container is None:
            return None
        try:
            stats = await asyncio.to_thread(container.stats, stream=False)
            mem = stats.get("memory_stats", {})
            networks = stats.get("networks", {})
            cpu_raw_percent = _calculate_cpu_percent(stats)
            cpu_core_count = _cpu_core_count(stats)
            return {
                "cpu_percent": cpu_raw_percent,
                "cpu_raw_percent": cpu_raw_percent,
                "cpu_host_percent": _normalize_host_cpu_percent(cpu_raw_percent, cpu_core_count),
                "cpu_core_count": cpu_core_count,
                "cpu_cores_used": round(cpu_raw_percent / 100.0, 2),
                "memory_mb": round(mem.get("usage", 0) / (1024 * 1024), 2),
                "memory_limit_mb": round(mem.get("limit", 0) / (1024 * 1024), 2),
                "network_rx": sum(iface.get("rx_bytes", 0) for iface in networks.values()),
                "network_tx": sum(iface.get("tx_bytes", 0) for iface in networks.values()),
            }
        except Exception as exc:
            logger.error("Failed to fetch stats for %s: %s", container_name, exc)
            return None
