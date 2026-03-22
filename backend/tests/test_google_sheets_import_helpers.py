import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from google_sheets_import import (
    parse_spreadsheet_id,
    build_field_mapping,
    detect_header_row,
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


def test_detect_header_row_skips_intro_rows_and_finds_personnel_headers():
    values = [
        ["25th Virtual Infantry Division - Personnel Logs", "", ""],
        ["Legend", "Rank", "Meaning"],
        ["Name", "Discord Username", "Discord ID", "Rank"],
        ["Ghost", "ghost_actual", "555123", "SGT"],
    ]

    header_row_index, headers, mapping = detect_header_row(values)

    assert header_row_index == 2
    assert headers[0] == "Name"
    assert mapping["username"] == 0
    assert mapping["discord_username"] == 1
    assert mapping["discord_id"] == 2
    assert mapping["rank"] == 3


def test_build_field_mapping_supports_personnel_log_columns():
    headers = ["Personnel", "In-Game Name", "Rank", "Role", "Extra Duties"]

    mapping = build_field_mapping(headers)

    assert mapping["discord_username"] == 0
    assert mapping["username"] == 1
    assert mapping["rank"] == 2
    assert mapping["billet"] == 3
    assert mapping["specialization"] == 4
