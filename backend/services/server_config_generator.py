"""Generate and persist Arma Reforger server configuration."""

from __future__ import annotations

import json
import logging
import os
import re
import secrets
from pathlib import Path
from typing import Any, Dict, List, Tuple

from config import SERVER_CONFIG_FILENAME, SERVER_SAT_REQUIRED_MOD_ID

logger = logging.getLogger(__name__)

DEFAULT_SCENARIO = "{59AD59368755F41A}Missions/21_GM_Eden.conf"
DEFAULT_SUPPORTED_PLATFORMS = ["PLATFORM_PC", "PLATFORM_XBL", "PLATFORM_PSN"]
DEFAULT_MOD_NAME = "Server Admin Tools"

# ── Arma Reforger config schema whitelist ────────────────────────────────
# Only keys listed here are emitted in the written server config.  Any
# unknown / unsupported key is silently dropped so we never send a value
# the Reforger engine rejects during JSON-schema validation.
#
# Types:  bool, int, str, list, dict   (Python built-in types)
VALID_OPERATING_KEYS: dict[str, type] = {
    "lobbyPlayerSynchronise": bool,
    "disableNavmeshStreaming": list,        # Changed from bool → array in 1.2
    "disableServerShutdown": bool,
    "disableAI": bool,
    "disableCrashReporter": bool,
    "playerSaveTime": int,
    "aiLimit": int,
    "slotReservationTimeout": int,
    "joinQueue": dict,
}


def _default_rcon_password(server: Dict[str, Any]) -> str:
    """Generate a cryptographically-random RCON password.

    If the server already has an rcon_password persisted, return that so
    the value stays stable across config regenerations.  Otherwise create a
    new 24-character URL-safe random token.
    """
    existing = server.get("rcon_password")
    if existing:
        return existing
    return secrets.token_urlsafe(18)  # ~24 characters (18 bytes base64url-encoded)


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


def _normalize_any_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_navmesh_streaming(value: Any) -> list | None:
    """Normalise ``disableNavmeshStreaming`` to the array type required since
    Arma Reforger 1.2.

    * ``list``/``tuple`` → kept as-is (already correct type).
    * ``True`` (legacy boolean) → ``[]``  (disable streaming for all projects).
    * ``False`` / ``None`` / missing → ``None`` (omit the key — streaming
      stays enabled, which is the engine default).
    """
    if isinstance(value, (list, tuple)):
        return list(value)
    if value is True:
        return []
    # False, None, or any other non-truthy value → omit from config
    return None


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, (list, tuple)):
        return []
    return [
        str(item).strip()
        for item in value
        if str(item).strip()
    ]


def _sanitize_join_queue(value: Any) -> dict | None:
    if not isinstance(value, dict):
        return None
    max_size = max(0, _normalize_any_int(value.get("maxSize"), 0))
    return {"maxSize": max_size}


def _sanitize_persistence(value: Any) -> dict:
    if not isinstance(value, dict):
        return {}

    result: dict[str, Any] = {}
    if "autoSaveInterval" in value:
        result["autoSaveInterval"] = max(0, _normalize_any_int(value.get("autoSaveInterval"), 10))
    if "hiveId" in value:
        result["hiveId"] = max(0, _normalize_any_int(value.get("hiveId"), 0))
    if isinstance(value.get("databases"), dict):
        result["databases"] = value.get("databases") or {}
    if isinstance(value.get("storages"), dict):
        result["storages"] = value.get("storages") or {}
    return result


def normalize_mod_entry(mod: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a mod entry for internal storage.

    Preserves rich metadata (author, description, etc.) alongside the
    identifiers needed by the Reforger server config.
    """
    mod_id = mod.get("mod_id") or mod.get("modId") or mod.get("id") or ""
    if not mod_id:
        return {}

    entry: Dict[str, Any] = {
        "modId": mod_id,
        "name": mod.get("name") or mod_id,
    }
    # Only store version when a non-empty value is provided.
    version = (mod.get("version") or "").strip()
    if version and version.lower() != "latest":
        entry["version"] = version
    if isinstance(mod.get("required"), bool):
        entry["required"] = mod["required"]

    # Preserve optional metadata for UI display (not written to config JSON).
    for meta_key in ("author", "description", "thumbnail_url", "tags",
                     "dependencies", "scenario_ids", "metadata_source",
                     "system_managed"):
        if mod.get(meta_key):
            entry[meta_key] = mod[meta_key]

    return entry


def format_mod_for_config(mod: Dict[str, Any]) -> Dict[str, Any]:
    """Format a mod entry strictly for the Arma Reforger server config JSON.

    Only includes fields that are valid in the Reforger server configuration:
    ``modId``, ``name``, optionally ``version``, and optionally ``required``
    (only emitted when the mod dict contains an explicit boolean value for the
    ``required`` key).  No other metadata (author, description, etc.) is included.
    """
    mod_id = mod.get("modId") or mod.get("mod_id") or ""
    if not mod_id:
        return {}

    config_entry: Dict[str, Any] = {
        "modId": mod_id,
        "name": mod.get("name") or mod_id,
    }
    # Only include version when explicitly set to a non-empty, non-"latest" value.
    version = (mod.get("version") or "").strip()
    if version and version.lower() != "latest":
        config_entry["version"] = version
    if isinstance(mod.get("required"), bool):
        config_entry["required"] = mod["required"]

    return config_entry


def ensure_required_mods(mods: List[Dict[str, Any]], sat_enabled: bool = True) -> List[Dict[str, Any]]:
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

    if sat_enabled and SERVER_SAT_REQUIRED_MOD_ID not in seen:
        normalized.append(
            {
                "modId": SERVER_SAT_REQUIRED_MOD_ID,
                "name": DEFAULT_MOD_NAME,
                "system_managed": True,
            }
        )
    return normalized


def mods_for_config(mods: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return the ``game.mods`` array suitable for the Reforger server config.

    Strips internal metadata and only emits valid Reforger fields.
    """
    return [formatted_mod for m in mods if (formatted_mod := format_mod_for_config(m))]


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
    props = dict(game.get("gameProperties") or {})
    if "VONTransmitCrossFaction" in props and "VONCanTransmitCrossFaction" not in props:
        props["VONCanTransmitCrossFaction"] = props["VONTransmitCrossFaction"]
    if props:
        game["gameProperties"] = props
    if game:
        translated["game"] = game
    else:
        translated.pop("game", None)
    return translated


def _sanitize_operating(operating: Dict[str, Any]) -> Dict[str, Any]:
    """Strip unknown or incorrectly-typed keys from the ``operating`` section.

    Only keys present in :data:`VALID_OPERATING_KEYS` are retained.  Values
    whose type does not match the expected schema type are silently dropped
    to prevent Reforger engine JSON-schema validation errors.

    ``disableNavmeshStreaming`` receives special treatment: boolean values
    (legacy pre-1.2 configs) are migrated to the required array type via
    :func:`_normalize_navmesh_streaming`.

    Returns a new dict containing only valid, correctly-typed keys.
    """
    sanitized: Dict[str, Any] = {}
    for key, value in operating.items():
        expected_type = VALID_OPERATING_KEYS.get(key)
        if expected_type is None:
            logger.debug("Dropping unknown operating key %r", key)
            continue
        # Special handling: disableNavmeshStreaming must be an array.
        if key == "disableNavmeshStreaming":
            converted = _normalize_navmesh_streaming(value)
            if converted is not None:
                sanitized[key] = converted
            continue
        # In Python, bool is a subclass of int.  We must reject booleans
        # for integer-typed fields so they don't leak into the JSON config
        # (the Reforger engine expects a real integer, not true/false).
        if expected_type is int and isinstance(value, bool):
            logger.debug(
                "Dropping operating key %r: got bool, expected int",
                key,
            )
            continue
        if not isinstance(value, expected_type):
            logger.debug(
                "Dropping operating key %r with wrong type %s (expected %s)",
                key, type(value).__name__, expected_type.__name__,
            )
            continue
        if key == "joinQueue":
            normalized_join_queue = _sanitize_join_queue(value)
            if normalized_join_queue is not None:
                sanitized[key] = normalized_join_queue
            continue
        sanitized[key] = value
    return sanitized


def build_default_config(server: Dict[str, Any]) -> Dict[str, Any]:
    ports = server.get("ports") or {}
    config = server.get("config") or {}
    game = config.get("game") or {}
    operating = config.get("operating") or {}
    game_props = game.get("gameProperties") or {}
    persistence = game.get("persistence") or {}
    rcon = config.get("rcon") or {}
    a2s = config.get("a2s") or {}

    result: Dict[str, Any] = {
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
        },
        "game": {
            "name": game.get("name", server.get("name", "Arma Reforger Server")),
            "scenarioId": game.get("scenarioId", DEFAULT_SCENARIO),
            "maxPlayers": _normalize_int(game.get("maxPlayers"), 32),
            "visible": _normalize_bool(game.get("visible"), True),
            "crossPlatform": _normalize_bool(game.get("crossPlatform"), True),
            "mods": mods_for_config(ensure_required_mods(server.get("mods") or [], sat_enabled=server.get("sat_enabled", True))),
        },
    }
    if "password" in game:
        result["game"]["password"] = game.get("password", "")
    if "passwordAdmin" in game:
        result["game"]["passwordAdmin"] = game.get("passwordAdmin", "")

    admins = _normalize_string_list(game.get("admins"))
    if admins:
        result["game"]["admins"] = admins

    supported_platforms = _normalize_string_list(game.get("supportedPlatforms"))
    if supported_platforms:
        result["game"]["supportedPlatforms"] = supported_platforms
    elif not result["game"]["crossPlatform"]:
        result["game"]["supportedPlatforms"] = list(DEFAULT_SUPPORTED_PLATFORMS)

    if "modsRequiredByDefault" in game:
        result["game"]["modsRequiredByDefault"] = _normalize_bool(game.get("modsRequiredByDefault"), True)

    if rcon.get("blacklist"):
        result["rcon"]["blacklist"] = list(rcon.get("blacklist") or [])
    if rcon.get("whitelist"):
        result["rcon"]["whitelist"] = list(rcon.get("whitelist") or [])

    game_properties: Dict[str, Any] = {}
    if "serverMaxViewDistance" in game_props:
        game_properties["serverMaxViewDistance"] = _normalize_int(game_props.get("serverMaxViewDistance"), 1600)
    if "serverMinGrassDistance" in game_props:
        game_properties["serverMinGrassDistance"] = _normalize_int(game_props.get("serverMinGrassDistance"), 0)
    if "networkViewDistance" in game_props:
        game_properties["networkViewDistance"] = _normalize_int(game_props.get("networkViewDistance"), 1500)
    for key, default in (
        ("disableThirdPerson", False),
        ("fastValidation", True),
        ("battlEye", True),
        ("VONDisableUI", False),
        ("VONDisableDirectSpeechUI", False),
        ("VONCanTransmitCrossFaction", False),
    ):
        if key in game_props:
            game_properties[key] = _normalize_bool(game_props.get(key), default)
    if isinstance(game_props.get("missionHeader"), dict) and game_props.get("missionHeader"):
        game_properties["missionHeader"] = game_props["missionHeader"]
    if game_properties:
        result["game"]["gameProperties"] = game_properties

    persistence_section = _sanitize_persistence(persistence)
    if persistence_section:
        result["game"]["persistence"] = persistence_section

    navmesh_streaming = _normalize_navmesh_streaming(operating.get("disableNavmeshStreaming"))
    operating_section: Dict[str, Any] = {}
    for key, default in (
        ("lobbyPlayerSynchronise", True),
        ("disableCrashReporter", False),
        ("disableServerShutdown", False),
        ("disableAI", False),
    ):
        if key in operating:
            operating_section[key] = _normalize_bool(operating.get(key), default)
    if "playerSaveTime" in operating:
        operating_section["playerSaveTime"] = _normalize_any_int(operating.get("playerSaveTime"), 120)
    if "aiLimit" in operating:
        operating_section["aiLimit"] = _normalize_any_int(operating.get("aiLimit"), -1)
    if "slotReservationTimeout" in operating:
        operating_section["slotReservationTimeout"] = max(5, _normalize_any_int(operating.get("slotReservationTimeout"), 60))
    if navmesh_streaming is not None:
        operating_section["disableNavmeshStreaming"] = navmesh_streaming
    join_queue = _sanitize_join_queue(operating.get("joinQueue"))
    if join_queue is not None:
        operating_section["joinQueue"] = join_queue
    if operating_section:
        result["operating"] = _sanitize_operating(operating_section)

    return result


def build_default_server_config(server: Dict[str, Any] | None = None) -> Dict[str, Any]:
    return build_default_config(server or {})


def _flat_legacy_to_current(config: Dict[str, Any]) -> Dict[str, Any]:
    if any(isinstance(config.get(key), dict) for key in ("game", "a2s", "rcon", "operating")):
        return config

    translated: Dict[str, Any] = {}

    for src, dest in (
        ("bindAddress", "bindAddress"),
        ("publicAddress", "publicAddress"),
        ("bindPort", "bindPort"),
        ("publicPort", "publicPort"),
    ):
        if src in config:
            translated[dest] = config[src]

    game: Dict[str, Any] = {}
    for src, dest in (
        ("name", "name"),
        ("password", "password"),
        ("passwordAdmin", "passwordAdmin"),
        ("scenarioId", "scenarioId"),
        ("playerCountLimit", "maxPlayers"),
        ("maxPlayers", "maxPlayers"),
        ("visible", "visible"),
        ("crossPlatform", "crossPlatform"),
        ("supportedPlatforms", "supportedPlatforms"),
        ("modsRequiredByDefault", "modsRequiredByDefault"),
        ("admins", "admins"),
    ):
        if src in config:
            game[dest] = config[src]

    game_props: Dict[str, Any] = {}
    for src, dest in (
        ("serverMaxViewDistance", "serverMaxViewDistance"),
        ("serverMinGrassDistance", "serverMinGrassDistance"),
        ("networkViewDistance", "networkViewDistance"),
        ("disableThirdPerson", "disableThirdPerson"),
        ("fastValidation", "fastValidation"),
        ("battlEye", "battlEye"),
        ("VONDisableUI", "VONDisableUI"),
        ("VONDisableDirectSpeechUI", "VONDisableDirectSpeechUI"),
        ("VONTransmitCrossFaction", "VONCanTransmitCrossFaction"),
        ("VONCanTransmitCrossFaction", "VONCanTransmitCrossFaction"),
    ):
        if src in config:
            game_props[dest] = config[src]
    if isinstance(config.get("missionHeader"), dict):
        game_props["missionHeader"] = config["missionHeader"]
    if game_props:
        game["gameProperties"] = game_props
    if game:
        translated["game"] = game

    if "a2s_address" in config:
        translated["a2s"] = {"address": config["a2s_address"]}

    rcon: Dict[str, Any] = {}
    for src, dest in (
        ("rcon_address", "address"),
        ("rcon_password", "password"),
        ("rcon_permission", "permission"),
        ("rcon_max_clients", "maxClients"),
    ):
        if src in config:
            rcon[dest] = config[src]
    if rcon:
        translated["rcon"] = rcon

    operating: Dict[str, Any] = {}
    for key in (
        "lobbyPlayerSynchronise",
        "disableCrashReporter",
        "disableNavmeshStreaming",
        "disableServerShutdown",
        "disableAI",
        "playerSaveTime",
        "aiLimit",
        "slotReservationTimeout",
        "joinQueue",
    ):
        if key in config:
            operating[key] = config[key]
    if operating:
        translated["operating"] = operating

    return translated


def normalize_server_config(raw_config: Dict[str, Any] | None, server: Dict[str, Any] | None = None) -> Dict[str, Any]:
    server = server or {}
    current = _legacy_to_current(raw_config or {})
    current = _flat_legacy_to_current(current)
    normalized = _deep_merge(build_default_config({**server, "config": current}), current)

    game = normalized.setdefault("game", {})
    game_props = game.setdefault("gameProperties", {})

    # Migrate legacy placement: game.missionHeader → game.gameProperties.missionHeader
    # The Arma Reforger engine schema only accepts missionHeader inside gameProperties;
    # placing it directly under game triggers an additionalProperties validation error.
    if isinstance(game.get("missionHeader"), dict):
        existing_gp_mh = game_props.get("missionHeader")
        if not isinstance(existing_gp_mh, dict) or not existing_gp_mh:
            game_props["missionHeader"] = game.pop("missionHeader")
        else:
            game.pop("missionHeader", None)
    elif "missionHeader" in game:
        game.pop("missionHeader")

    if "VONTransmitCrossFaction" in game_props and "VONCanTransmitCrossFaction" not in game_props:
        game_props["VONCanTransmitCrossFaction"] = game_props["VONTransmitCrossFaction"]

    if isinstance(game.get("persistence"), dict):
        game["persistence"] = _sanitize_persistence(game.get("persistence"))
        if not game["persistence"]:
            game.pop("persistence", None)

    # Sanitise the operating section: coerce types and strip unknown keys so
    # the Reforger engine's JSON-schema validator does not reject the config.
    normalized["operating"] = _sanitize_operating(normalized.get("operating") or {})
    if not normalized["operating"]:
        normalized.pop("operating", None)
    if not game_props:
        game.pop("gameProperties", None)

    return normalized


def generate_reforger_config(server: Dict[str, Any]) -> Dict[str, Any]:
    config = normalize_server_config(server.get("config") or {}, server)
    config["bindPort"] = _normalize_int((server.get("ports") or {}).get("game"), config["bindPort"])
    config["publicPort"] = config["bindPort"]
    config.setdefault("a2s", {})
    config["a2s"]["port"] = _normalize_int((server.get("ports") or {}).get("query"), config["a2s"].get("port", 17777))
    config["a2s"]["address"] = config["a2s"].get("address") or "0.0.0.0"
    config.setdefault("rcon", {})
    config["rcon"]["port"] = _normalize_int((server.get("ports") or {}).get("rcon"), config["rcon"].get("port", 19999))
    config["rcon"]["address"] = config["rcon"].get("address") or "0.0.0.0"
    config["game"]["name"] = config["game"].get("name") or server.get("name", "Arma Reforger Server")
    config["game"]["mods"] = mods_for_config(ensure_required_mods(server.get("mods") or [], sat_enabled=server.get("sat_enabled", True)))
    if not config["game"]["mods"]:
        config["game"].pop("mods", None)
    if not config.get("operating"):
        config.pop("operating", None)
    if not config["game"].get("gameProperties"):
        config["game"].pop("gameProperties", None)
    if not config["game"].get("persistence"):
        config["game"].pop("persistence", None)
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
        file_contents = json.dumps(config, indent=2, ensure_ascii=False)
        fd = os.open(target_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(file_contents)
        logger.info("Wrote Reforger config to %s", target_file)
        return True, str(target_file)
    except OSError as exc:
        logger.error("Failed to write server config: %s", exc)
        return False, f"Failed to write config file: {exc}"


# ── Auto-recovery: known error patterns and fixers ──────────────────────────
# Each entry maps a regex matched against a provisioning/engine error message
# to a callable that mutates the server dict (specifically its ``config``) to
# attempt an automatic correction.  The provisioning loop applies matching
# fixers and retries up to ``MAX_AUTO_RECOVERY_ATTEMPTS``.

MAX_AUTO_RECOVERY_ATTEMPTS = 3

# Pattern → (human description, fixer callable)
_ERROR_TYPE_PATTERN = re.compile(
    r'Param "(?P<path>#/[^"]+)" has an incorrect type\.\s*Expected "(?P<expected>\w+)"',
    re.IGNORECASE,
)
_ERROR_INVALID_JSON = re.compile(r"JSON is invalid", re.IGNORECASE)
_ERROR_ADDITIONAL_PROPS = re.compile(
    r'additional\s*properties.*"(?P<key>[^"]+)"',
    re.IGNORECASE,
)


def _fix_type_mismatch(server: Dict[str, Any], error_message: str) -> Tuple[bool, str]:
    """Attempt to fix a JSON-schema type-mismatch error by coercing the value.

    Returns ``(fixed, description)`` where *fixed* is True if a repair was
    applied and *description* explains what changed.
    """
    m = _ERROR_TYPE_PATTERN.search(error_message)
    if not m:
        return False, ""

    json_path = m.group("path")         # e.g. "#/operating/disableNavmeshStreaming"
    expected = m.group("expected")       # e.g. "array"

    # Navigate the config to the offending key
    parts = [p for p in json_path.lstrip("#/").split("/") if p]
    config = server.get("config") or {}
    parent = config
    for part in parts[:-1]:
        parent = parent.get(part, {})
        if not isinstance(parent, dict):
            return False, f"Cannot navigate to {json_path}"
    key = parts[-1] if parts else ""
    if not key or key not in parent:
        return False, f"Key {json_path} not found in config"

    old_value = parent[key]

    # Apply type coercion based on the expected schema type
    if expected == "array":
        parent[key] = []
    elif expected == "boolean":
        parent[key] = bool(old_value)
    elif expected == "integer":
        try:
            parent[key] = int(old_value)
        except (TypeError, ValueError):
            del parent[key]
    elif expected == "string":
        parent[key] = str(old_value)
    elif expected == "object":
        parent[key] = {}
    else:
        # Unknown expected type — remove the offending key as a safe default
        del parent[key]

    server["config"] = config
    desc = f"Auto-fixed {json_path}: coerced {type(old_value).__name__} to {expected}"
    logger.info(desc)
    return True, desc


def _fix_additional_property(server: Dict[str, Any], error_message: str) -> Tuple[bool, str]:
    """Remove an unrecognised additional property flagged by the engine."""
    m = _ERROR_ADDITIONAL_PROPS.search(error_message)
    if not m:
        return False, ""

    bad_key = m.group("key")
    config = server.get("config") or {}

    # Walk the entire config tree and remove the key wherever it appears
    removed = _remove_key_recursive(config, bad_key)
    if removed:
        server["config"] = config
        desc = f"Auto-fixed: removed unrecognised property '{bad_key}'"
        logger.info(desc)
        return True, desc
    return False, ""


def _remove_key_recursive(obj: Dict[str, Any], key: str) -> bool:
    """Recursively remove *key* from all nested dicts.  Returns True if any removal occurred."""
    removed = False
    if key in obj:
        del obj[key]
        removed = True
    for v in obj.values():
        if isinstance(v, dict):
            if _remove_key_recursive(v, key):
                removed = True
    return removed


def attempt_auto_recovery(
    server: Dict[str, Any],
    error_message: str,
) -> Tuple[bool, List[str]]:
    """Try to automatically repair a server config based on an error message.

    Applies all matching fixers and then regenerates + rewrites the config.

    Returns ``(recovered, descriptions)`` where *recovered* is True if at
    least one fix was applied and *descriptions* lists what was changed.
    """
    fixers = [
        _fix_type_mismatch,
        _fix_additional_property,
    ]

    descriptions: List[str] = []
    for fixer in fixers:
        fixed, desc = fixer(server, error_message)
        if fixed:
            descriptions.append(desc)

    if not descriptions:
        return False, []

    # Regenerate the config after applying fixes to ensure consistency
    server["config"] = generate_reforger_config(server)
    return True, descriptions
