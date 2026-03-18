"""MOS (Military Occupational Specialty) mapping utilities."""

MOS_MAP = {
    # 11B / Infantry
    "infantry": {"mos_code": "11B", "mos_title": "Infantry"},
    "infantryman": {"mos_code": "11B", "mos_title": "Infantry"},
    "rifleman": {"mos_code": "11B", "mos_title": "Infantry"},
    "grenadier": {"mos_code": "11B", "mos_title": "Infantry"},
    "11b": {"mos_code": "11B", "mos_title": "Infantry"},
    "grunt": {"mos_code": "11B", "mos_title": "Infantry"},
    "autorifleman": {"mos_code": "11B", "mos_title": "Infantry"},
    "machine gunner": {"mos_code": "11B", "mos_title": "Infantry"},
    "marksman": {"mos_code": "11B", "mos_title": "Infantry"},

    # 68W / Medic
    "medic": {"mos_code": "68W", "mos_title": "Medic"},
    "combat medic": {"mos_code": "68W", "mos_title": "Medic"},
    "68w": {"mos_code": "68W", "mos_title": "Medic"},
    "medical": {"mos_code": "68W", "mos_title": "Medic"},
    "corpsman": {"mos_code": "68W", "mos_title": "Medic"},
    "aid": {"mos_code": "68W", "mos_title": "Medic"},

    # 25U / Signal
    "signal": {"mos_code": "25U", "mos_title": "Signal"},
    "comms": {"mos_code": "25U", "mos_title": "Signal"},
    "communications": {"mos_code": "25U", "mos_title": "Signal"},
    "radio": {"mos_code": "25U", "mos_title": "Signal"},
    "rto": {"mos_code": "25U", "mos_title": "Signal"},
    "25u": {"mos_code": "25U", "mos_title": "Signal"},
    "signaleer": {"mos_code": "25U", "mos_title": "Signal"},

    # 13F / Fires
    "fires": {"mos_code": "13F", "mos_title": "Fires"},
    "forward observer": {"mos_code": "13F", "mos_title": "Fires"},
    "fist": {"mos_code": "13F", "mos_title": "Fires"},
    "jtac": {"mos_code": "13F", "mos_title": "Fires"},
    "artillery": {"mos_code": "13F", "mos_title": "Fires"},
    "13f": {"mos_code": "13F", "mos_title": "Fires"},
    "fire support": {"mos_code": "13F", "mos_title": "Fires"},

    # 12B / Engineer
    "engineer": {"mos_code": "12B", "mos_title": "Engineer"},
    "combat engineer": {"mos_code": "12B", "mos_title": "Engineer"},
    "sapper": {"mos_code": "12B", "mos_title": "Engineer"},
    "12b": {"mos_code": "12B", "mos_title": "Engineer"},
    "eod": {"mos_code": "12B", "mos_title": "Engineer"},
    "demolitions": {"mos_code": "12B", "mos_title": "Engineer"},

    # 19K / Armor
    "armor": {"mos_code": "19K", "mos_title": "Armor"},
    "tanker": {"mos_code": "19K", "mos_title": "Armor"},
    "19k": {"mos_code": "19K", "mos_title": "Armor"},
    "cavalry": {"mos_code": "19K", "mos_title": "Armor"},
    "mechanized": {"mos_code": "19K", "mos_title": "Armor"},
    "vehicle": {"mos_code": "19K", "mos_title": "Armor"},
    "crewman": {"mos_code": "19K", "mos_title": "Armor"},

    # 15A / Aviation
    "aviation": {"mos_code": "15A", "mos_title": "Aviation"},
    "pilot": {"mos_code": "15A", "mos_title": "Aviation"},
    "15a": {"mos_code": "15A", "mos_title": "Aviation"},
    "rotary": {"mos_code": "15A", "mos_title": "Aviation"},
    "helicopter": {"mos_code": "15A", "mos_title": "Aviation"},
    "aviator": {"mos_code": "15A", "mos_title": "Aviation"},

    # 35F / Intel
    "intel": {"mos_code": "35F", "mos_title": "Intel"},
    "intelligence": {"mos_code": "35F", "mos_title": "Intel"},
    "35f": {"mos_code": "35F", "mos_title": "Intel"},
    "analyst": {"mos_code": "35F", "mos_title": "Intel"},
    "recon": {"mos_code": "35F", "mos_title": "Intel"},
    "reconnaissance": {"mos_code": "35F", "mos_title": "Intel"},

    # 92A / Logistics
    "logistics": {"mos_code": "92A", "mos_title": "Logistics"},
    "supply": {"mos_code": "92A", "mos_title": "Logistics"},
    "92a": {"mos_code": "92A", "mos_title": "Logistics"},
    "quartermaster": {"mos_code": "92A", "mos_title": "Logistics"},
    "logi": {"mos_code": "92A", "mos_title": "Logistics"},

    # N/A / Leadership / Command
    "leadership": {"mos_code": "N/A", "mos_title": "Leadership / Command"},
    "command": {"mos_code": "N/A", "mos_title": "Leadership / Command"},
    "commander": {"mos_code": "N/A", "mos_title": "Leadership / Command"},
    "officer": {"mos_code": "N/A", "mos_title": "Leadership / Command"},
    "nco": {"mos_code": "N/A", "mos_title": "Leadership / Command"},
}

DEFAULT_MOS = {"mos_code": "11B", "mos_title": "Infantry"}


def get_mos_display(specialization: str, billet: str = None) -> dict:
    """Return standardized MOS display from specialization string, with billet fallback."""
    if not specialization and not billet:
        return DEFAULT_MOS

    # Try exact match on specialization
    if specialization:
        key = specialization.strip().lower()
        if key in MOS_MAP:
            return MOS_MAP[key]
        # Fuzzy: check if any keyword is contained in the specialization
        for keyword, mos in MOS_MAP.items():
            if keyword in key or key in keyword:
                return mos

    # Fallback: try billet for leadership detection
    if billet:
        billet_lower = billet.strip().lower()
        for keyword in ("commander", "commanding", "executive officer", "xo",
                        "sergeant major", "first sergeant", "officer", "leadership",
                        "command", "s3", "s2", "s1", "s4"):
            if keyword in billet_lower:
                return {"mos_code": "N/A", "mos_title": "Leadership / Command"}

    return DEFAULT_MOS
