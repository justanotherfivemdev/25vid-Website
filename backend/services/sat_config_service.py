"""Server Admin Tools config discovery and persistence helpers."""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from config import SERVER_SAT_BASELINE_PATH

logger = logging.getLogger(__name__)

SAT_CONFIG_FILENAME = "ServerAdminTools_Config.json"


def _clean_key(value: Any) -> str:
    return str(value or "").strip()


def _dedupe_strings(values: Any) -> list[str]:
    if isinstance(values, str):
        values = values.splitlines()
    if not isinstance(values, (list, tuple)):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _normalize_admins(value: Any) -> dict[str, str]:
    result: dict[str, str] = {}
    if isinstance(value, dict):
        for admin_id, name in value.items():
            key = _clean_key(admin_id)
            if key:
                result[key] = str(name or "").strip()
        return result
    if isinstance(value, list):
        for entry in value:
            if not isinstance(entry, dict):
                continue
            key = _clean_key(entry.get("id") or entry.get("playerId") or entry.get("guid"))
            if key:
                result[key] = str(entry.get("name") or entry.get("label") or "").strip()
    return result


def _normalize_bans(value: Any) -> dict[str, str]:
    result: dict[str, str] = {}
    if isinstance(value, dict):
        for player_id, reason in value.items():
            key = _clean_key(player_id)
            if key:
                result[key] = str(reason or "").strip()
        return result
    if isinstance(value, list):
        for entry in value:
            if isinstance(entry, dict):
                key = _clean_key(entry.get("playerId") or entry.get("id") or entry.get("guid"))
                reason = str(entry.get("reason") or "").strip()
            else:
                key = _clean_key(entry)
                reason = ""
            if key:
                result[key] = reason
    return result


def _normalize_message_entries(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in value:
        if not isinstance(entry, dict):
            continue
        message = str(entry.get("message") or "").strip()
        if not message:
            continue
        normalized = {**entry, "message": message}
        dedupe_key = json.dumps(normalized, sort_keys=True, ensure_ascii=True)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        result.append(normalized)
    return result


def normalize_sat_config(data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("ServerAdminTools config must be a JSON object")

    normalized = dict(data)
    normalized["admins"] = _normalize_admins(normalized.get("admins"))
    normalized["bans"] = _normalize_bans(normalized.get("bans"))
    normalized["serverMessage"] = _dedupe_strings(normalized.get("serverMessage"))
    normalized["eventsApiEventsEnabled"] = _dedupe_strings(normalized.get("eventsApiEventsEnabled"))
    normalized["repeatedChatMessages"] = _normalize_message_entries(normalized.get("repeatedChatMessages"))
    normalized["scheduledChatMessages"] = _normalize_message_entries(normalized.get("scheduledChatMessages"))
    return normalized


def discover_sat_config(profile_path: str) -> Tuple[Optional[str], str]:
    root = Path(profile_path)
    if not root.exists():
        return None, "pending"

    for match in root.rglob(SAT_CONFIG_FILENAME):
        if match.is_file():
            return str(match), "discovered"
    return None, "missing"


def load_sat_config(config_path: str) -> Dict[str, Any]:
    path = Path(config_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    return normalize_sat_config(data)


def save_sat_config(config_path: str, data: Dict[str, Any]) -> None:
    normalized = normalize_sat_config(data)
    path = Path(config_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(normalized, indent=2), encoding="utf-8")


def overlay_baseline_if_configured(config_path: str) -> bool:
    if not SERVER_SAT_BASELINE_PATH:
        return False

    source = Path(SERVER_SAT_BASELINE_PATH)
    target = Path(config_path)
    if not source.exists():
        logger.warning("Configured SAT baseline file %s does not exist", source)
        return False

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return True
