"""High-level orchestration for Docker-backed Arma Reforger servers."""

from __future__ import annotations

import asyncio
import logging
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

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

# ── Readiness detection ─────────────────────────────────────────────────────
# The Arma Reforger server typically restarts multiple times during first boot
# while downloading and mounting mods.  We use log-based signals to distinguish
# expected restart cycles from actual failures.

# Log patterns that indicate the server has finished initial loading and is
# accepting connections.
_READINESS_LOG_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"Game started", re.IGNORECASE),
    re.compile(r"Scenario loaded", re.IGNORECASE),
    re.compile(r"BattlEye Server:.+?Initialized", re.IGNORECASE),
    re.compile(r"Server is ready", re.IGNORECASE),
]

# Patterns that indicate the server is in a mod download / content mount cycle
# and a restart is expected (not a crash).
_MOD_CYCLE_LOG_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"Downloading mod", re.IGNORECASE),
    re.compile(r"Mounting content", re.IGNORECASE),
    re.compile(r"Workshop.*download", re.IGNORECASE),
    re.compile(r"Addon.*loaded", re.IGNORECASE),
]

# Maximum restart cycles tolerated during initial provisioning before declaring
# a genuine failure.
MAX_PROVISION_RESTART_CYCLES = 5
# Seconds to wait for readiness after initial startup (covers mod download +
# mount + world load phases).
DEFAULT_READINESS_TIMEOUT = 300
# Number of log tail lines to fetch for readiness / mod-cycle checks.
READINESS_LOG_TAIL_LINES = 200
MOD_CYCLE_LOG_TAIL_LINES = 100


# ── Provisioning stage tracking ─────────────────────────────────────────────

@dataclass
class StageResult:
    """Result of a single provisioning stage."""
    name: str
    status: str = "pending"      # pending | success | failed | skipped
    message: str = ""
    error: str = ""

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"name": self.name, "status": self.status}
        if self.message:
            d["message"] = self.message
        if self.error:
            d["error"] = self.error
        return d


@dataclass
class ProvisioningResult:
    """Aggregated result across all provisioning stages."""
    stages: List[StageResult] = field(default_factory=list)
    updates: Dict[str, Any] = field(default_factory=dict)

    @property
    def all_succeeded(self) -> bool:
        return all(s.status == "success" for s in self.stages)

    @property
    def container_started(self) -> bool:
        """True if at least container creation and startup succeeded."""
        for s in self.stages:
            if s.name in ("container_creation", "initial_startup") and s.status != "success":
                return False
        return any(s.name == "initial_startup" and s.status == "success" for s in self.stages)

    @property
    def failed_stages(self) -> List[StageResult]:
        return [s for s in self.stages if s.status == "failed"]

    def stages_dict(self) -> Dict[str, Any]:
        return {s.name: s.to_dict() for s in self.stages}

    @property
    def overall_status(self) -> str:
        if self.all_succeeded:
            return "running"
        if self.container_started:
            return "provisioning_partial"
        return "provisioning_failed"

    @property
    def provisioning_state(self) -> str:
        if self.all_succeeded:
            return "ready"
        if self.container_started:
            return "partial"
        return "failed"

    @property
    def readiness_state(self) -> str:
        if self.all_succeeded:
            return "ready"
        if self.container_started:
            return "degraded"
        return "failed"

    @property
    def summary_message(self) -> str:
        if self.all_succeeded:
            return "All provisioning stages completed successfully."
        failed = self.failed_stages
        names = [s.name for s in failed]
        if self.container_started:
            return f"Server started but the following stages failed: {', '.join(names)}"
        return f"Provisioning failed at: {', '.join(names)}"


@dataclass
class ProvisioningLayout:
    data_root: Path
    configs_path: Path
    profile_path: Path
    workshop_path: Path
    diagnostics_path: Path
    config_path: Path


class ProvisioningError(RuntimeError):
    def __init__(self, step: str, message: str, stages: Dict[str, Any] | None = None):
        super().__init__(message)
        self.step = step
        self.message = message
        self.stages = stages or {}


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


async def _check_server_readiness(container_name: str) -> bool:
    """Check if the server is ready by scanning recent container logs.

    Returns True if any readiness log pattern is found, indicating the
    scenario has loaded and the server is accepting connections.
    """
    try:
        logs = await docker_agent.get_container_logs(container_name, tail=READINESS_LOG_TAIL_LINES)
    except Exception:
        return False
    if not logs:
        return False
    for pattern in _READINESS_LOG_PATTERNS:
        if pattern.search(logs):
            return True
    return False


def is_in_mod_cycle(logs: str) -> bool:
    """Check if recent logs indicate a mod download / mount cycle."""
    if not logs:
        return False
    for pattern in _MOD_CYCLE_LOG_PATTERNS:
        if pattern.search(logs):
            return True
    return False


async def wait_for_server_readiness(
    server: Dict[str, Any],
    timeout: int = DEFAULT_READINESS_TIMEOUT,
) -> Dict[str, Any]:
    """Wait for the server to become fully ready, tolerating restart cycles.

    During initial provisioning, the Arma Reforger server may restart several
    times while downloading mods and mounting content.  This function tracks
    restart cycles via container status and log inspection, only declaring
    failure when the restart budget is exhausted without any readiness signal.

    Returns a dict with readiness information.
    """
    container_name = server["container_name"]
    deadline = asyncio.get_running_loop().time() + timeout
    restart_count = 0

    while asyncio.get_running_loop().time() < deadline:
        # Check container status
        status_info = await docker_agent.get_container_status(container_name)
        container_running = status_info is not None and status_info.get("running", False)

        if container_running:
            # Check if the server has signalled readiness via logs
            if await _check_server_readiness(container_name):
                return {
                    "server_ready": True,
                    "restart_cycles": restart_count,
                    "readiness_state": "ready",
                }
        else:
            # Container is not running — could be a restart cycle
            try:
                logs = await docker_agent.get_container_logs(container_name, tail=MOD_CYCLE_LOG_TAIL_LINES)
            except Exception:
                logs = ""

            if is_in_mod_cycle(logs):
                restart_count += 1
                logger.info(
                    "Server %s restart cycle %d/%d detected (mod download/mount)",
                    container_name, restart_count, MAX_PROVISION_RESTART_CYCLES,
                )
                if restart_count > MAX_PROVISION_RESTART_CYCLES:
                    return {
                        "server_ready": False,
                        "restart_cycles": restart_count,
                        "readiness_state": "failed",
                        "error": f"Exceeded maximum restart cycles ({MAX_PROVISION_RESTART_CYCLES})",
                    }
                # Attempt to restart the container for the next cycle
                await docker_agent.start_existing_container(container_name)

        await asyncio.sleep(SERVER_PROFILE_POLL_SECONDS)

    # Timeout reached — check one final time
    if await _check_server_readiness(container_name):
        return {
            "server_ready": True,
            "restart_cycles": restart_count,
            "readiness_state": "ready",
        }
    return {
        "server_ready": False,
        "restart_cycles": restart_count,
        "readiness_state": "degraded",
        "error": f"Server did not signal readiness within {timeout}s",
    }


async def wait_for_profile_and_sat(server: Dict[str, Any]) -> Dict[str, Any]:
    """Wait for server profile generation and SAT config discovery.

    SAT (Server Admin Tools) initialization is gated behind server readiness:
    we first wait for the server to finish its initial startup cycle (including
    mod downloads and content mounting) before attempting SAT discovery.  This
    prevents false errors from SAT probing an incomplete profile during early
    restart cycles.
    """
    container_name = server.get("container_name", "")
    profile_root = Path(server["profile_path"])
    deadline = asyncio.get_running_loop().time() + SERVER_PROFILE_READY_TIMEOUT_SECONDS
    saw_profile = False
    server_became_ready = False

    # Phase 1: Wait for server readiness before SAT discovery
    if container_name:
        readiness = await wait_for_server_readiness(
            server,
            timeout=min(DEFAULT_READINESS_TIMEOUT, SERVER_PROFILE_READY_TIMEOUT_SECONDS),
        )
        server_became_ready = readiness.get("server_ready", False)
        if readiness.get("restart_cycles", 0) > 0:
            logger.info(
                "Server %s completed %d restart cycle(s) during initial provisioning",
                container_name, readiness["restart_cycles"],
            )

    # Phase 2: Now probe for profile and SAT config
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
                    "readiness_state": "ready" if server_became_ready else "degraded",
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

    result = ProvisioningResult()

    # ── Stage: config_generation ──
    config_stage = StageResult(name="config_generation")
    result.stages.append(config_stage)
    try:
        ok, config_result = await write_config_file(server)
        if not ok:
            config_stage.status = "failed"
            config_stage.error = config_result
            raise ProvisioningError("writing_config", config_result, result.stages_dict())
        config_stage.status = "success"
        config_stage.message = f"Config written to {config_result}"
    except ProvisioningError:
        raise
    except Exception as exc:
        config_stage.status = "failed"
        config_stage.error = str(exc)
        raise ProvisioningError("writing_config", str(exc), result.stages_dict()) from exc

    # ── Stage: container_creation ──
    container_stage = StageResult(name="container_creation")
    result.stages.append(container_stage)
    try:
        runtime_updates = await ensure_container(server)
        container_stage.status = "success"
        container_stage.message = f"Container {server['container_name']} created"
        result.updates.update(runtime_updates)
    except ProvisioningError as exc:
        container_stage.status = "failed"
        container_stage.error = exc.message
        raise ProvisioningError(exc.step, exc.message, result.stages_dict()) from exc
    except Exception as exc:
        container_stage.status = "failed"
        container_stage.error = str(exc)
        raise ProvisioningError("creating_container", str(exc), result.stages_dict()) from exc

    # ── Stage: initial_startup ──
    startup_stage = StageResult(name="initial_startup")
    result.stages.append(startup_stage)
    try:
        ok, error = await docker_agent.start_existing_container(server["container_name"])
        if not ok:
            startup_stage.status = "failed"
            startup_stage.error = error or "Failed to start container"
            raise ProvisioningError("starting_container", error or "Failed to start container", result.stages_dict())
        startup_stage.status = "success"
        startup_stage.message = "Container started"
    except ProvisioningError:
        raise
    except Exception as exc:
        startup_stage.status = "failed"
        startup_stage.error = str(exc)
        raise ProvisioningError("starting_container", str(exc), result.stages_dict()) from exc

    # ── Stage: mod_injection (verify mods are in config) ──
    mod_stage = StageResult(name="mod_injection")
    result.stages.append(mod_stage)
    try:
        config = generate_reforger_config(server)
        mods = config.get("game", {}).get("mods", [])
        mod_stage.status = "success"
        mod_stage.message = f"{len(mods)} mod(s) configured"
    except Exception as exc:
        mod_stage.status = "failed"
        mod_stage.error = str(exc)
        # mod_injection failure is not fatal — server is already running
        logger.warning("Mod injection verification failed for %s: %s", server["id"], exc)

    # ── Stage: post_start_validation (profile + SAT discovery) ──
    validation_stage = StageResult(name="post_start_validation")
    result.stages.append(validation_stage)
    try:
        artifact_updates = await wait_for_profile_and_sat(server)
        validation_stage.status = "success"
        validation_stage.message = "Profile and SAT config discovered"
        result.updates.update(artifact_updates)
    except Exception as exc:
        validation_stage.status = "failed"
        validation_stage.error = exc.message if isinstance(exc, ProvisioningError) else str(exc)
        # Post-start validation failure is NOT fatal if container started.
        # The server is running, just degraded.
        logger.warning(
            "Post-start validation failed for %s: %s",
            server["id"], validation_stage.error,
        )

    # ── Build final updates ──
    # Perform a live container check: if the container is actually running,
    # the server is operational regardless of post-start validation results
    # (SAT discovery, profile generation, etc.).  Report "running" so the
    # UI does not incorrectly flag the server as failed.
    live_running = False
    try:
        live_status = await docker_agent.get_container_status(server["container_name"])
        live_running = live_status is not None and live_status.get("running", False)
    except Exception:
        pass

    if live_running and result.container_started:
        effective_status = "running"
        effective_provisioning = "ready"
        effective_readiness = "ready" if result.all_succeeded else "degraded"
    else:
        effective_status = result.overall_status
        effective_provisioning = result.provisioning_state
        effective_readiness = result.readiness_state

    result.updates.update({
        "status": effective_status,
        "provisioning_state": effective_provisioning,
        "readiness_state": effective_readiness,
        "provisioning_stages": result.stages_dict(),
        "config_path": config_result,
        "data_root": server["data_root"],
        "profile_path": server["profile_path"],
        "workshop_path": server["workshop_path"],
        "diagnostics_path": server["diagnostics_path"],
        "docker_image": server["docker_image"],
        "container_name": server["container_name"],
        "ports": server["ports"],
        "port_allocations": server["ports"],
    })

    # If all stages succeeded, also set provisioning_step to ready.
    # When the container is live-running but some stages failed, still mark
    # the provisioning_step as ready so the UI treats the server as running.
    if result.all_succeeded or (live_running and result.container_started):
        result.updates["provisioning_step"] = "ready"
        if not result.all_succeeded:
            # Preserve warnings for non-critical failures (e.g. SAT not yet found)
            failed = result.failed_stages
            if failed:
                result.updates["last_docker_error"] = (
                    f"Server is running. Non-critical stage warnings: "
                    f"{', '.join(s.name for s in failed)}"
                )
    else:
        failed = result.failed_stages
        result.updates["provisioning_step"] = failed[0].name if failed else "unknown"
        result.updates["last_docker_error"] = result.summary_message

    return result.updates


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
        "provisioning_stages": server.get("provisioning_stages", {}),
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
