from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import ValidationError

from models.deployment import DeploymentCreate, RoutePoint


def test_active_deployment_with_fewer_than_2_route_points_raises():
    """Active deployments require at least 2 route points (origin + destination)."""
    with pytest.raises(ValidationError, match="Active deployment requires at least 2 route points"):
        DeploymentCreate(
            title="Short route",
            status="active",
            route_points=[
                RoutePoint(order=0, name="Only Point", latitude=21.0, longitude=-158.0),
            ],
        )


def test_active_deployment_with_2_route_points_succeeds():
    dep = DeploymentCreate(
        title="Valid active deployment",
        status="active",
        route_points=[
            RoutePoint(order=0, name="Origin", latitude=21.4959, longitude=-158.0648),
            RoutePoint(order=1, name="Destination", latitude=6.8874, longitude=158.2150),
        ],
    )
    assert dep.status == "active"
    assert len(dep.route_points) == 2


def test_deployment_create_defaults_to_draft_and_inactive():
    dep = DeploymentCreate(title="Defaults check")
    assert dep.status == "draft"
    assert dep.is_active is False


def test_route_point_validates_correctly():
    rp = RoutePoint(order=0, name="Schofield", latitude=21.4959, longitude=-158.0648)
    assert rp.order == 0
    assert rp.name == "Schofield"
    assert rp.description == ""
    assert rp.stop_duration_hours == 0


def test_route_point_rejects_missing_required_fields():
    with pytest.raises(ValidationError):
        RoutePoint(order=0, latitude=21.0, longitude=-158.0)  # missing 'name'
