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
from services.server_config_generator import (
    MAX_AUTO_RECOVERY_ATTEMPTS,
    attempt_auto_recovery,
    generate_reforger_config,
    write_config_file,
)

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

# Patterns that indicate a config / schema error that may be auto-recoverable.
_CONFIG_ERROR_LOG_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r'has an incorrect type\.\s*Expected\s+"', re.IGNORECASE),
    re.compile(r"JSON is invalid", re.IGNORECASE),
    re.compile(r"errors? in server config", re.IGNORECASE),
    re.compile(r"additional\s*properties", re.IGNORECASE),
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
        if self.container_started:
            return "running"
        return "error"

    @property
    def provisioning_state(self) -> str:
        if self.all_succeeded:
            return "completed"
        if self.container_started:
            return "warning"
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
            return f"Server is operational, but follow-up stages need attention: {', '.join(names)}"
        return f"Server creation failed before the container became operational: {', '.join(names)}"


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


def build_startup_parameters(server: Dict[str, Any]) -> List[str]:
    parameters: List[str] = []
    seen: set[str] = set()

    if server.get("log_stats_enabled", True):
        parameters.append("-logstats")
        seen.add("-logstats")

    for raw_param in server.get("startup_parameters") or []:
        if not isinstance(raw_param, str):
            continue
        param = raw_param.strip()
        if not param:
            continue
        normalized = param.split(" ", 1)[0].lower()
        if normalized in {"-logstats", "-maxfps"}:
            continue
        if normalized in seen:
            continue
        parameters.append(param)
        seen.add(normalized)

    return parameters


def build_container_environment(server: Dict[str, Any]) -> Dict[str, str]:
    config = generate_reforger_config(server)
    rcon = config.get("rcon") or {}
    return {
        "ARMA_CONFIG": SERVER_CONFIG_FILENAME,
        "ARMA_PROFILE": "/home/profile",
        "ARMA_WORKSHOP_DIR": "/reforger/workshop",
        "ARMA_MAX_FPS": str(server.get("max_fps") or 120),
        "ARMA_PARAMS": " ".join(build_startup_parameters(server)),
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


def extract_config_errors(logs: str) -> List[str]:
    """Extract config-related error messages from container logs.

    Returns a list of log lines that contain config/schema error patterns.
    These are used to drive automatic recovery attempts.
    """
    if not logs:
        return []
    errors: List[str] = []
    for line in logs.splitlines():
        for pattern in _CONFIG_ERROR_LOG_PATTERNS:
            if pattern.search(line):
                # Strip timestamps from the log line for cleaner matching
                cleaned = re.sub(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s*", "", line).strip()
                if cleaned:
                    errors.append(cleaned)
                break
    return errors


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
                    "provisioning_state": "completed",
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


async def wait_for_profile_generation(server: Dict[str, Any]) -> Dict[str, Any]:
    """Wait for the profile directory to populate after startup."""
    profile_root = Path(server["profile_path"])
    deadline = asyncio.get_running_loop().time() + SERVER_PROFILE_READY_TIMEOUT_SECONDS

    while asyncio.get_running_loop().time() < deadline:
        if profile_root.exists() and any(profile_root.iterdir()):
            return {
                "profile_ready": True,
                "profile_path": str(profile_root),
            }
        await asyncio.sleep(SERVER_PROFILE_POLL_SECONDS)

    return {
        "profile_ready": False,
        "error": "Server profile structure was not generated before the provisioning timeout",
    }


async def discover_sat_runtime(server: Dict[str, Any]) -> Dict[str, Any]:
    """Discover SAT config after the profile has been generated."""
    sat_path, sat_state = discover_sat_config(server["profile_path"])
    if not sat_path:
        return {
            "sat_ready": False,
            "sat_status": sat_state,
            "error": "ServerAdminTools_Config.json was not discovered in the generated profile",
        }

    try:
        baseline_applied = overlay_baseline_if_configured(sat_path)
    except OSError as exc:
        return {
            "sat_ready": False,
            "sat_status": "error",
            "error": f"Failed to deploy ServerAdminTools_Config.json: {exc}",
        }

    if SERVER_SAT_BASELINE_PATH and not baseline_applied:
        return {
            "sat_ready": False,
            "sat_status": "error",
            "error": f"Configured SAT baseline file does not exist: {SERVER_SAT_BASELINE_PATH}",
        }

    return {
        "sat_ready": True,
        "sat_config_path": sat_path,
        "sat_status": "configured" if baseline_applied else sat_state,
    }


def _initial_stage_dicts(server: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "record_creation": StageResult(
            name="record_creation",
            status="success",
            message="Server record created",
        ).to_dict(),
        "filesystem_preparation": StageResult(
            name="filesystem_preparation",
            status="success",
            message=f"Runtime directories prepared under {server['data_root']}",
        ).to_dict(),
        "config_write": StageResult(
            name="config_write",
            status="success",
            message=f"Config written to {server['config_path']}",
        ).to_dict(),
        "container_creation": StageResult(
            name="container_creation",
            status="success",
            message=f"Container {server['container_name']} created",
        ).to_dict(),
    }


async def prepare_server_deployment(server: Dict[str, Any]) -> Dict[str, Any]:
    """Create the runtime directories, write config, and create the container."""
    server = apply_runtime_defaults(server)

    try:
        await ensure_filesystem(server)
    except Exception as exc:
        raise ProvisioningError("filesystem_preparation", str(exc)) from exc

    try:
        ok, config_result = await write_config_file(server)
    except Exception as exc:
        raise ProvisioningError("config_write", str(exc)) from exc
    if not ok:
        raise ProvisioningError("config_write", config_result)

    try:
        runtime_updates = await ensure_container(server)
    except ProvisioningError:
        raise
    except Exception as exc:
        raise ProvisioningError("creating_container", str(exc)) from exc

    return {
        **runtime_updates,
        "deployment_state": "created",
        "status": "created",
        "provisioning_state": "queued",
        "provisioning_step": "queued",
        "readiness_state": "pending",
        "config_path": config_result,
        "data_root": server["data_root"],
        "profile_path": server["profile_path"],
        "workshop_path": server["workshop_path"],
        "diagnostics_path": server["diagnostics_path"],
        "docker_image": server["docker_image"],
        "container_name": server["container_name"],
        "ports": server["ports"],
        "port_allocations": server["ports"],
        "provisioning_stages": _initial_stage_dicts(server),
        "summary_message": "Server container created successfully. Follow-up provisioning continues in the server workspace.",
        "last_docker_error": "",
        "provisioning_warnings": [],
        "needs_manual_intervention": False,
    }


async def provision_server(server: Dict[str, Any]) -> Dict[str, Any]:
    server = apply_runtime_defaults(server)
    result = ProvisioningResult()
    config_result = server["config_path"]

    result.stages.append(
        StageResult(name="record_creation", status="success", message="Server record created")
    )

    filesystem_stage = StageResult(name="filesystem_preparation")
    result.stages.append(filesystem_stage)
    try:
        await ensure_filesystem(server)
        filesystem_stage.status = "success"
        filesystem_stage.message = f"Runtime directories prepared under {server['data_root']}"
    except Exception as exc:
        filesystem_stage.status = "failed"
        filesystem_stage.error = str(exc)
        raise ProvisioningError("filesystem_preparation", str(exc), result.stages_dict()) from exc

    # ── Stage: config_generation ──
    config_stage = StageResult(name="config_write")
    result.stages.append(config_stage)
    try:
        ok, config_result = await write_config_file(server)
        if not ok:
            config_stage.status = "failed"
            config_stage.error = config_result
            raise ProvisioningError("config_write", config_result, result.stages_dict())
        config_stage.status = "success"
        config_stage.message = f"Config written to {config_result}"
    except ProvisioningError:
        raise
    except Exception as exc:
        config_stage.status = "failed"
        config_stage.error = str(exc)
        raise ProvisioningError("config_write", str(exc), result.stages_dict()) from exc

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

    # ── Stage: auto_recovery (detect config errors → fix → restart) ──
    recovery_stage = StageResult(name="auto_recovery")
    result.stages.append(recovery_stage)
    recovery_descriptions: List[str] = []
    recovery_attempts = 0

    for attempt in range(1, MAX_AUTO_RECOVERY_ATTEMPTS + 1):
        # Give the server a few seconds to either start successfully or crash
        await asyncio.sleep(5)

        status_info = await docker_agent.get_container_status(server["container_name"])
        container_running = status_info is not None and status_info.get("running", False)

        if container_running:
            # Server is running — no recovery needed
            break

        # Container stopped — check logs for config errors
        try:
            logs = await docker_agent.get_container_logs(
                server["container_name"], tail=READINESS_LOG_TAIL_LINES,
            )
        except Exception:
            logs = ""

        config_errors = extract_config_errors(logs)
        if not config_errors:
            # Not a config error — could be a mod cycle or other issue
            break

        recovery_attempts = attempt
        error_text = " | ".join(config_errors)
        logger.warning(
            "Server %s config error detected (attempt %d/%d): %s",
            server["container_name"], attempt, MAX_AUTO_RECOVERY_ATTEMPTS, error_text,
        )

        recovered, descriptions = attempt_auto_recovery(server, error_text)
        if not recovered:
            logger.warning(
                "Auto-recovery could not fix config errors for %s",
                server["container_name"],
            )
            break

        recovery_descriptions.extend(descriptions)

        # Rewrite the config and restart the container
        ok, config_result = await write_config_file(server)
        if not ok:
            logger.error("Failed to write recovered config: %s", config_result)
            break

        ok, error = await docker_agent.start_existing_container(server["container_name"])
        if not ok:
            logger.error("Failed to restart container after recovery: %s", error)
            break

        logger.info(
            "Auto-recovery attempt %d applied for %s: %s",
            attempt, server["container_name"], "; ".join(descriptions),
        )

    if recovery_descriptions:
        recovery_stage.status = "success"
        recovery_stage.message = (
            f"Applied {len(recovery_descriptions)} auto-fix(es) in "
            f"{recovery_attempts} attempt(s): {'; '.join(recovery_descriptions)}"
        )
    elif recovery_attempts > 0:
        # We tried to recover but couldn't fix the issue
        recovery_stage.status = "failed"
        recovery_stage.error = (
            f"Config errors detected but auto-recovery failed after "
            f"{recovery_attempts} attempt(s). Manual intervention required."
        )
    else:
        recovery_stage.status = "skipped"
        recovery_stage.message = "No config errors detected"

    result.updates["auto_recovery_attempts"] = recovery_attempts
    if recovery_descriptions:
        result.updates["auto_recovery_log"] = recovery_descriptions

    # ── Stage: mod_injection (verify mods are in config) ──
    mod_stage = StageResult(name="mod_sync")
    result.stages.append(mod_stage)
    try:
        config = generate_reforger_config(server)
        mods = config.get("game", {}).get("mods", [])
        mod_stage.status = "success"
        mod_stage.message = f"{len(mods)} mod(s) declared in server config"
    except Exception as exc:
        mod_stage.status = "failed"
        mod_stage.error = str(exc)
        # mod_injection failure is not fatal — server is already running
        logger.warning("Mod sync verification failed for %s: %s", server["id"], exc)

    # ── Stage: post_start_validation (profile + SAT discovery) ──
    readiness_stage = StageResult(name="readiness_check")
    result.stages.append(readiness_stage)
    try:
        readiness = await wait_for_server_readiness(
            server,
            timeout=min(DEFAULT_READINESS_TIMEOUT, SERVER_PROFILE_READY_TIMEOUT_SECONDS),
        )
        if readiness.get("server_ready"):
            readiness_stage.status = "success"
            readiness_stage.message = (
                f"Server signalled readiness after {readiness.get('restart_cycles', 0)} restart cycle(s)"
            )
        else:
            readiness_stage.status = "failed"
            readiness_stage.error = readiness.get("error", "Server did not signal readiness before timeout")
        result.updates["restart_cycles"] = readiness.get("restart_cycles", 0)
    except Exception as exc:
        readiness_stage.status = "failed"
        readiness_stage.error = exc.message if isinstance(exc, ProvisioningError) else str(exc)
        logger.warning(
            "Readiness check failed for %s: %s",
            server["id"], readiness_stage.error,
        )

    profile_stage = StageResult(name="profile_generation")
    result.stages.append(profile_stage)
    try:
        profile_updates = await wait_for_profile_generation(server)
        if profile_updates.get("profile_ready"):
            profile_stage.status = "success"
            profile_stage.message = "Server profile structure detected"
        else:
            profile_stage.status = "failed"
            profile_stage.error = profile_updates.get("error", "Server profile structure was not generated")
    except Exception as exc:
        profile_stage.status = "failed"
        profile_stage.error = str(exc)
        logger.warning("Profile generation check failed for %s: %s", server["id"], exc)

    sat_stage = StageResult(name="sat_discovery")
    result.stages.append(sat_stage)
    if profile_stage.status != "success":
        sat_stage.status = "skipped"
        sat_stage.message = "Skipped until the server profile is available"
    else:
        try:
            sat_updates = await discover_sat_runtime(server)
            if sat_updates.get("sat_ready"):
                sat_stage.status = "success"
                sat_stage.message = "Server Admin Tools config discovered"
                result.updates.update(sat_updates)
            else:
                sat_stage.status = "failed"
                sat_stage.error = sat_updates.get("error", "Server Admin Tools config was not discovered")
                if sat_updates.get("sat_status"):
                    result.updates["sat_status"] = sat_updates["sat_status"]
        except Exception as exc:
            sat_stage.status = "failed"
            sat_stage.error = str(exc)
            logger.warning("SAT discovery failed for %s: %s", server["id"], exc)

    # ── Build final updates ──
    # Perform a live container check: if the container is actually running,
    # the server is operational regardless of post-start validation results
    # (SAT discovery, profile generation, etc.).  Report "running" so the
    # UI does not incorrectly flag the server as failed.
    live_running = False
    try:
        live_status = await docker_agent.get_container_status(server["container_name"])
        live_running = live_status is not None and live_status.get("running", False)
    except Exception as exc:
        logger.debug("Live container check failed for %s: %s", server["container_name"], exc)

    if result.container_started:
        effective_provisioning = "completed"
        if live_running:
            effective_status = "running"
            effective_readiness = "ready"
        else:
            effective_status = "starting"
            effective_readiness = "initializing"
            effective_provisioning = "running"
    else:
        effective_status = result.overall_status
        effective_provisioning = result.provisioning_state
        effective_readiness = result.readiness_state

    result.updates.update({
        "deployment_state": server.get("deployment_state", "created"),
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
        "summary_message": (
            "Server container created successfully and is still completing first-boot checks."
            if result.container_started and not live_running
            else result.summary_message
        ),
    })

    if result.container_started:
        result.updates["provisioning_step"] = "ready" if live_running else "running"
        failed = [
            s for s in result.failed_stages
            if s.name not in {"record_creation", "filesystem_preparation", "config_write", "container_creation", "initial_startup"}
        ]
        if failed:
            result.updates["provisioning_warnings"] = [
                {
                    "stage": s.name,
                    "message": s.error or s.message or "Stage completed with warnings",
                }
                for s in failed
            ]
            result.updates["provisioning_state"] = "warning"
            if live_running:
                result.updates["readiness_state"] = "degraded"
    else:
        failed = result.failed_stages
        result.updates["provisioning_step"] = failed[0].name if failed else "unknown"
        result.updates["last_docker_error"] = result.summary_message
        # If auto-recovery was attempted but couldn't fix the issue, flag
        # the server so the UI can prompt the user for manual intervention.
        if recovery_attempts >= MAX_AUTO_RECOVERY_ATTEMPTS:
            result.updates["needs_manual_intervention"] = True
            result.updates["last_docker_error"] = (
                f"Auto-recovery exhausted ({recovery_attempts} attempts). "
                f"{result.summary_message}  Manual config correction required."
            )

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
        "deployment_state": server.get("deployment_state", "created"),
        "status": "running",
        "provisioning_state": "completed",
        "provisioning_step": "ready",
        "config_path": config_result,
        "last_known_container_status": (details or {}).get("status", "running"),
        "sat_config_path": sat_path or "",
        "sat_status": sat_state,
        "readiness_state": "ready",
    }


async def stop_server(server: Dict[str, Any]) -> Dict[str, Any]:
    ok, error = await docker_agent.stop_container(server["container_name"])
    if not ok:
        raise ProvisioningError("stopping_container", error or "Failed to stop container")
    return {
        "deployment_state": server.get("deployment_state", "created"),
        "status": "stopped",
        "provisioning_state": server.get("provisioning_state", "completed"),
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
        "deployment_state": server.get("deployment_state", "created"),
        "status": "running",
        "provisioning_state": "completed",
        "provisioning_step": "ready",
        "last_known_container_status": (details or {}).get("status", "running"),
        "sat_config_path": sat_path or "",
        "sat_status": sat_state,
        "readiness_state": "ready",
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
        "deployment_state": server.get("deployment_state", "created"),
        "provisioning_state": server.get("provisioning_state", "pending"),
        "provisioning_step": server.get("provisioning_step", "pending"),
        "readiness_state": server.get("readiness_state", "pending"),
        "last_docker_error": server.get("last_docker_error", ""),
        "provisioning_stages": server.get("provisioning_stages", {}),
        "provisioning_warnings": server.get("provisioning_warnings", []),
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
