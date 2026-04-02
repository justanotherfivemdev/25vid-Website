"""
Arma Reforger server configuration generator.

Converts a ``ManagedServer`` document dictionary into a complete Reforger
server-configuration JSON file and writes it to disk.
"""

import os
import json
import logging
from pathlib import Path
from typing import Tuple, List, Dict

logger = logging.getLogger(__name__)

# ── Defaults ────────────────────────────────────────────────────────
_DEFAULT_REGION = "US"
_DEFAULT_BIND_ADDRESS = "0.0.0.0"
_DEFAULT_GAME_PORT = 2001
_DEFAULT_QUERY_PORT = 17777
_DEFAULT_RCON_PORT = 19999
_DEFAULT_PLAYER_LIMIT = 64
_DEFAULT_SCENARIO = "{E3AEF550BDCA4B42}Missions/23_Campaign.conf"
_DEFAULT_VISIBLE = True
_DEFAULT_CROSSPLAY = True
_DEFAULT_DISABLE_AI = False
_DEFAULT_FAST_VALIDATION = True
_DEFAULT_BATTLEYE = True
_DEFAULT_VON_DISABLED = False


# ── Config generation ───────────────────────────────────────────────

def generate_reforger_config(server: dict) -> dict:
    """Build a complete Arma Reforger server config from a ManagedServer doc.

    The returned dictionary mirrors the JSON structure expected by the
    Arma Reforger dedicated-server binary.
    """
    config = server.get("config", {})
    ports = server.get("ports", {})
    mods = server.get("mods", [])
    env = server.get("environment", {})

    game_port = ports.get("game", _DEFAULT_GAME_PORT)
    query_port = ports.get("query", _DEFAULT_QUERY_PORT)
    rcon_port = ports.get("rcon", _DEFAULT_RCON_PORT)

    rcon_password = env.get("rcon_password", os.environ.get("RCON_PASSWORD", ""))

    return {
        "dedicatedServerId": config.get("dedicatedServerId", server.get("id", "")),
        "region": config.get("region", _DEFAULT_REGION),
        "gameHostBindAddress": config.get(
            "gameHostBindAddress", _DEFAULT_BIND_ADDRESS
        ),
        "gameHostBindPort": game_port,
        "gameHostRegisterBindAddress": config.get(
            "gameHostRegisterBindAddress", ""
        ),
        "gameHostRegisterPort": game_port,
        "a2s": {
            "address": config.get("a2s_address", _DEFAULT_BIND_ADDRESS),
            "port": query_port,
        },
        "rcon": {
            "address": config.get("rcon_address", _DEFAULT_BIND_ADDRESS),
            "port": rcon_port,
            "password": rcon_password,
            "permission": config.get("rcon_permission", "admin"),
            "maxClients": config.get("rcon_max_clients", 16),
        },
        "game": {
            "name": config.get("name", server.get("name", "Arma Reforger Server")),
            "password": config.get("password", ""),
            "passwordAdmin": config.get(
                "passwordAdmin", env.get("admin_password", "")
            ),
            "scenarioId": config.get("scenarioId", _DEFAULT_SCENARIO),
            "playerCountLimit": config.get(
                "playerCountLimit", _DEFAULT_PLAYER_LIMIT
            ),
            "visible": config.get("visible", _DEFAULT_VISIBLE),
            "crossPlatform": config.get("crossPlatform", _DEFAULT_CROSSPLAY),
            "supportedPlatforms": config.get(
                "supportedPlatforms", ["PLATFORM_PC", "PLATFORM_XBL"]
            ),
            "gameProperties": {
                "serverMaxViewDistance": config.get(
                    "serverMaxViewDistance", 2500
                ),
                "serverMinGrassDistance": config.get(
                    "serverMinGrassDistance", 50
                ),
                "networkViewDistance": config.get("networkViewDistance", 1000),
                "disableThirdPerson": config.get("disableThirdPerson", False),
                "fastValidation": config.get(
                    "fastValidation", _DEFAULT_FAST_VALIDATION
                ),
                "battlEye": config.get("battlEye", _DEFAULT_BATTLEYE),
                "VONDisableUI": config.get("VONDisableUI", _DEFAULT_VON_DISABLED),
                "VONDisableDirectSpeechUI": config.get(
                    "VONDisableDirectSpeechUI", _DEFAULT_VON_DISABLED
                ),
            },
            "mods": _build_mods_list(mods),
        },
        "operating": {
            "lobbyPlayerSynchronise": config.get(
                "lobbyPlayerSynchronise", True
            ),
            "disableNavmeshStreaming": config.get(
                "disableNavmeshStreaming", False
            ),
            "disableServerShutdown": config.get(
                "disableServerShutdown", False
            ),
            "disableAI": config.get("disableAI", _DEFAULT_DISABLE_AI),
            "playerSaveTime": config.get("playerSaveTime", 120),
            "aiLimit": config.get("aiLimit", -1),
        },
    }


def _build_mods_list(mods: list) -> list:
    """Convert the ``ManagedServer.mods`` list into Reforger mod entries."""
    result = []
    for mod in mods:
        entry: Dict = {
            "modId": mod.get("modId", mod.get("id", "")),
            "name": mod.get("name", ""),
        }
        if mod.get("version"):
            entry["version"] = mod["version"]
        result.append(entry)
    return result


# ── Validation ──────────────────────────────────────────────────────

_REQUIRED_PATHS: List[Tuple[List[str], str]] = [
    (["dedicatedServerId"], "dedicatedServerId is required"),
    (["game", "name"], "game.name is required"),
    (["game", "scenarioId"], "game.scenarioId is required"),
    (["gameHostBindPort"], "gameHostBindPort is required"),
    (["a2s", "port"], "a2s.port is required"),
    (["rcon", "port"], "rcon.port is required"),
    (["rcon", "password"], "rcon.password is required"),
]


def validate_config(config: dict) -> Tuple[bool, List[str]]:
    """Validate that all required fields are present and non-empty.

    Returns ``(valid, errors)`` where *errors* is an empty list on success.
    """
    errors: List[str] = []

    for path, message in _REQUIRED_PATHS:
        value = config
        for key in path:
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(key)

        if value is None or (isinstance(value, str) and not value.strip()):
            errors.append(message)

    return (len(errors) == 0, errors)


# ── File writing ────────────────────────────────────────────────────

async def write_config_file(
    server: dict,
    config_dir: str = "/app/server-configs",
) -> Tuple[bool, str]:
    """Generate, validate, and persist a Reforger config JSON file.

    Returns ``(success, file_path_or_error)``.
    """
    server_id = server.get("id", "")
    if not server_id:
        return False, "Server document missing 'id' field"

    config = generate_reforger_config(server)

    valid, errors = validate_config(config)
    if not valid:
        msg = f"Config validation failed: {'; '.join(errors)}"
        logger.error(msg)
        return False, msg

    target_dir = Path(config_dir) / server_id
    target_file = target_dir / "config.json"

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        target_file.write_text(
            json.dumps(config, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        logger.info("Wrote server config to %s", target_file)
        return True, str(target_file)
    except OSError as exc:
        msg = f"Failed to write config file: {exc}"
        logger.error(msg)
        return False, msg
