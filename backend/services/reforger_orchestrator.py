"""High-level orchestration for Docker-backed Arma Reforger servers."""

from __future__ import annotations

import asyncio
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from config import (
    SERVER_CONFIG_FILENAME,
    SERVER_DATA_ROOT,
    SERVER_DOCKER_IMAGE,
    SERVER_PROFILE_POLL_SECONDS,
    SERVER_PROFILE_READY_TIMEOUT_SECONDS,
    SERVER_SAT_BASELINE_PATH,
)
from services.docker_agent import DockerAgent
from services.sat_config_service import (
    discover_sat_config,
    overlay_baseline_if_configured,
)
from services.server_config_generator import generate_reforger_config, write_config_file

logger = logging.getLogger(__name__)

docker_agent = DockerAgent()


@dataclass
class ProvisioningLayout:
    data_root: Path
    configs_path: Path
    profile_path: Path
    workshop_path: Path
    diagnostics_path: Path
    config_path: Path


class ProvisioningError(RuntimeError):
    def __init__(self, step: str, message: str):
        super().__init__(message)
        self.step = step
        self.message = message


def build_container_name(server_id: str) -> str:
    return f"reforger-{server_id}"


def build_layout(server_id: str) -> ProvisioningLayout:
    root = SERVER_DATA_ROOT / server_id
    return ProvisioningLayout(
        data_root=root,
        configs_path=root / "Configs",
        profile_path=root / "profile",
        workshop_path=root / "workshop",
        diagnostics_path=root / "diagnostics",
        config_path=root / "Configs" / SERVER_CONFIG_FILENAME,
    )


def apply_runtime_defaults(server: Dict[str, Any]) -> Dict[str, Any]:
    layout = build_layout(server["id"])
    updated = dict(server)
    updated.setdefault("docker_image", SERVER_DOCKER_IMAGE)
    updated["container_name"] = updated.get("container_name") or build_container_name(server["id"])
    updated["data_root"] = str(layout.data_root)
    updated["config_path"] = str(layout.config_path)
    updated["profile_path"] = str(layout.profile_path)
    updated["workshop_path"] = str(layout.workshop_path)
    updated["diagnostics_path"] = str(layout.diagnostics_path)
    return updated


async def ensure_filesystem(server: Dict[str, Any]) -> ProvisioningLayout:
    layout = build_layout(server["id"])
    for path in (
        layout.data_root,
        layout.configs_path,
        layout.profile_path,
        layout.workshop_path,
        layout.diagnostics_path,
    ):
        path.mkdir(parents=True, exist_ok=True)
    return layout


def build_container_environment(server: Dict[str, Any]) -> Dict[str, str]:
    config = generate_reforger_config(server)
    rcon = config.get("rcon") or {}
    return {
        "ARMA_CONFIG": SERVER_CONFIG_FILENAME,
        "ARMA_PROFILE": "/home/profile",
        "ARMA_WORKSHOP_DIR": "/reforger/workshop",
        "RCON_PASSWORD": str(rcon.get("password") or ""),
        "RCON_PERMISSION": str(rcon.get("permission") or "admin"),
    }


def build_container_volumes(server: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
    return {
        str(Path(server["config_path"]).parent): {
            "bind": "/reforger/Configs",
            "mode": "rw",
        },
        server["profile_path"]: {"bind": "/home/profile", "mode": "rw"},
        server["workshop_path"]: {"bind": "/reforger/workshop", "mode": "rw"},
    }


async def ensure_container(server: Dict[str, Any]) -> Dict[str, Any]:
    environment = build_container_environment(server)
    volumes = build_container_volumes(server)
    ok, result = await docker_agent.create_container(
        image=server["docker_image"],
        container_name=server["container_name"],
        ports=server["ports"],
        environment=environment,
        volumes=volumes,
    )
    if not ok:
        raise ProvisioningError("creating_container", result)

    details = await docker_agent.inspect_container(server["container_name"])
    if details is None:
        raise ProvisioningError("creating_container", "Container was created but could not be inspected")
    return {
        "container_id": details["id"],
        "environment": environment,
        "volumes": {host: mount["bind"] for host, mount in volumes.items()},
        "last_known_container_status": details["status"],
    }


async def wait_for_profile_and_sat(server: Dict[str, Any]) -> Dict[str, Any]:
    profile_root = Path(server["profile_path"])
    deadline = asyncio.get_running_loop().time() + SERVER_PROFILE_READY_TIMEOUT_SECONDS
    saw_profile = False

    while asyncio.get_running_loop().time() < deadline:
        if profile_root.exists() and any(profile_root.iterdir()):
            saw_profile = True
            sat_path, sat_state = discover_sat_config(server["profile_path"])
            if sat_path:
                try:
                    baseline_applied = overlay_baseline_if_configured(sat_path)
                except OSError as exc:
                    raise ProvisioningError(
                        "applying_sat_config",
                        f"Failed to deploy ServerAdminTools_Config.json: {exc}",
                    ) from exc
                if SERVER_SAT_BASELINE_PATH and not baseline_applied:
                    raise ProvisioningError(
                        "applying_sat_config",
                        f"Configured SAT baseline file does not exist: {SERVER_SAT_BASELINE_PATH}",
                    )
                return {
                    "sat_config_path": sat_path,
                    "sat_status": "configured" if baseline_applied else "discovered",
                    "readiness_state": "ready",
                    "provisioning_state": "ready",
                    "provisioning_step": "ready",
                }
        await asyncio.sleep(SERVER_PROFILE_POLL_SECONDS)

    if saw_profile:
        raise ProvisioningError(
            "waiting_for_sat_config",
            "Server profile structure was generated but ServerAdminTools_Config.json was not discovered before the provisioning timeout",
        )
    raise ProvisioningError(
        "waiting_for_profile",
        "Server profile structure was not generated before the provisioning timeout",
    )


async def provision_server(server: Dict[str, Any]) -> Dict[str, Any]:
    server = apply_runtime_defaults(server)
    await ensure_filesystem(server)

    ok, config_result = await write_config_file(server)
    if not ok:
        raise ProvisioningError("writing_config", config_result)

    runtime_updates = await ensure_container(server)
    ok, error = await docker_agent.start_existing_container(server["container_name"])
    if not ok:
        raise ProvisioningError("starting_container", error or "Failed to start container")

    artifact_updates = await wait_for_profile_and_sat(server)
    return {
        **runtime_updates,
        **artifact_updates,
        "status": "running",
        "config_path": config_result,
        "data_root": server["data_root"],
        "profile_path": server["profile_path"],
        "workshop_path": server["workshop_path"],
        "diagnostics_path": server["diagnostics_path"],
        "docker_image": server["docker_image"],
        "container_name": server["container_name"],
        "ports": server["ports"],
        "port_allocations": server["ports"],
    }


async def start_server(server: Dict[str, Any]) -> Dict[str, Any]:
    server = apply_runtime_defaults(server)
    await ensure_filesystem(server)

    ok, config_result = await write_config_file(server)
    if not ok:
        raise ProvisioningError("writing_config", config_result)

    runtime_updates = await ensure_container(server)
    ok, error = await docker_agent.start_existing_container(server["container_name"])
    if not ok:
        raise ProvisioningError("starting_container", error or "Failed to start container")

    details = await docker_agent.inspect_container(server["container_name"])
    sat_path, sat_state = discover_sat_config(server["profile_path"])
    return {
        **runtime_updates,
        "status": "running",
        "config_path": config_result,
        "last_known_container_status": (details or {}).get("status", "running"),
        "sat_config_path": sat_path or "",
        "sat_status": sat_state,
        "readiness_state": "ready" if sat_state == "discovered" else "degraded",
    }


async def stop_server(server: Dict[str, Any]) -> Dict[str, Any]:
    ok, error = await docker_agent.stop_container(server["container_name"])
    if not ok:
        raise ProvisioningError("stopping_container", error or "Failed to stop container")
    return {
        "status": "stopped",
        "last_known_container_status": "exited",
        "readiness_state": "pending",
    }


async def restart_server(server: Dict[str, Any]) -> Dict[str, Any]:
    ok, error = await docker_agent.restart_container(server["container_name"])
    if not ok:
        raise ProvisioningError("restarting_container", error or "Failed to restart container")
    details = await docker_agent.inspect_container(server["container_name"])
    sat_path, sat_state = discover_sat_config(server["profile_path"])
    return {
        "status": "running",
        "last_known_container_status": (details or {}).get("status", "running"),
        "sat_config_path": sat_path or "",
        "sat_status": sat_state,
        "readiness_state": "ready" if sat_state == "discovered" else "degraded",
    }


async def delete_server(server: Dict[str, Any]) -> None:
    await docker_agent.remove_container(server["container_name"], force=True)
    if server.get("data_root"):
        shutil.rmtree(server["data_root"], ignore_errors=True)


async def get_diagnostics(server: Dict[str, Any]) -> Dict[str, Any]:
    details = await docker_agent.inspect_container(server["container_name"])
    return {
        "container_name": server.get("container_name", ""),
        "container_id": server.get("container_id", "") or (details or {}).get("id", ""),
        "image": server.get("docker_image", ""),
        "status": server.get("status", "created"),
        "provisioning_state": server.get("provisioning_state", "pending"),
        "provisioning_step": server.get("provisioning_step", "pending"),
        "readiness_state": server.get("readiness_state", "pending"),
        "last_docker_error": server.get("last_docker_error", ""),
        "ports": server.get("ports", {}),
        "paths": {
            "data_root": server.get("data_root", ""),
            "config_path": server.get("config_path", ""),
            "profile_path": server.get("profile_path", ""),
            "workshop_path": server.get("workshop_path", ""),
            "diagnostics_path": server.get("diagnostics_path", ""),
            "sat_config_path": server.get("sat_config_path", ""),
        },
        "mounts": (details or {}).get("mounts", []),
        "docker": details,
    }
