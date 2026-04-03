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
    if not isinstance(data, dict):
        raise ValueError("ServerAdminTools config must be a JSON object")
    return data


def save_sat_config(config_path: str, data: Dict[str, Any]) -> None:
    if not isinstance(data, dict):
        raise ValueError("ServerAdminTools config must be a JSON object")
    path = Path(config_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


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
