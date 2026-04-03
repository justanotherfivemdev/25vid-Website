"""Generate and persist Arma Reforger server configuration."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple

from config import SERVER_CONFIG_FILENAME, SERVER_SAT_REQUIRED_MOD_ID

logger = logging.getLogger(__name__)

DEFAULT_SCENARIO = "{ECC61978EDCC2B5A}Missions/23_Campaign.conf"
DEFAULT_SUPPORTED_PLATFORMS = ["PLATFORM_PC", "PLATFORM_XBL"]
DEFAULT_MOD_NAME = "Server Admin Tools"


def _default_rcon_password(server: Dict[str, Any]) -> str:
    server_id = (server.get("id") or "server").replace("-", "")
    return f"rcon{server_id[:12]}"


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _normalize_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _normalize_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except (TypeError, ValueError):
        return default


def normalize_mod_entry(mod: Dict[str, Any]) -> Dict[str, Any]:
    mod_id = mod.get("mod_id") or mod.get("modId") or mod.get("id") or ""
    if not mod_id:
        return {}

    entry: Dict[str, Any] = {
        "modId": mod_id,
        "name": mod.get("name") or mod_id,
        "required": mod.get("required", True),
    }
    if mod.get("version"):
        entry["version"] = mod["version"]
    return entry


def ensure_required_mods(mods: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for raw_mod in mods or []:
        entry = normalize_mod_entry(raw_mod)
        mod_id = entry.get("modId")
        if not mod_id or mod_id in seen:
            continue
        if raw_mod.get("enabled", True) is False:
            continue
        normalized.append(entry)
        seen.add(mod_id)

    if SERVER_SAT_REQUIRED_MOD_ID not in seen:
        normalized.append(
            {
                "modId": SERVER_SAT_REQUIRED_MOD_ID,
                "name": DEFAULT_MOD_NAME,
                "required": True,
            }
        )
    return normalized


def _legacy_to_current(config: Dict[str, Any]) -> Dict[str, Any]:
    """Translate previously stored legacy keys to the current schema."""
    if not config:
        return {}

    translated = dict(config)
    if "gameHostBindAddress" in translated and "bindAddress" not in translated:
        translated["bindAddress"] = translated["gameHostBindAddress"]
    if "gameHostBindPort" in translated and "bindPort" not in translated:
        translated["bindPort"] = translated["gameHostBindPort"]
    if "gameHostRegisterBindAddress" in translated and "publicAddress" not in translated:
        translated["publicAddress"] = translated["gameHostRegisterBindAddress"]
    if "gameHostRegisterPort" in translated and "publicPort" not in translated:
        translated["publicPort"] = translated["gameHostRegisterPort"]

    game = dict(translated.get("game") or {})
    if "playerCountLimit" in game and "maxPlayers" not in game:
        game["maxPlayers"] = game["playerCountLimit"]
    translated["game"] = game
    return translated


def build_default_config(server: Dict[str, Any]) -> Dict[str, Any]:
    ports = server.get("ports") or {}
    config = server.get("config") or {}
    game = config.get("game") or {}
    operating = config.get("operating") or {}
    game_props = game.get("gameProperties") or {}
    rcon = config.get("rcon") or {}
    a2s = config.get("a2s") or {}

    return {
        "bindAddress": config.get("bindAddress", "0.0.0.0"),
        "bindPort": _normalize_int(ports.get("game"), 2001),
        "publicAddress": config.get("publicAddress", ""),
        "publicPort": _normalize_int(ports.get("game"), 2001),
        "a2s": {
            "address": a2s.get("address", "0.0.0.0"),
            "port": _normalize_int(ports.get("query"), 17777),
        },
        "rcon": {
            "address": rcon.get("address", "0.0.0.0"),
            "port": _normalize_int(ports.get("rcon"), 19999),
            "password": rcon.get("password") or _default_rcon_password(server),
            "permission": rcon.get("permission", "admin"),
            "maxClients": _normalize_int(rcon.get("maxClients"), 16),
            "blacklist": list(rcon.get("blacklist") or []),
            "whitelist": list(rcon.get("whitelist") or []),
        },
        "game": {
            "name": game.get("name", server.get("name", "Arma Reforger Server")),
            "password": game.get("password", ""),
            "passwordAdmin": game.get("passwordAdmin", ""),
            "admins": list(game.get("admins") or []),
            "scenarioId": game.get("scenarioId", DEFAULT_SCENARIO),
            "maxPlayers": _normalize_int(game.get("maxPlayers"), 32),
            "visible": _normalize_bool(game.get("visible"), True),
            "crossPlatform": _normalize_bool(game.get("crossPlatform"), True),
            "supportedPlatforms": list(game.get("supportedPlatforms") or DEFAULT_SUPPORTED_PLATFORMS),
            "modsRequiredByDefault": _normalize_bool(game.get("modsRequiredByDefault"), True),
            "gameProperties": {
                "serverMaxViewDistance": _normalize_int(game_props.get("serverMaxViewDistance"), 2500),
                "serverMinGrassDistance": _normalize_int(game_props.get("serverMinGrassDistance"), 50),
                "networkViewDistance": _normalize_int(game_props.get("networkViewDistance"), 1000),
                "disableThirdPerson": _normalize_bool(game_props.get("disableThirdPerson"), False),
                "fastValidation": _normalize_bool(game_props.get("fastValidation"), True),
                "battlEye": _normalize_bool(game_props.get("battlEye"), True),
                "VONDisableUI": _normalize_bool(game_props.get("VONDisableUI"), False),
                "VONDisableDirectSpeechUI": _normalize_bool(game_props.get("VONDisableDirectSpeechUI"), False),
                "VONCanTransmitCrossFaction": _normalize_bool(game_props.get("VONCanTransmitCrossFaction"), False),
            },
            "mods": ensure_required_mods(server.get("mods") or []),
        },
        "operating": {
            "lobbyPlayerSynchronise": _normalize_bool(operating.get("lobbyPlayerSynchronise"), True),
            "disableNavmeshStreaming": _normalize_bool(operating.get("disableNavmeshStreaming"), False),
            "disableServerShutdown": _normalize_bool(operating.get("disableServerShutdown"), False),
            "disableAI": _normalize_bool(operating.get("disableAI"), False),
            "playerSaveTime": _normalize_int(operating.get("playerSaveTime"), 120),
            "aiLimit": operating.get("aiLimit", -1),
        },
    }


def generate_reforger_config(server: Dict[str, Any]) -> Dict[str, Any]:
    current = _legacy_to_current(server.get("config") or {})
    config = _deep_merge(build_default_config({**server, "config": current}), current)
    config["bindPort"] = _normalize_int((server.get("ports") or {}).get("game"), config["bindPort"])
    config["publicPort"] = config["bindPort"]
    config.setdefault("a2s", {})
    config["a2s"]["port"] = _normalize_int((server.get("ports") or {}).get("query"), config["a2s"].get("port", 17777))
    config["a2s"]["address"] = config["a2s"].get("address") or "0.0.0.0"
    config.setdefault("rcon", {})
    config["rcon"]["port"] = _normalize_int((server.get("ports") or {}).get("rcon"), config["rcon"].get("port", 19999))
    config["rcon"]["address"] = config["rcon"].get("address") or "0.0.0.0"
    config["game"]["name"] = config["game"].get("name") or server.get("name", "Arma Reforger Server")
    config["game"]["mods"] = ensure_required_mods(server.get("mods") or [])
    return config


REQUIRED_PATHS: List[Tuple[List[str], str]] = [
    (["bindPort"], "bindPort is required"),
    (["publicPort"], "publicPort is required"),
    (["a2s", "port"], "a2s.port is required"),
    (["rcon", "port"], "rcon.port is required"),
    (["rcon", "password"], "rcon.password is required to enable RCON"),
    (["game", "name"], "game.name is required"),
    (["game", "scenarioId"], "game.scenarioId is required"),
]


def validate_config(config: Dict[str, Any]) -> Tuple[bool, List[str]]:
    errors: List[str] = []
    for path, message in REQUIRED_PATHS:
        value: Any = config
        for key in path:
            if not isinstance(value, dict):
                value = None
                break
            value = value.get(key)
        if value is None or (isinstance(value, str) and not value.strip()):
            errors.append(message)
    return len(errors) == 0, errors


async def write_config_file(server: Dict[str, Any], config_dir: str | None = None) -> Tuple[bool, str]:
    config = generate_reforger_config(server)
    valid, errors = validate_config(config)
    if not valid:
        return False, "; ".join(errors)

    if config_dir:
        target_dir = Path(config_dir)
    elif server.get("config_path"):
        target_dir = Path(server["config_path"]).parent
    elif server.get("data_root"):
        target_dir = Path(server["data_root"]) / "Configs"
    else:
        return False, "Server is missing config_path/data_root"

    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / SERVER_CONFIG_FILENAME
    try:
        target_file.write_text(json.dumps(config, indent=2), encoding="utf-8")
        logger.info("Wrote Reforger config to %s", target_file)
        return True, str(target_file)
    except OSError as exc:
        logger.error("Failed to write server config: %s", exc)
        return False, f"Failed to write config file: {exc}"
