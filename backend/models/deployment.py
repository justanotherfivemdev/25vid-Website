"""Models for NATO markers, deployments, and division location state."""

from datetime import datetime, timezone
from typing import Optional, List, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


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
    "objective",
    "waypoint",
    "staging_area",
    "air_defense",
    "naval",
    "special_operations",
    "custom",
]

NATO_ECHELONS = [
    "team",
    "squad",
    "platoon",
    "company",
    "battalion",
    "regiment",
    "brigade",
    "division",
    "corps",
    "army",
    "none",
]


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

DEPLOYMENT_STATUSES = [
    "planning",
    "deploying",
    "deployed",
    "returning",
    "completed",
    "cancelled",
]


class Deployment(BaseModel):
    id: str = Field(default_factory=lambda: f"dep_{uuid4().hex[:12]}")
    title: str
    description: str = ""
    status: Literal[
        "planning", "deploying", "deployed", "returning", "completed", "cancelled"
    ] = "planning"

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


class DeploymentCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "planning"
    start_location_name: str = "Schofield Barracks, HI"
    start_latitude: float = 21.4959
    start_longitude: float = -158.0648
    destination_name: str = ""
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None
    start_date: Optional[str] = None
    estimated_arrival: Optional[str] = None
    notes: str = ""


class DeploymentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    start_location_name: Optional[str] = None
    start_latitude: Optional[float] = None
    start_longitude: Optional[float] = None
    destination_name: Optional[str] = None
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None
    start_date: Optional[str] = None
    estimated_arrival: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


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
