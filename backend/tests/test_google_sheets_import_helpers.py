import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from google_sheets_import import (
    parse_spreadsheet_id,
    build_field_mapping,
    row_to_mapped_fields,
)


def test_parse_spreadsheet_id_from_url_and_raw_id():
    sheet_id = "1abcDEFghiJKL_mnopQRSTuvWXyz0123456789"
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit#gid=0"

    assert parse_spreadsheet_id(None, url) == sheet_id
    assert parse_spreadsheet_id(sheet_id, None) == sheet_id
    assert parse_spreadsheet_id(None, "not-a-valid-url") is None


def test_build_field_mapping_is_deterministic_with_competing_headers():
    headers = ["Name", "Username", "Email", "Company", "Platoon"]

    mapping = build_field_mapping(headers)

    # deterministic alias order should prefer Username over Name
    assert mapping["username"] == headers.index("Username")
    # and unit should prefer Company over Platoon
    assert mapping["unit"] == headers.index("Company")


def test_row_to_mapped_fields_applies_mapping_and_trims_values():
    headers = ["Username", "Email", "Discord ID"]
    mapping = build_field_mapping(headers)

    row = ["  Echo  ", " echo@example.com ", " 12345 "]
    mapped = row_to_mapped_fields(row, mapping)

    assert mapped == {
        "username": "Echo",
        "email": "echo@example.com",
        "discord_id": "12345",
    }
