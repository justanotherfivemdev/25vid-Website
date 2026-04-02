"""
Docker agent service for the Server Management Portal.

Wraps the Docker SDK (docker-py) to manage game-server containers.
All public methods are async — blocking Docker SDK calls are offloaded
to a thread via ``asyncio.to_thread`` so the event loop stays responsive.
"""

import os
import logging
import asyncio
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy Docker client
# ---------------------------------------------------------------------------

_docker_client = None


def _get_client():
    """Return a cached Docker client, creating it on first call.

    Reads ``DOCKER_SOCKET_PATH`` from the environment (falls back to the
    default unix socket).  Returns *None* when the docker package is
    missing or the daemon is unreachable — callers must handle that case.
    """
    global _docker_client
    if _docker_client is not None:
        return _docker_client

    try:
        import docker  # noqa: F811
    except ImportError:
        logger.warning("docker package is not installed — DockerAgent will be non-functional")
        return None

    socket_path = os.environ.get("DOCKER_SOCKET_PATH", "unix:///var/run/docker.sock")
    try:
        _docker_client = docker.DockerClient(base_url=socket_path)
        _docker_client.ping()
        logger.info("Docker client initialised (socket: %s)", socket_path)
    except Exception as exc:
        logger.warning("Unable to connect to Docker daemon at %s: %s", socket_path, exc)
        _docker_client = None

    return _docker_client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CONTAINER_PREFIX = os.environ.get("DOCKER_CONTAINER_PREFIX", "25vid-gs-")


def _get_full_container_name(name: str) -> str:
    """Prepend the project prefix to a bare container name."""
    if name.startswith(CONTAINER_PREFIX):
        return name
    return f"{CONTAINER_PREFIX}{name}"


def _build_port_bindings(ports: Dict) -> Dict[str, int]:
    """Translate the ``ManagedServer.ports`` dict into Docker port bindings.

    Game and query ports are UDP; RCON is TCP.
    """
    bindings: Dict[str, int] = {}
    if "game" in ports:
        bindings[f"{ports['game']}/udp"] = ports["game"]
    if "query" in ports:
        bindings[f"{ports['query']}/udp"] = ports["query"]
    if "rcon" in ports:
        bindings[f"{ports['rcon']}/tcp"] = ports["rcon"]
    return bindings


def _calculate_cpu_percent(stats: dict) -> float:
    """Derive CPU usage % from Docker's ``/containers/{id}/stats`` response.

    Uses the delta approach recommended by the Docker API docs:
        delta_container / delta_system  *  num_cpus  *  100
    """
    try:
        cpu = stats["cpu_stats"]
        pre = stats["precpu_stats"]
        delta_container = cpu["cpu_usage"]["total_usage"] - pre["cpu_usage"]["total_usage"]
        delta_system = cpu["system_cpu_usage"] - pre["system_cpu_usage"]
        num_cpus = len(cpu["cpu_usage"].get("percpu_usage", [])) or cpu.get("online_cpus", 1)
        if delta_system > 0:
            return round((delta_container / delta_system) * num_cpus * 100.0, 2)
    except (KeyError, TypeError, ZeroDivisionError):
        pass
    return 0.0


# ---------------------------------------------------------------------------
# DockerAgent
# ---------------------------------------------------------------------------

class DockerAgent:
    """Async facade over the synchronous Docker SDK."""

    # -- Image management ---------------------------------------------------

    async def pull_image(self, image: str) -> Tuple[bool, Optional[str]]:
        """Pull *image* from the registry.  Returns ``(success, error)``."""
        client = _get_client()
        if client is None:
            return False, "Docker client is not available"
        try:
            await asyncio.to_thread(client.images.pull, image)
            logger.info("Pulled image %s", image)
            return True, None
        except Exception as exc:
            logger.error("Failed to pull image %s: %s", image, exc)
            return False, str(exc)

    # -- Container lifecycle ------------------------------------------------

    async def start_container(self, server: dict) -> Tuple[bool, Optional[str]]:
        """Create and start a container from a *server* config dict.

        The dict is expected to match ``ManagedServer`` fields (image,
        container_name, ports, environment, volumes, config).
        """
        client = _get_client()
        if client is None:
            return False, "Docker client is not available"

        image = server.get("docker_image", "rouhim/arma-reforger-server")
        container_name = _get_full_container_name(server.get("container_name") or server.get("name", "default"))
        ports = server.get("ports", {})
        environment = server.get("environment", {})
        volumes = server.get("volumes", {})

        try:
            # Pull image if not already present
            try:
                await asyncio.to_thread(client.images.get, image)
            except Exception:
                logger.info("Image %s not found locally — pulling…", image)
                success, err = await self.pull_image(image)
                if not success:
                    return False, f"Image pull failed: {err}"

            port_bindings = _build_port_bindings(ports)

            await asyncio.to_thread(
                client.containers.run,
                image,
                name=container_name,
                detach=True,
                ports=port_bindings,
                environment=environment,
                volumes=volumes,
                restart_policy={"Name": "unless-stopped"},
            )
            logger.info("Started container %s (image=%s)", container_name, image)
            return True, None

        except Exception as exc:
            logger.error("Failed to start container %s: %s", container_name, exc)
            return False, str(exc)

    async def stop_container(self, container_name: str, timeout: int = 30) -> Tuple[bool, Optional[str]]:
        """Gracefully stop a container, force-killing after *timeout* seconds."""
        client = _get_client()
        if client is None:
            return False, "Docker client is not available"

        full_name = _get_full_container_name(container_name)
        try:
            container = await asyncio.to_thread(client.containers.get, full_name)
            await asyncio.to_thread(container.stop, timeout=timeout)
            logger.info("Stopped container %s", full_name)
            return True, None
        except Exception as exc:
            # Attempt a force kill as a last resort
            try:
                container = await asyncio.to_thread(client.containers.get, full_name)
                await asyncio.to_thread(container.kill)
                logger.warning("Force-killed container %s after stop failed", full_name)
                return True, None
            except Exception as kill_exc:
                logger.error("Failed to stop/kill container %s: %s / %s", full_name, exc, kill_exc)
                return False, str(exc)

    async def restart_container(self, container_name: str, timeout: int = 30) -> Tuple[bool, Optional[str]]:
        """Restart a container (stop then start)."""
        client = _get_client()
        if client is None:
            return False, "Docker client is not available"

        full_name = _get_full_container_name(container_name)
        try:
            container = await asyncio.to_thread(client.containers.get, full_name)
            await asyncio.to_thread(container.restart, timeout=timeout)
            logger.info("Restarted container %s", full_name)
            return True, None
        except Exception as exc:
            logger.error("Failed to restart container %s: %s", full_name, exc)
            return False, str(exc)

    async def remove_container(self, container_name: str, force: bool = False) -> Tuple[bool, Optional[str]]:
        """Remove a container.  Set *force* to remove a running container."""
        client = _get_client()
        if client is None:
            return False, "Docker client is not available"

        full_name = _get_full_container_name(container_name)
        try:
            container = await asyncio.to_thread(client.containers.get, full_name)
            await asyncio.to_thread(container.remove, force=force)
            logger.info("Removed container %s (force=%s)", full_name, force)
            return True, None
        except Exception as exc:
            logger.error("Failed to remove container %s: %s", full_name, exc)
            return False, str(exc)

    # -- Introspection ------------------------------------------------------

    async def get_container_status(self, container_name: str) -> Optional[Dict[str, Any]]:
        """Return status details for a container, or *None* if not found."""
        client = _get_client()
        if client is None:
            return None

        full_name = _get_full_container_name(container_name)
        try:
            container = await asyncio.to_thread(client.containers.get, full_name)
            await asyncio.to_thread(container.reload)
            state = container.attrs.get("State", {})
            return {
                "status": state.get("Status", "unknown"),
                "running": state.get("Running", False),
                "health": state.get("Health", {}).get("Status", "none"),
                "started_at": state.get("StartedAt"),
            }
        except Exception as exc:
            logger.debug("Container %s not found or inaccessible: %s", full_name, exc)
            return None

    async def get_container_runtime_details(self, container_name: str) -> Optional[Dict[str, Any]]:
        """Return runtime details for a container, including actual name and mounts."""
        client = _get_client()
        if client is None:
            return None

        full_name = _get_full_container_name(container_name)
        try:
            container = await asyncio.to_thread(client.containers.get, full_name)
            await asyncio.to_thread(container.reload)
            state = container.attrs.get("State", {})
            config = container.attrs.get("Config", {})
            mounts = [
                {
                    "source": mount.get("Source"),
                    "destination": mount.get("Destination"),
                    "mode": mount.get("Mode"),
                    "rw": mount.get("RW"),
                }
                for mount in container.attrs.get("Mounts", [])
            ]
            return {
                "actual_container_name": container.name,
                "requested_container_name": full_name,
                "status": state.get("Status", "unknown"),
                "running": state.get("Running", False),
                "started_at": state.get("StartedAt"),
                "working_dir": config.get("WorkingDir", ""),
                "mounts": mounts,
            }
        except Exception as exc:
            logger.debug("Could not inspect runtime details for %s: %s", full_name, exc)
            return None

    async def get_container_logs(
        self,
        container_name: str,
        tail: int = 200,
        since: Optional[int] = None,
    ) -> str:
        """Return recent log output for a container (empty string on error)."""
        client = _get_client()
        if client is None:
            return ""

        full_name = _get_full_container_name(container_name)
        try:
            container = await asyncio.to_thread(client.containers.get, full_name)
            kwargs: Dict[str, Any] = {"tail": tail, "timestamps": True}
            if since is not None:
                kwargs["since"] = since
            log_bytes = await asyncio.to_thread(container.logs, **kwargs)
            return log_bytes.decode("utf-8", errors="replace") if isinstance(log_bytes, bytes) else str(log_bytes)
        except Exception as exc:
            logger.error("Failed to fetch logs for %s: %s", full_name, exc)
            return ""

    async def get_container_ip(self, container_name: str) -> Optional[str]:
        """Return the IP address of a container on its first network, or *None*."""
        client = _get_client()
        if client is None:
            return None

        full_name = _get_full_container_name(container_name)
        try:
            container = await asyncio.to_thread(client.containers.get, full_name)
            await asyncio.to_thread(container.reload)
            networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
            for _net_name, net_info in networks.items():
                ip = net_info.get("IPAddress")
                if ip:
                    return ip
        except Exception as exc:
            logger.debug("Could not resolve IP for %s: %s", full_name, exc)
        return None

    async def get_container_stats(self, container_name: str) -> Optional[Dict[str, Any]]:
        """Return a snapshot of CPU / memory / network stats, or *None*."""
        client = _get_client()
        if client is None:
            return None

        full_name = _get_full_container_name(container_name)
        try:
            container = await asyncio.to_thread(client.containers.get, full_name)
            stats = await asyncio.to_thread(container.stats, stream=False)

            cpu_percent = _calculate_cpu_percent(stats)

            mem = stats.get("memory_stats", {})
            memory_mb = round(mem.get("usage", 0) / (1024 * 1024), 2)
            memory_limit_mb = round(mem.get("limit", 0) / (1024 * 1024), 2)

            networks = stats.get("networks", {})
            network_rx = sum(iface.get("rx_bytes", 0) for iface in networks.values())
            network_tx = sum(iface.get("tx_bytes", 0) for iface in networks.values())

            return {
                "cpu_percent": cpu_percent,
                "memory_mb": memory_mb,
                "memory_limit_mb": memory_limit_mb,
                "network_rx": network_rx,
                "network_tx": network_tx,
            }
        except Exception as exc:
            logger.error("Failed to fetch stats for %s: %s", full_name, exc)
            return None
