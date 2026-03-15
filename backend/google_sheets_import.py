import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"

SUPPORTED_IMPORT_FIELDS = {
    "username",
    "email",
    "discord_username",
    "discord_id",
    "rank",
    "role",
    "permissions",
    "unit",
    "status",
}

AUTO_COLUMN_ALIASES = {
    "username": {"username", "user", "name", "display_name", "displayname"},
    "email": {"email", "email_address", "mail"},
    "discord_username": {"discord_username", "discord", "discord_name", "discord user", "discorduser"},
    "discord_id": {"discord_id", "discordid", "discord user id", "discord_user_id"},
    "rank": {"rank", "grade"},
    "role": {"role", "user_role"},
    "permissions": {"permissions", "permission", "scopes"},
    "unit": {"unit", "company", "platoon", "squad", "section"},
    "status": {"status", "member_status"},
}


class GoogleSheetsImportError(Exception):
    pass


def normalize_column_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


def parse_spreadsheet_id(spreadsheet_id: Optional[str], spreadsheet_url: Optional[str]) -> Optional[str]:
    if spreadsheet_id:
        return spreadsheet_id.strip()
    if not spreadsheet_url:
        return None

    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", spreadsheet_url)
    if match:
        return match.group(1)

    if re.fullmatch(r"[a-zA-Z0-9-_]{20,}", spreadsheet_url.strip()):
        return spreadsheet_url.strip()

    return None


def build_field_mapping(headers: List[str], manual_mapping: Optional[Dict[str, str]] = None) -> Dict[str, int]:
    header_lookup: Dict[str, int] = {}
    for idx, header in enumerate(headers):
        if not isinstance(header, str):
            continue
        cleaned = normalize_column_key(header)
        if cleaned:
            header_lookup[cleaned] = idx

    mapping: Dict[str, int] = {}

    for field, aliases in AUTO_COLUMN_ALIASES.items():
        for alias in aliases:
            idx = header_lookup.get(normalize_column_key(alias))
            if idx is not None:
                mapping[field] = idx
                break

    if manual_mapping:
        for field, header_name in manual_mapping.items():
            if field not in SUPPORTED_IMPORT_FIELDS:
                continue
            idx = header_lookup.get(normalize_column_key(header_name))
            if idx is not None:
                mapping[field] = idx

    return mapping


def row_to_mapped_fields(row: List[Any], mapping: Dict[str, int]) -> Dict[str, str]:
    mapped: Dict[str, str] = {}
    for field, index in mapping.items():
        if index >= len(row):
            continue
        raw_value = row[index]
        if raw_value is None:
            continue
        value = str(raw_value).strip()
        if value:
            mapped[field] = value
    return mapped


def split_permissions(value: str) -> List[str]:
    return [p.strip() for p in re.split(r"[,;|]", value) if p.strip()]


async def fetch_sheet_rows(spreadsheet_id: str, sheet_name: Optional[str] = None) -> Tuple[str, List[List[str]]]:
    api_key = os.environ.get("GOOGLE_SHEETS_API_KEY", "").strip()
    if not api_key:
        raise GoogleSheetsImportError("GOOGLE_SHEETS_API_KEY is not configured")

    async with httpx.AsyncClient(timeout=20.0) as client:
        metadata_res = await client.get(
            f"{GOOGLE_SHEETS_API_BASE}/{spreadsheet_id}",
            params={"key": api_key},
        )

        if metadata_res.status_code >= 400:
            raise GoogleSheetsImportError(
                f"Unable to access spreadsheet metadata (status {metadata_res.status_code}). "
                "Ensure the sheet is accessible to the configured API key."
            )

        metadata = metadata_res.json()
        sheets = metadata.get("sheets", [])
        available_sheet_names = [s.get("properties", {}).get("title") for s in sheets if s.get("properties", {}).get("title")]

        target_sheet = sheet_name or (available_sheet_names[0] if available_sheet_names else None)
        if not target_sheet:
            raise GoogleSheetsImportError("Spreadsheet has no sheets to import")

        values_res = await client.get(
            f"{GOOGLE_SHEETS_API_BASE}/{spreadsheet_id}/values/{target_sheet}",
            params={"key": api_key},
        )

        if values_res.status_code >= 400:
            raise GoogleSheetsImportError(
                f"Unable to read sheet values from '{target_sheet}' (status {values_res.status_code})."
            )

        values = values_res.json().get("values", [])
        if not values:
            raise GoogleSheetsImportError("Sheet is empty")

        return target_sheet, values
