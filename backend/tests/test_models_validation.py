"""
Unit tests for Pydantic model validation.

Tests model creation, field defaults, validators, and constraint
enforcement — all self-contained, no database needed.
"""

import os
import sys

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from pydantic import ValidationError

from models.deployment import (
    Deployment,
    DeploymentCreate,
    DeploymentUpdate,
    DivisionLocation,
    NATOMarker,
    NATOMarkerCreate,
    RoutePoint,
    DEPLOYMENT_STATUSES,
    NATO_AFFILIATIONS,
    NATO_ECHELONS,
    NATO_SYMBOL_TYPES,
    HOME_STATION,
)
from models.user import (
    User,
    UserRegister,
    UserLogin,
    UserResponse,
    ProfileSelfUpdate,
    AdminProfileUpdate,
    SetPasswordRequest,
    MissionHistoryEntry,
    TrainingHistoryEntry,
    AwardEntry,
)
from models.common import SiteContent, HistoryEntry, HistoryEntryCreate, MemberOfTheWeek


# ── RoutePoint ───────────────────────────────────────────────────────────────


class TestRoutePoint:
    def test_valid_route_point(self):
        rp = RoutePoint(order=0, name="Origin", latitude=21.5, longitude=-158.0)
        assert rp.order == 0
        assert rp.name == "Origin"
        assert rp.description == ""
        assert rp.stop_duration_hours == 0

    def test_with_optional_fields(self):
        rp = RoutePoint(
            order=1, name="Stop", latitude=30.0, longitude=120.0,
            description="Refuel", stop_duration_hours=2.5,
        )
        assert rp.description == "Refuel"
        assert rp.stop_duration_hours == 2.5

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            RoutePoint(order=0, latitude=21.5, longitude=-158.0)  # missing name


# ── DeploymentCreate ─────────────────────────────────────────────────────────


class TestDeploymentCreate:
    def test_minimal_deployment(self):
        d = DeploymentCreate(title="Test Deployment")
        assert d.title == "Test Deployment"
        assert d.status == "planning"
        assert d.origin_type == "25th"
        assert d.is_active is False
        assert d.route_points == []

    def test_deploying_requires_2_route_points(self):
        with pytest.raises(ValidationError, match="at least 2 route points"):
            DeploymentCreate(
                title="Deploy",
                status="deploying",
                route_points=[
                    RoutePoint(order=0, name="Origin", latitude=21.0, longitude=-158.0),
                ],
            )

    def test_deploying_with_2_route_points_ok(self):
        d = DeploymentCreate(
            title="Deploy",
            status="deploying",
            route_points=[
                RoutePoint(order=0, name="Origin", latitude=21.0, longitude=-158.0),
                RoutePoint(order=1, name="Dest", latitude=35.0, longitude=139.0),
            ],
        )
        assert d.status == "deploying"
        assert len(d.route_points) == 2

    def test_planning_status_no_route_points_ok(self):
        d = DeploymentCreate(title="Plan", status="planning")
        assert d.status == "planning"

    def test_all_statuses_accepted(self):
        for status in DEPLOYMENT_STATUSES:
            if status == "deploying":
                continue  # requires route points
            d = DeploymentCreate(title="Test", status=status)
            assert d.status == status

    def test_invalid_status_rejected(self):
        with pytest.raises(ValidationError):
            DeploymentCreate(title="Test", status="invalid_status")

    def test_invalid_origin_type_rejected(self):
        with pytest.raises(ValidationError):
            DeploymentCreate(title="Test", origin_type="alien")


# ── Deployment ───────────────────────────────────────────────────────────────


class TestDeployment:
    def test_defaults(self):
        d = Deployment(title="Test")
        assert d.id.startswith("dep_")
        assert d.status == "planning"
        assert d.is_active is False
        assert d.total_duration_hours == 24.0

    def test_created_at_populated(self):
        d = Deployment(title="Test")
        assert d.created_at is not None
        assert len(d.created_at) > 0


# ── DeploymentUpdate ─────────────────────────────────────────────────────────


class TestDeploymentUpdate:
    def test_all_fields_optional(self):
        d = DeploymentUpdate()
        assert d.title is None
        assert d.status is None
        assert d.route_points is None

    def test_partial_update(self):
        d = DeploymentUpdate(title="New Title", is_active=True)
        assert d.title == "New Title"
        assert d.is_active is True
        assert d.status is None


# ── NATOMarker ───────────────────────────────────────────────────────────────


class TestNATOMarker:
    def test_defaults(self):
        m = NATOMarker(title="CP1", latitude=21.5, longitude=-158.0)
        assert m.id.startswith("nato_")
        assert m.affiliation == "friendly"
        assert m.symbol_type == "infantry"
        assert m.echelon == "none"
        assert m.is_active is True

    def test_custom_affiliation(self):
        m = NATOMarker(
            title="Enemy", latitude=30.0, longitude=120.0,
            affiliation="hostile",
        )
        assert m.affiliation == "hostile"

    def test_invalid_affiliation(self):
        with pytest.raises(ValidationError):
            NATOMarker(
                title="Bad", latitude=0.0, longitude=0.0,
                affiliation="invalid",
            )


class TestNATOMarkerCreate:
    def test_minimal(self):
        m = NATOMarkerCreate(title="Test", latitude=21.5, longitude=-158.0)
        assert m.title == "Test"
        assert m.affiliation == "friendly"

    def test_missing_coords(self):
        with pytest.raises(ValidationError):
            NATOMarkerCreate(title="NoCoords")


# ── DivisionLocation ────────────────────────────────────────────────────────


class TestDivisionLocation:
    def test_defaults_to_home_station(self):
        loc = DivisionLocation()
        assert loc.state == "home_station"
        assert loc.current_location_name == HOME_STATION["name"]
        assert loc.current_latitude == HOME_STATION["latitude"]
        assert loc.current_longitude == HOME_STATION["longitude"]

    def test_invalid_state(self):
        with pytest.raises(ValidationError):
            DivisionLocation(state="flying")


# ── User Models ──────────────────────────────────────────────────────────────


class TestUserRegister:
    def test_valid_registration(self):
        u = UserRegister(
            email="test@example.com",
            username="testuser",
            password="strongpass123",
        )
        assert u.email == "test@example.com"
        assert u.username == "testuser"

    def test_password_min_length(self):
        with pytest.raises(ValidationError):
            UserRegister(
                email="test@example.com",
                username="testuser",
                password="short",
            )

    def test_invalid_email(self):
        with pytest.raises(ValidationError):
            UserRegister(
                email="not-an-email",
                username="testuser",
                password="strongpass123",
            )

    def test_optional_rank(self):
        u = UserRegister(
            email="test@example.com",
            username="testuser",
            password="strongpass123",
            rank="PFC",
        )
        assert u.rank == "PFC"


class TestUserLogin:
    def test_valid_login(self):
        u = UserLogin(email="test@example.com", password="password123")
        assert u.email == "test@example.com"

    def test_invalid_email(self):
        with pytest.raises(ValidationError):
            UserLogin(email="bad", password="password123")


class TestSetPasswordRequest:
    def test_valid(self):
        r = SetPasswordRequest(email="test@example.com", password="newpass123")
        assert r.password == "newpass123"

    def test_password_too_short(self):
        with pytest.raises(ValidationError):
            SetPasswordRequest(email="test@example.com", password="short")


class TestProfileSelfUpdate:
    def test_all_optional(self):
        p = ProfileSelfUpdate()
        assert p.avatar_url is None
        assert p.bio is None
        assert p.timezone is None
        assert p.favorite_role is None

    def test_partial_update(self):
        p = ProfileSelfUpdate(bio="Hello world")
        assert p.bio == "Hello world"


class TestAdminProfileUpdate:
    def test_all_optional(self):
        p = AdminProfileUpdate()
        assert p.username is None
        assert p.role is None

    def test_partial(self):
        p = AdminProfileUpdate(role="admin", rank="SGT")
        assert p.role == "admin"
        assert p.rank == "SGT"


class TestMissionHistoryEntry:
    def test_valid(self):
        e = MissionHistoryEntry(
            operation_name="Op Thunder",
            date="2024-01-15",
            role_performed="Rifleman",
        )
        assert e.operation_name == "Op Thunder"
        assert e.notes is None

    def test_with_notes(self):
        e = MissionHistoryEntry(
            operation_name="Op Lightning",
            date="2024-02-20",
            role_performed="Medic",
            notes="Excellent performance",
        )
        assert e.notes == "Excellent performance"


class TestTrainingHistoryEntry:
    def test_valid(self):
        t = TrainingHistoryEntry(
            course_name="Basic Infantry",
            completion_date="2024-03-01",
        )
        assert t.course_name == "Basic Infantry"

    def test_with_instructor(self):
        t = TrainingHistoryEntry(
            course_name="Advanced",
            completion_date="2024-04-01",
            instructor="SGT Smith",
        )
        assert t.instructor == "SGT Smith"


class TestAwardEntry:
    def test_minimal(self):
        a = AwardEntry(name="Purple Heart")
        assert a.name == "Purple Heart"
        assert a.date is None
        assert a.description is None


# ── Common Models ────────────────────────────────────────────────────────────


class TestHistoryEntry:
    def test_defaults(self):
        h = HistoryEntry(title="Battle", year="1944", description="D-Day")
        assert h.id is not None
        assert h.campaign_type == "campaign"
        assert h.sort_order == 0
        assert h.image_position == "center"
        assert h.image_overlay_opacity == 60
        assert h.text_contrast_mode == "auto"

    def test_custom_fields(self):
        h = HistoryEntry(
            title="Test", year="2024", description="Test",
            campaign_type="exercise", sort_order=5,
        )
        assert h.campaign_type == "exercise"
        assert h.sort_order == 5


class TestHistoryEntryCreate:
    def test_valid(self):
        h = HistoryEntryCreate(title="Op", year="2024", description="Test")
        assert h.title == "Op"
        assert h.image_position == "center"

    def test_missing_required(self):
        with pytest.raises(ValidationError):
            HistoryEntryCreate(title="Op")


class TestMemberOfTheWeek:
    def test_valid(self):
        m = MemberOfTheWeek(user_id="u1", username="hero")
        assert m.user_id == "u1"
        assert m.reason == ""
        assert m.set_at is not None


# ── Reference Data Constants ─────────────────────────────────────────────────


class TestReferenceData:
    def test_deployment_statuses_non_empty(self):
        assert len(DEPLOYMENT_STATUSES) > 0
        assert "planning" in DEPLOYMENT_STATUSES
        assert "deploying" in DEPLOYMENT_STATUSES
        assert "deployed" in DEPLOYMENT_STATUSES

    def test_nato_affiliations(self):
        assert set(NATO_AFFILIATIONS) == {"friendly", "hostile", "neutral", "unknown"}

    def test_nato_symbol_types_non_empty(self):
        assert len(NATO_SYMBOL_TYPES) > 0
        assert "infantry" in NATO_SYMBOL_TYPES
        assert "armor" in NATO_SYMBOL_TYPES

    def test_nato_echelons_non_empty(self):
        assert len(NATO_ECHELONS) > 0
        assert "team" in NATO_ECHELONS
        assert "division" in NATO_ECHELONS

    def test_home_station_coordinates(self):
        assert HOME_STATION["latitude"] == pytest.approx(21.495, abs=0.01)
        assert HOME_STATION["longitude"] == pytest.approx(-158.063, abs=0.01)
