import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import httpx

GOOGLE_SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"
GOOGLE_SHEETS_GVIZ_BASE = "https://docs.google.com/spreadsheets/d"

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
    "billet",
    "specialization",
    "favorite_role",
}

AUTO_COLUMN_ALIASES = {
    "username": [
        "username",
        "ingamename",
        "in game name",
        "in_game_name",
        "member_username",
        "member username",
        "display_name",
        "displayname",
        "name",
        "user",
    ],
    "email": ["email", "email_address", "mail"],
    "discord_username": [
        "discord_username",
        "discord username",
        "personnel",
        "discord_name",
        "discord user",
        "discorduser",
        "discord",
    ],
    "discord_id": [
        "discord_id",
        "discord user id",
        "discord_user_id",
        "discord uid",
        "discordid",
    ],
    "rank": ["rank", "grade"],
    "role": ["site_role", "user_role", "account_role", "access_role"],
    "permissions": ["permissions", "permission", "scopes"],
    "unit": ["unit", "company", "platoon", "squad", "section"],
    "status": ["status", "member_status"],
    "billet": ["role", "role / phase", "role_phase", "assignment", "duty_position"],
    "favorite_role": ["favorite_role", "preferred_role", "primary_role"],
    "specialization": ["extra duties", "extra_duties", "additional_duties", "notes"],
}



class GoogleSheetsImportError(Exception):
    pass


def normalize_column_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


def parse_spreadsheet_id(spreadsheet_id: Optional[str], spreadsheet_url: Optional[str]) -> Optional[str]:
    if spreadsheet_id:
        candidate = spreadsheet_id.strip()
        if re.fullmatch(r"[A-Za-z0-9-_]{20,}", candidate):
            return candidate
        return None
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


def detect_header_row(
    values: List[List[Any]],
    manual_mapping: Optional[Dict[str, str]] = None,
    search_limit: int = 25,
) -> Tuple[int, List[str], Dict[str, int]]:
    best_index = -1
    best_headers: List[str] = []
    best_mapping: Dict[str, int] = {}
    best_score = -1

    for idx, row in enumerate(values[:search_limit]):
        headers = [str(cell).strip() if cell is not None else "" for cell in row]
        mapping = build_field_mapping(headers, manual_mapping)
        score = len(mapping)
        if "discord_id" in mapping or "email" in mapping:
            score += 2
        if "username" in mapping:
            score += 1

        if score > best_score:
            best_index = idx
            best_headers = headers
            best_mapping = mapping
            best_score = score

    if best_index < 0 or not best_mapping:
        raise GoogleSheetsImportError(
            "Unable to detect a usable header row in the Google Sheet. "
            "Include headers such as Name, Username, Discord, Discord ID, Rank, or Email."
        )

    return best_index, best_headers, best_mapping


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


def _parse_gviz_payload(text: str) -> Dict[str, Any]:
    start = text.find("(")
    end = text.rfind(")")
    if start == -1 or end == -1 or end <= start:
        raise GoogleSheetsImportError("Unexpected response format from the public Google Sheet feed")
    try:
        return json.loads(text[start + 1:end])
    except json.JSONDecodeError as exc:
        raise GoogleSheetsImportError("Unable to parse the public Google Sheet feed") from exc


def _gviz_table_to_values(table: Dict[str, Any]) -> List[List[str]]:
    cols = table.get("cols", [])
    col_count = len(cols)
    rows: List[List[str]] = []

    for row in table.get("rows", []):
        cells = row.get("c", []) or []
        materialized: List[str] = []
        for idx in range(col_count):
            cell = cells[idx] if idx < len(cells) else None
            value = ""
            if isinstance(cell, dict):
                raw = cell.get("f")
                if raw is None:
                    raw = cell.get("v")
                if raw is not None:
                    value = str(raw)
            materialized.append(value.strip())
        if any(materialized):
            rows.append(materialized)

    return rows


async def _fetch_sheet_rows_via_public_feed(
    client: httpx.AsyncClient,
    spreadsheet_id: str,
    sheet_name: Optional[str] = None,
) -> Tuple[str, List[List[str]]]:
    params = {"tqx": "out:json"}
    if sheet_name:
        params["sheet"] = sheet_name

    try:
        response = await client.get(
            f"{GOOGLE_SHEETS_GVIZ_BASE}/{spreadsheet_id}/gviz/tq",
            params=params,
        )
    except httpx.HTTPError as exc:
        raise GoogleSheetsImportError(
            f"Error communicating with the public Google Sheet feed: {exc}"
        ) from exc

    if response.status_code >= 400:
        raise GoogleSheetsImportError(
            f"Unable to read the public Google Sheet feed (status {response.status_code})."
        )

    payload = _parse_gviz_payload(response.text)
    if payload.get("status") != "ok":
        raise GoogleSheetsImportError("Google Sheets reported an error while reading the public feed")

    values = _gviz_table_to_values(payload.get("table", {}))
    if not values:
        raise GoogleSheetsImportError("Sheet is empty")

    return sheet_name or "Sheet1", values


async def fetch_sheet_rows(spreadsheet_id: str, sheet_name: Optional[str] = None) -> Tuple[str, List[List[str]]]:
    api_key = os.environ.get("GOOGLE_SHEETS_API_KEY", "").strip()

    async with httpx.AsyncClient(timeout=20.0) as client:
        if api_key:
            try:
                metadata_res = await client.get(
                    f"{GOOGLE_SHEETS_API_BASE}/{spreadsheet_id}",
                    params={"key": api_key},
                )
                metadata_res.raise_for_status()
                metadata = metadata_res.json()
                sheets = metadata.get("sheets", [])
                available_sheet_names = [
                    s.get("properties", {}).get("title")
                    for s in sheets
                    if s.get("properties", {}).get("title")
                ]

                target_sheet = sheet_name or (available_sheet_names[0] if available_sheet_names else None)
                if not target_sheet:
                    raise GoogleSheetsImportError("Spreadsheet has no sheets to import")

                values_res = await client.get(
                    f"{GOOGLE_SHEETS_API_BASE}/{spreadsheet_id}/values/{quote(target_sheet, safe='')}",
                    params={"key": api_key},
                )
                values_res.raise_for_status()
                values = values_res.json().get("values", [])
                if values:
                    return target_sheet, values
            except (httpx.HTTPError, GoogleSheetsImportError):
                pass

        return await _fetch_sheet_rows_via_public_feed(client, spreadsheet_id, sheet_name)
