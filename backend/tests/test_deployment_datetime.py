from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

import pytest
from pydantic import ValidationError

from models.deployment import DeploymentCreate, DeploymentUpdate


def test_deployment_create_normalizes_datetime_strings_to_utc():
    dep = DeploymentCreate(
        title='UTC check',
        start_date='2026-03-20T10:30:00+02:00',
        estimated_arrival='2026-03-20T12:00:00+02:00',
    )

    assert dep.start_date == '2026-03-20T08:30:00Z'
    assert dep.estimated_arrival == '2026-03-20T10:00:00Z'


def test_deployment_update_rejects_arrival_before_start():
    with pytest.raises(ValidationError, match='Estimated arrival must be after the start date'):
        DeploymentUpdate(
            start_date='2026-03-20T12:00:00Z',
            estimated_arrival='2026-03-20T11:00:00Z',
        )
