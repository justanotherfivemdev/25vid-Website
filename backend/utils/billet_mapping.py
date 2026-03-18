"""Billet acronym mapping utilities."""

BILLET_MAP = {
    # CO / Commanding Officer
    "commanding officer": {"acronym": "CO", "full_title": "Commanding Officer"},
    "commander": {"acronym": "CO", "full_title": "Commanding Officer"},
    "company commander": {"acronym": "CO", "full_title": "Commanding Officer"},

    # XO / Executive Officer
    "executive officer": {"acronym": "XO", "full_title": "Executive Officer"},
    "xo": {"acronym": "XO", "full_title": "Executive Officer"},

    # 1SG / First Sergeant
    "first sergeant": {"acronym": "1SG", "full_title": "First Sergeant"},
    "1sg": {"acronym": "1SG", "full_title": "First Sergeant"},

    # PL / Platoon Leader
    "platoon leader": {"acronym": "PL", "full_title": "Platoon Leader"},
    "pl": {"acronym": "PL", "full_title": "Platoon Leader"},
    "plt leader": {"acronym": "PL", "full_title": "Platoon Leader"},

    # PSG / Platoon Sergeant
    "platoon sergeant": {"acronym": "PSG", "full_title": "Platoon Sergeant"},
    "psg": {"acronym": "PSG", "full_title": "Platoon Sergeant"},
    "plt sergeant": {"acronym": "PSG", "full_title": "Platoon Sergeant"},
    "plt sgt": {"acronym": "PSG", "full_title": "Platoon Sergeant"},

    # SL / Squad Leader
    "squad leader": {"acronym": "SL", "full_title": "Squad Leader"},
    "sl": {"acronym": "SL", "full_title": "Squad Leader"},

    # TL / Team Leader
    "team leader": {"acronym": "TL", "full_title": "Team Leader"},
    "tl": {"acronym": "TL", "full_title": "Team Leader"},
    "team lead": {"acronym": "TL", "full_title": "Team Leader"},
    "fireteam leader": {"acronym": "TL", "full_title": "Team Leader"},

    # RTO / Radio Telephone Operator
    "radio telephone operator": {"acronym": "RTO", "full_title": "Radio Telephone Operator"},
    "rto": {"acronym": "RTO", "full_title": "Radio Telephone Operator"},
    "radio operator": {"acronym": "RTO", "full_title": "Radio Telephone Operator"},

    # MED / Combat Medic
    "combat medic": {"acronym": "MED", "full_title": "Combat Medic"},
    "medic": {"acronym": "MED", "full_title": "Combat Medic"},
    "med": {"acronym": "MED", "full_title": "Combat Medic"},

    # S3 / Operations Officer
    "operations officer": {"acronym": "S3", "full_title": "Operations Officer"},
    "s3": {"acronym": "S3", "full_title": "Operations Officer"},
    "s-3": {"acronym": "S3", "full_title": "Operations Officer"},

    # S2 / Intelligence Officer
    "intelligence officer": {"acronym": "S2", "full_title": "Intelligence Officer"},
    "s2": {"acronym": "S2", "full_title": "Intelligence Officer"},
    "s-2": {"acronym": "S2", "full_title": "Intelligence Officer"},

    # S1 / Personnel
    "personnel": {"acronym": "S1", "full_title": "Personnel"},
    "s1": {"acronym": "S1", "full_title": "Personnel"},
    "s-1": {"acronym": "S1", "full_title": "Personnel"},
    "personnel officer": {"acronym": "S1", "full_title": "Personnel"},

    # S4 / Logistics
    "logistics": {"acronym": "S4", "full_title": "Logistics"},
    "s4": {"acronym": "S4", "full_title": "Logistics"},
    "s-4": {"acronym": "S4", "full_title": "Logistics"},
    "logistics officer": {"acronym": "S4", "full_title": "Logistics"},
    "supply officer": {"acronym": "S4", "full_title": "Logistics"},

    # SGM / Sergeant Major
    "sergeant major": {"acronym": "SGM", "full_title": "Sergeant Major"},
    "sgm": {"acronym": "SGM", "full_title": "Sergeant Major"},
    "csm": {"acronym": "SGM", "full_title": "Sergeant Major"},
    "command sergeant major": {"acronym": "SGM", "full_title": "Sergeant Major"},
}


def get_billet_display(billet: str) -> dict:
    """Return standardized billet acronym and title from billet string."""
    if not billet:
        return {"acronym": None, "full_title": None}

    key = billet.strip().lower()

    # Exact match
    if key in BILLET_MAP:
        return BILLET_MAP[key]

    # Fuzzy: check if any keyword is contained in the billet
    for keyword, display in BILLET_MAP.items():
        if keyword in key or key in keyword:
            return display

    return {"acronym": None, "full_title": None}
