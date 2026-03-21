"""Models for NATO markers, deployments, and division location state."""

from datetime import datetime, timezone
from typing import Optional, List, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


# ── Deployment Origin Types ──────────────────────────────────────────────────

DEPLOYMENT_ORIGIN_TYPES = ["25th", "partner", "counterpart"]


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


# ── Deployment ───────────────────────────────────────────────────────────────

DEPLOYMENT_STATUSES = ["planning", "deploying", "deployed", "endex", "rtb", "completed", "cancelled"]


class RoutePoint(BaseModel):
    order: int
    name: str
    latitude: float
    longitude: float
    description: str = ""
    stop_duration_hours: float = 0


class Deployment(BaseModel):
    id: str = Field(default_factory=lambda: f"dep_{uuid4().hex[:12]}")
    title: str
    unit_name: str = ""
    origin_type: Literal["25th", "partner", "counterpart"] = "25th"
    origin_unit_id: Optional[str] = None
    status: Literal["planning", "deploying", "deployed", "endex", "rtb", "completed", "cancelled"] = "planning"
    is_active: bool = False
    total_duration_hours: float = 24.0
    started_at: Optional[str] = None
    return_duration_hours: float = 0
    return_started_at: Optional[str] = None
    route_points: List[RoutePoint] = Field(default_factory=list)
    notes: str = ""
    metadata: dict = Field(default_factory=dict)
    created_by: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class DeploymentCreate(BaseModel):
    title: str
    unit_name: str = ""
    origin_type: Literal["25th", "partner", "counterpart"] = "25th"
    origin_unit_id: Optional[str] = None
    status: Literal["planning", "deploying", "deployed", "endex", "rtb", "completed", "cancelled"] = "planning"
    is_active: bool = False
    total_duration_hours: float = 24.0
    return_duration_hours: float = 0
    route_points: List[RoutePoint] = Field(default_factory=list)
    notes: str = ""
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_active_route(self):
        if self.status == "deploying" and len(self.route_points) < 2:
            raise ValueError(
                "Deploying status requires at least 2 route points"
                " (origin and destination)"
            )
        return self


class DeploymentUpdate(BaseModel):
    title: Optional[str] = None
    unit_name: Optional[str] = None
    origin_type: Optional[Literal["25th", "partner", "counterpart"]] = None
    origin_unit_id: Optional[str] = None
    status: Optional[
        Literal["planning", "deploying", "deployed", "endex", "rtb", "completed", "cancelled"]
    ] = None
    is_active: Optional[bool] = None
    total_duration_hours: Optional[float] = None
    started_at: Optional[str] = None
    return_duration_hours: Optional[float] = None
    return_started_at: Optional[str] = None
    route_points: Optional[List[RoutePoint]] = None
    notes: Optional[str] = None
    metadata: Optional[dict] = None


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
