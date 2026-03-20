"""Models for NATO markers, deployments, and division location state."""

from datetime import datetime, timezone
from typing import Optional, List, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


# ── Deployment Types ─────────────────────────────────────────────────────────

DEPLOYMENT_TYPES = ["25th_id", "partner", "allied"]


# ── NATO Marker Symbology ────────────────────────────────────────────────────

NATO_AFFILIATIONS = ["friendly", "hostile", "neutral", "unknown"]

NATO_SYMBOL_TYPES = [
    "infantry",
    "armor",
    "aviation",
    "artillery",
    "logistics",
    "headquarters",
    "medical",
    "recon",
    "signal",
    "engineer",
    "air_defense",
    "naval",
    "special_operations",
    "military_police",
    "chemical",
    "maintenance",
    "transportation",
    "supply",
    "missile",
    "cyber",
    "civil_affairs",
    "psychological_operations",
    "unmanned_aerial",
    "electronic_warfare",
    "objective",
    "waypoint",
    "staging_area",
    "custom",
]

NATO_ECHELONS = [
    "team",
    "squad",
    "section",
    "platoon",
    "company",
    "battalion",
    "regiment",
    "brigade",
    "division",
    "corps",
    "army",
    "army_group",
    "theater",
    "none",
]

# Human-readable descriptions for NATO reference data
NATO_AFFILIATION_LABELS = {
    "friendly": "Friendly — Allied / own forces (blue)",
    "hostile": "Hostile — Enemy / opposing forces (red)",
    "neutral": "Neutral — Non-aligned forces (green)",
    "unknown": "Unknown — Unidentified affiliation (yellow)",
}

NATO_SYMBOL_TYPE_LABELS = {
    "infantry": "Infantry — Foot soldiers / ground combat",
    "armor": "Armor — Tanks / armored fighting vehicles",
    "aviation": "Aviation — Rotary & fixed-wing aircraft",
    "artillery": "Artillery — Cannons / howitzers / rockets",
    "logistics": "Logistics — Supply & sustainment",
    "headquarters": "Headquarters — Command & control",
    "medical": "Medical — Health services / MEDEVAC",
    "recon": "Reconnaissance — Scouts / surveillance",
    "signal": "Signal — Communications / IT",
    "engineer": "Engineer — Construction / demolition / obstacles",
    "air_defense": "Air Defense — Anti-aircraft / missile defense",
    "naval": "Naval — Maritime / amphibious forces",
    "special_operations": "Special Operations — SOF / unconventional warfare",
    "military_police": "Military Police — Law enforcement / security",
    "chemical": "CBRN — Chemical, biological, radiological, nuclear",
    "maintenance": "Maintenance — Equipment repair / recovery",
    "transportation": "Transportation — Movement / motor transport",
    "supply": "Supply — Logistics material distribution",
    "missile": "Missile — Guided missile units",
    "cyber": "Cyber — Cyber operations / information warfare",
    "civil_affairs": "Civil Affairs — Civil-military operations",
    "psychological_operations": "PSYOP — Psychological operations",
    "unmanned_aerial": "UAS — Unmanned aerial systems / drones",
    "electronic_warfare": "Electronic Warfare — EW / SIGINT",
    "objective": "Objective — Target / key terrain",
    "waypoint": "Waypoint — Route / navigation marker",
    "staging_area": "Staging Area — Assembly / marshalling point",
    "custom": "Custom — User-defined symbol",
}

NATO_ECHELON_LABELS = {
    "team": "Ø — Team / Fire Team (2-5 personnel)",
    "squad": "• — Squad (8-13 personnel)",
    "section": "•• — Section (10-20 personnel)",
    "platoon": "••• — Platoon (20-50 personnel)",
    "company": "I — Company / Battery / Troop (60-200)",
    "battalion": "II — Battalion / Squadron (300-1000)",
    "regiment": "III — Regiment / Group (1000-3000)",
    "brigade": "X — Brigade (3000-5000)",
    "division": "XX — Division (10,000-20,000)",
    "corps": "XXX — Corps (20,000-40,000)",
    "army": "XXXX — Army / Field Army (50,000+)",
    "army_group": "XXXXX — Army Group / Theater Army",
    "theater": "XXXXXX — Theater / Region",
    "none": "None — No echelon indicator",
}


class NATOMarker(BaseModel):
    id: str = Field(default_factory=lambda: f"nato_{uuid4().hex[:12]}")
    title: str
    description: str = ""
    affiliation: Literal["friendly", "hostile", "neutral", "unknown"] = "friendly"
    symbol_type: str = "infantry"
    echelon: str = "none"
    designator: str = ""  # Unit designator e.g. "1-25 IN", "2 SBCT"
    latitude: float
    longitude: float
    created_by: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    is_active: bool = True
    metadata: dict = Field(default_factory=dict)


class NATOMarkerCreate(BaseModel):
    title: str
    description: str = ""
    affiliation: str = "friendly"
    symbol_type: str = "infantry"
    echelon: str = "none"
    designator: str = ""
    latitude: float
    longitude: float
    metadata: dict = Field(default_factory=dict)


class NATOMarkerUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    affiliation: Optional[str] = None
    symbol_type: Optional[str] = None
    echelon: Optional[str] = None
    designator: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_active: Optional[bool] = None
    metadata: Optional[dict] = None




def _normalize_deployment_datetime(value: Optional[str]) -> Optional[str]:
    """Normalize deployment datetimes to UTC ISO-8601 strings."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
    if not isinstance(value, str):
        raise ValueError("must be a valid ISO-8601 datetime string")

    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("must be a valid ISO-8601 datetime string") from exc

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


class DeploymentTimingMixin(BaseModel):
    @field_validator("start_date", "estimated_arrival", mode="before", check_fields=False)
    @classmethod
    def normalize_datetime_fields(cls, value):
        return _normalize_deployment_datetime(value)

    @model_validator(mode="after")
    def validate_datetime_order(self):
        start = getattr(self, "start_date", None)
        end = getattr(self, "estimated_arrival", None)
        if start and end:
            start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
            if end_dt <= start_dt:
                raise ValueError("Estimated arrival must be after the start date")
        return self


# ── Deployment ───────────────────────────────────────────────────────────────

DEPLOYMENT_STATUSES = [
    "planning",
    "deploying",
    "deployed",
    "returning",
    "completed",
    "cancelled",
]


class Deployment(DeploymentTimingMixin):
    id: str = Field(default_factory=lambda: f"dep_{uuid4().hex[:12]}")
    title: str
    description: str = ""
    status: Literal[
        "planning", "deploying", "deployed", "returning", "completed", "cancelled"
    ] = "planning"

    # Deployment type: 25th_id | partner | allied (counterpart/support)
    deployment_type: Literal["25th_id", "partner", "allied"] = "25th_id"

    # Origin
    start_location_name: str = "Schofield Barracks, HI"
    start_latitude: float = 21.4959
    start_longitude: float = -158.0648

    # Destination
    destination_name: str = ""
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None

    # Timing
    start_date: Optional[str] = None
    estimated_arrival: Optional[str] = None

    # Waypoints – intermediate stops between origin and destination
    # Each entry: {"name": "...", "latitude": float, "longitude": float,
    #              "description": "...", "stop_duration_hours": float}
    waypoints: List[dict] = Field(default_factory=list)

    # Admin
    created_by: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    is_active: bool = True
    notes: str = ""

    # Partner / allied unit scope (None = 25th ID deployment)
    partner_unit_id: Optional[str] = None
    unit_name: Optional[str] = None  # Display name for partner/allied unit


class DeploymentCreate(DeploymentTimingMixin):
    title: str
    description: str = ""
    status: Literal[
        "planning", "deploying", "deployed", "returning", "completed", "cancelled"
    ] = "planning"
    deployment_type: Literal["25th_id", "partner", "allied"] = "25th_id"
    start_location_name: str = "Schofield Barracks, HI"
    start_latitude: Optional[float] = 21.4959
    start_longitude: Optional[float] = -158.0648
    destination_name: str = ""
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None
    start_date: Optional[str] = None
    estimated_arrival: Optional[str] = None
    waypoints: List[dict] = Field(default_factory=list)
    notes: str = ""
    is_active: bool = True
    partner_unit_id: Optional[str] = None
    unit_name: Optional[str] = None


class DeploymentUpdate(DeploymentTimingMixin):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[
        Literal["planning", "deploying", "deployed", "returning", "completed", "cancelled"]
    ] = None
    deployment_type: Optional[Literal["25th_id", "partner", "allied"]] = None
    start_location_name: Optional[str] = None
    start_latitude: Optional[float] = None
    start_longitude: Optional[float] = None
    destination_name: Optional[str] = None
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None
    start_date: Optional[str] = None
    estimated_arrival: Optional[str] = None
    waypoints: Optional[List[dict]] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    partner_unit_id: Optional[str] = None
    unit_name: Optional[str] = None


# ── Division Location State ──────────────────────────────────────────────────

DIVISION_STATES = ["home_station", "deploying", "deployed", "returning"]

# Default home station: Schofield Barracks, Oahu, Hawaii
HOME_STATION = {
    "name": "Schofield Barracks, HI",
    "latitude": 21.4959,
    "longitude": -158.0648,
}


class DivisionLocation(BaseModel):
    id: str = "division_25id"
    state: Literal["home_station", "deploying", "deployed", "returning"] = (
        "home_station"
    )
    current_location_name: str = HOME_STATION["name"]
    current_latitude: float = HOME_STATION["latitude"]
    current_longitude: float = HOME_STATION["longitude"]
    active_deployment_id: Optional[str] = None
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_by: str = ""


class DivisionLocationUpdate(BaseModel):
    state: Optional[str] = None
    current_location_name: Optional[str] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    active_deployment_id: Optional[str] = None
