#!/usr/bin/env python3
"""Linux-host live validation for Docker-backed Arma Reforger provisioning."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import platform
import socket
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run a live Docker validation against ghcr.io/acemod/arma-reforger:latest. "
            "This script is intended to be executed on the Linux Docker host."
        )
    )
    parser.add_argument("--server-name", default="Codex Live Validation", help="Server name to write into the generated config.")
    parser.add_argument("--scenario-id", default="{ECC61978EDCC2B5A}Missions/23_Campaign.conf", help="Scenario ID to use for the validation server.")
    parser.add_argument("--max-players", type=int, default=8, help="Max players for the validation server.")
    parser.add_argument("--profile-timeout", type=int, default=180, help="Seconds to wait for first-boot profile and SAT generation.")
    parser.add_argument("--sat-wait-seconds", type=int, default=60, help="Additional seconds to wait for SAT config discovery after provisioning.")
    parser.add_argument("--rcon-wait-seconds", type=int, default=60, help="Seconds to wait for BattlEye RCON to become reachable.")
    parser.add_argument("--log-tail", type=int, default=120, help="How many container log lines to include in the report.")
    parser.add_argument("--sat-baseline", default="", help="Optional path to a canonical ServerAdminTools_Config.json baseline to validate deployment.")
    parser.add_argument("--data-root", default="", help="Optional host data root for validation artifacts. Defaults to a temp directory.")
    parser.add_argument("--output-json", default="", help="Optional path to write the validation report JSON.")
    parser.add_argument("--keep-artifacts", action="store_true", help="Keep the temporary validation container and data root for manual inspection.")
    parser.add_argument("--check-only", action="store_true", help="Only validate Docker connectivity and image pull availability.")
    return parser.parse_args()


def bootstrap_environment(args: argparse.Namespace) -> Path:
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    os.environ.setdefault("DB_NAME", "reforger_validation")
    os.environ.setdefault("JWT_SECRET", "reforger-validation")
    os.environ.setdefault("JWT_ALGORITHM", "HS256")

    if args.data_root:
        data_root = Path(args.data_root).expanduser().resolve()
    else:
        data_root = Path(tempfile.gettempdir()) / f"reforger-live-validation-{int(time.time())}"

    os.environ["SERVER_DATA_ROOT"] = str(data_root)
    os.environ["SERVER_PROFILE_READY_TIMEOUT_SECONDS"] = str(args.profile_timeout)
    if args.sat_baseline:
        os.environ["SERVER_SAT_BASELINE_PATH"] = str(Path(args.sat_baseline).expanduser().resolve())

    if str(BACKEND_ROOT) not in sys.path:
        sys.path.insert(0, str(BACKEND_ROOT))

    return data_root


def record_check(report: Dict[str, Any], *, name: str, passed: bool, detail: str, required: bool = True, **extra: Any) -> None:
    entry = {
        "name": name,
        "passed": passed,
        "detail": detail,
        "required": required,
    }
    if extra:
        entry.update(extra)
    report.setdefault("checks", []).append(entry)


def reserve_udp_ports() -> Dict[str, int]:
    sockets: List[socket.socket] = []
    ports: Dict[str, int] = {}
    try:
        for key in ("game", "query", "rcon"):
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.bind(("0.0.0.0", 0))
            sockets.append(sock)
            ports[key] = int(sock.getsockname()[1])
        return ports
    finally:
        for sock in sockets:
            sock.close()


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


async def wait_for_sat(discover_sat_config, profile_path: str, timeout_seconds: int) -> Tuple[Optional[str], str]:
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    last_state = "pending"
    while asyncio.get_running_loop().time() < deadline:
        sat_path, sat_state = discover_sat_config(profile_path)
        last_state = sat_state
        if sat_path:
            return sat_path, sat_state
        await asyncio.sleep(5)
    return None, last_state


async def wait_for_rcon(bercon_client, host: str, port: int, password: str, timeout_seconds: int) -> Tuple[Dict[str, str], List[Dict[str, str]]]:
    attempts: List[Dict[str, str]] = []
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    last_status = {"state": "unavailable", "detail": "No RCON probe was attempted"}
    while asyncio.get_running_loop().time() < deadline:
        last_status = await bercon_client.probe(host, port, password)
        attempts.append(
            {
                "state": last_status.get("state", "unknown"),
                "detail": last_status.get("detail", ""),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        if last_status.get("state") == "connected":
            return last_status, attempts
        await asyncio.sleep(5)
    return last_status, attempts


async def run_validation(args: argparse.Namespace, data_root: Path) -> Tuple[Dict[str, Any], int]:
    from config import SERVER_DOCKER_IMAGE, SERVER_SAT_BASELINE_PATH
    from services.docker_agent import DockerAgent
    from services.reforger_orchestrator import apply_runtime_defaults, delete_server, provision_server
    from services.rcon_bridge import bercon_client
    from services.sat_config_service import discover_sat_config
    from services.server_config_generator import generate_reforger_config

    docker_agent = DockerAgent()
    report: Dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "host_platform": platform.platform(),
        "repo_root": str(REPO_ROOT),
        "backend_root": str(BACKEND_ROOT),
        "data_root": str(data_root),
        "docker_image": SERVER_DOCKER_IMAGE,
        "checks": [],
    }

    if os.name == "nt":
        record_check(
            report,
            name="host_os",
            passed=False,
            detail="This live validation must be executed on the Linux Docker host, not on Windows.",
        )
        return report, 1

    ok, error = await docker_agent.ping()
    record_check(
        report,
        name="docker_daemon",
        passed=ok,
        detail="Docker daemon is reachable via the local Docker API." if ok else (error or "Docker daemon is unavailable."),
    )
    if not ok:
        return report, 1

    ok, error = await docker_agent.ensure_image(SERVER_DOCKER_IMAGE)
    record_check(
        report,
        name="image_available",
        passed=ok,
        detail=f"Image {SERVER_DOCKER_IMAGE} is available for provisioning." if ok else (error or "Docker image could not be pulled."),
    )
    if not ok or args.check_only:
        return report, 0 if ok and args.check_only else 1

    ports = reserve_udp_ports()
    server_id = f"validation-{uuid4().hex[:12]}"
    rcon_password = f"validate{uuid4().hex[:10]}"
    server_doc = {
        "id": server_id,
        "name": args.server_name,
        "status": "created",
        "ports": ports,
        "mods": [],
        "config": {
            "game": {
                "name": args.server_name,
                "scenarioId": args.scenario_id,
                "maxPlayers": args.max_players,
            },
            "rcon": {
                "password": rcon_password,
                "permission": "admin",
                "maxClients": 4,
            },
        },
    }
    server_doc = apply_runtime_defaults(server_doc)
    report["server"] = {
        "id": server_doc["id"],
        "name": server_doc["name"],
        "container_name": server_doc["container_name"],
        "ports": ports,
    }

    merged_server = dict(server_doc)

    try:
        updates = await provision_server(server_doc)
        merged_server.update(updates)
        generated_config = generate_reforger_config(merged_server)

        container = await docker_agent.inspect_container(merged_server["container_name"])
        logs = await docker_agent.get_container_logs(merged_server["container_name"], tail=args.log_tail)
        report["logs_tail"] = logs.splitlines()[-args.log_tail:]
        report["paths"] = {
            "config_path": merged_server.get("config_path", ""),
            "profile_path": merged_server.get("profile_path", ""),
            "workshop_path": merged_server.get("workshop_path", ""),
            "sat_config_path": merged_server.get("sat_config_path", ""),
        }

        container_running = bool(container and container.get("running"))
        record_check(
            report,
            name="container_running",
            passed=container_running,
            detail="Validation container started successfully." if container_running else "Validation container is not running after provisioning.",
            container_status=(container or {}).get("status", "unknown"),
        )

        profile_path = Path(merged_server["profile_path"])
        profile_ready = profile_path.exists() and any(profile_path.iterdir())
        record_check(
            report,
            name="profile_generated",
            passed=profile_ready,
            detail="Server profile directory was generated during first boot." if profile_ready else "Profile directory is still empty after provisioning.",
            profile_path=str(profile_path),
        )

        sat_path = merged_server.get("sat_config_path") or ""
        sat_state = merged_server.get("sat_status", "pending")
        if not sat_path:
            discovered_path, discovered_state = await wait_for_sat(discover_sat_config, merged_server["profile_path"], args.sat_wait_seconds)
            sat_path = discovered_path or ""
            sat_state = discovered_state
        report["paths"]["sat_config_path"] = sat_path
        record_check(
            report,
            name="sat_config_present",
            passed=bool(sat_path),
            detail="ServerAdminTools_Config.json was discovered in the generated profile." if sat_path else f"ServerAdminTools_Config.json was not discovered ({sat_state}).",
            sat_status=sat_state,
        )

        if SERVER_SAT_BASELINE_PATH:
            baseline_exists = Path(SERVER_SAT_BASELINE_PATH).exists()
            baseline_applied = baseline_exists and bool(sat_path) and sha256_file(SERVER_SAT_BASELINE_PATH) == sha256_file(sat_path)
            record_check(
                report,
                name="sat_baseline_applied",
                passed=baseline_applied,
                detail=(
                    "Configured SAT baseline file was copied into the generated profile."
                    if baseline_applied
                    else "Configured SAT baseline file was not copied into the generated profile."
                ),
                baseline_path=SERVER_SAT_BASELINE_PATH,
                target_path=sat_path,
            )

        rcon_status, rcon_attempts = await wait_for_rcon(
            bercon_client,
            "127.0.0.1",
            int(generated_config["rcon"]["port"]),
            str(generated_config["rcon"]["password"]),
            args.rcon_wait_seconds,
        )
        report["rcon_attempts"] = rcon_attempts
        record_check(
            report,
            name="rcon_probe",
            passed=rcon_status.get("state") == "connected",
            detail=rcon_status.get("detail", ""),
            state=rcon_status.get("state", "unknown"),
            port=int(generated_config["rcon"]["port"]),
        )

        exit_code = 0 if all(check["passed"] for check in report["checks"] if check.get("required", True)) else 1
        report["result"] = "passed" if exit_code == 0 else "failed"
        return report, exit_code
    except Exception as exc:  # pragma: no cover - live validation path
        report["result"] = "failed"
        report["error"] = str(exc)
        if merged_server.get("container_name"):
            container = await docker_agent.inspect_container(merged_server["container_name"])
            if container:
                report["container"] = container
                report["logs_tail"] = (await docker_agent.get_container_logs(merged_server["container_name"], tail=args.log_tail)).splitlines()[-args.log_tail:]
        return report, 1
    finally:
        if args.keep_artifacts:
            report["cleanup"] = "skipped"
        else:
            try:
                if merged_server.get("container_name"):
                    await delete_server(merged_server)
                report["cleanup"] = "completed"
            except Exception as cleanup_exc:  # pragma: no cover - live validation path
                report["cleanup"] = f"failed: {cleanup_exc}"


def write_report(report: Dict[str, Any], output_json: str) -> None:
    payload = json.dumps(report, indent=2)
    if output_json:
        target = Path(output_json).expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload, encoding="utf-8")
        print(f"Validation report written to {target}")
    print(payload)


def main() -> int:
    args = parse_args()
    data_root = bootstrap_environment(args)
    report, exit_code = asyncio.run(run_validation(args, data_root))
    write_report(report, args.output_json)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
