"""
Arma Reforger server configuration generator.

Converts a ``ManagedServer`` document dictionary into a complete Reforger
server-configuration JSON file and writes it to disk.
"""

import os
import json
import logging
from copy import deepcopy
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
_DEFAULT_VON_CROSS_FACTION = True


def build_default_server_config(server: dict | None = None) -> dict:
    """Return the canonical nested server-config structure used by the UI/API."""
    server = server or {}
    ports = server.get("ports") or {}

    return {
        "dedicatedServerId": server.get("id", ""),
        "region": _DEFAULT_REGION,
        "gameHostBindAddress": _DEFAULT_BIND_ADDRESS,
        "gameHostRegisterBindAddress": "",
        "game": {
            "name": server.get("name", "Arma Reforger Server"),
            "password": "",
            "passwordAdmin": "",
            "scenarioId": _DEFAULT_SCENARIO,
            "playerCountLimit": _DEFAULT_PLAYER_LIMIT,
            "visible": _DEFAULT_VISIBLE,
            "crossPlatform": _DEFAULT_CROSSPLAY,
            "supportedPlatforms": ["PLATFORM_PC", "PLATFORM_XBL"],
            "modsRequiredByDefault": True,
            "missionHeader": {},
            "gameProperties": {
                "serverMaxViewDistance": 2500,
                "serverMinGrassDistance": 50,
                "networkViewDistance": 1000,
                "disableThirdPerson": False,
                "fastValidation": _DEFAULT_FAST_VALIDATION,
                "battlEye": _DEFAULT_BATTLEYE,
                "VONDisableUI": _DEFAULT_VON_DISABLED,
                "VONDisableDirectSpeechUI": _DEFAULT_VON_DISABLED,
                "VONTransmitCrossFaction": _DEFAULT_VON_CROSS_FACTION,
            },
        },
        "a2s": {
            "address": _DEFAULT_BIND_ADDRESS,
            "port": ports.get("query", _DEFAULT_QUERY_PORT),
        },
        "rcon": {
            "address": _DEFAULT_BIND_ADDRESS,
            "port": ports.get("rcon", _DEFAULT_RCON_PORT),
            "password": "",
            "permission": "admin",
            "maxClients": 16,
        },
        "operating": {
            "lobbyPlayerSynchronise": True,
            "disableNavmeshStreaming": False,
            "disableServerShutdown": False,
            "disableAI": _DEFAULT_DISABLE_AI,
            "playerSaveTime": 120,
            "aiLimit": -1,
        },
        "startupParameters": [],
    }


def _merge_nested_dicts(base: dict, incoming: dict) -> dict:
    merged = deepcopy(base)
    for key, value in (incoming or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_nested_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged


def normalize_server_config(raw_config: dict | None, server: dict | None = None) -> dict:
    """Normalize server config payloads into the canonical nested shape.

    Accepts either the older flat storage format or the newer nested UI/API
    structure, merges the incoming values onto the current defaults, and
    returns a complete nested configuration dictionary suitable for both the
    frontend editor and final Reforger JSON generation.
    """
    config = raw_config or {}
    normalized = build_default_server_config(server)

    if any(isinstance(config.get(key), dict) for key in ("game", "a2s", "rcon", "operating")):
        normalized = _merge_nested_dicts(normalized, config)
    else:
        normalized["dedicatedServerId"] = config.get("dedicatedServerId", normalized["dedicatedServerId"])
        normalized["region"] = config.get("region", normalized["region"])
        normalized["gameHostBindAddress"] = config.get("gameHostBindAddress", normalized["gameHostBindAddress"])
        normalized["gameHostRegisterBindAddress"] = config.get(
            "gameHostRegisterBindAddress", normalized["gameHostRegisterBindAddress"]
        )
        normalized["a2s"]["address"] = config.get("a2s_address", normalized["a2s"]["address"])
        normalized["rcon"]["address"] = config.get("rcon_address", normalized["rcon"]["address"])
        normalized["rcon"]["permission"] = config.get("rcon_permission", normalized["rcon"]["permission"])
        normalized["rcon"]["maxClients"] = config.get("rcon_max_clients", normalized["rcon"]["maxClients"])

        game = normalized["game"]
        game["name"] = config.get("name", game["name"])
        game["password"] = config.get("password", game["password"])
        game["passwordAdmin"] = config.get("passwordAdmin", game["passwordAdmin"])
        game["scenarioId"] = config.get("scenarioId", game["scenarioId"])
        game["playerCountLimit"] = config.get("playerCountLimit", game["playerCountLimit"])
        game["visible"] = config.get("visible", game["visible"])
        game["crossPlatform"] = config.get("crossPlatform", game["crossPlatform"])
        game["supportedPlatforms"] = config.get("supportedPlatforms", game["supportedPlatforms"])
        game["modsRequiredByDefault"] = config.get("modsRequiredByDefault", game["modsRequiredByDefault"])
        if isinstance(config.get("missionHeader"), dict):
            game["missionHeader"] = config["missionHeader"]

        props = game["gameProperties"]
        for key in (
            "serverMaxViewDistance",
            "serverMinGrassDistance",
            "networkViewDistance",
            "disableThirdPerson",
            "fastValidation",
            "battlEye",
            "VONDisableUI",
            "VONDisableDirectSpeechUI",
            "VONTransmitCrossFaction",
        ):
            if key in config:
                props[key] = config[key]

        operating = normalized["operating"]
        for key in (
            "lobbyPlayerSynchronise",
            "disableNavmeshStreaming",
            "disableServerShutdown",
            "disableAI",
            "playerSaveTime",
            "aiLimit",
        ):
            if key in config:
                operating[key] = config[key]

        if isinstance(config.get("startupParameters"), list):
            normalized["startupParameters"] = config["startupParameters"]

    if not isinstance(normalized["game"].get("missionHeader"), dict):
        normalized["game"]["missionHeader"] = {}
    if not isinstance(normalized.get("startupParameters"), list):
        normalized["startupParameters"] = []

    return normalized


# ── Config generation ───────────────────────────────────────────────

def generate_reforger_config(server: dict) -> dict:
    """Build a complete Arma Reforger server config from a ManagedServer doc.

    The returned dictionary mirrors the JSON structure expected by the
    Arma Reforger dedicated-server binary.
    """
    config = normalize_server_config(server.get("config", {}), server)
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
        "gameHostBindAddress": config.get("gameHostBindAddress", _DEFAULT_BIND_ADDRESS),
        "gameHostBindPort": game_port,
        "gameHostRegisterBindAddress": config.get("gameHostRegisterBindAddress", ""),
        "gameHostRegisterPort": game_port,
        "a2s": {
            "address": config.get("a2s", {}).get("address", _DEFAULT_BIND_ADDRESS),
            "port": query_port,
        },
        "rcon": {
            "address": config.get("rcon", {}).get("address", _DEFAULT_BIND_ADDRESS),
            "port": rcon_port,
            "password": rcon_password,
            "permission": config.get("rcon", {}).get("permission", "admin"),
            "maxClients": config.get("rcon", {}).get("maxClients", 16),
        },
        "game": {
            "name": config.get("game", {}).get("name", server.get("name", "Arma Reforger Server")),
            "password": config.get("game", {}).get("password", ""),
            "passwordAdmin": config.get("game", {}).get("passwordAdmin", env.get("admin_password", "")),
            "scenarioId": config.get("game", {}).get("scenarioId", _DEFAULT_SCENARIO),
            "playerCountLimit": config.get("game", {}).get("playerCountLimit", _DEFAULT_PLAYER_LIMIT),
            "visible": config.get("game", {}).get("visible", _DEFAULT_VISIBLE),
            "crossPlatform": config.get("game", {}).get("crossPlatform", _DEFAULT_CROSSPLAY),
            "supportedPlatforms": config.get("game", {}).get("supportedPlatforms", ["PLATFORM_PC", "PLATFORM_XBL"]),
            "modsRequiredByDefault": config.get("game", {}).get("modsRequiredByDefault", True),
            "missionHeader": config.get("game", {}).get("missionHeader", {}),
            "gameProperties": {
                "serverMaxViewDistance": config.get("game", {}).get("gameProperties", {}).get("serverMaxViewDistance", 2500),
                "serverMinGrassDistance": config.get("game", {}).get("gameProperties", {}).get("serverMinGrassDistance", 50),
                "networkViewDistance": config.get("game", {}).get("gameProperties", {}).get("networkViewDistance", 1000),
                "disableThirdPerson": config.get("game", {}).get("gameProperties", {}).get("disableThirdPerson", False),
                "fastValidation": config.get("game", {}).get("gameProperties", {}).get("fastValidation", _DEFAULT_FAST_VALIDATION),
                "battlEye": config.get("game", {}).get("gameProperties", {}).get("battlEye", _DEFAULT_BATTLEYE),
                "VONDisableUI": config.get("game", {}).get("gameProperties", {}).get("VONDisableUI", _DEFAULT_VON_DISABLED),
                "VONDisableDirectSpeechUI": config.get("game", {}).get("gameProperties", {}).get("VONDisableDirectSpeechUI", _DEFAULT_VON_DISABLED),
                "VONTransmitCrossFaction": config.get("game", {}).get("gameProperties", {}).get("VONTransmitCrossFaction", _DEFAULT_VON_CROSS_FACTION),
            },
            "mods": _build_mods_list(mods),
        },
        "operating": {
            "lobbyPlayerSynchronise": config.get("operating", {}).get("lobbyPlayerSynchronise", True),
            "disableNavmeshStreaming": config.get("operating", {}).get("disableNavmeshStreaming", False),
            "disableServerShutdown": config.get("operating", {}).get("disableServerShutdown", False),
            "disableAI": config.get("operating", {}).get("disableAI", _DEFAULT_DISABLE_AI),
            "playerSaveTime": config.get("operating", {}).get("playerSaveTime", 120),
            "aiLimit": config.get("operating", {}).get("aiLimit", -1),
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
