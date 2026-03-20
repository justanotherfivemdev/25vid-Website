"""
Deployment acceptance tests for the 25th Infantry Division API.

Covers:
  - Create: POST /admin/map/deployments returns 200 with persisted record.
  - List:   GET  /admin/map/deployments includes the new record after reload.
  - Map:    GET  /map/deployments includes the deployment and exposes destination
            coordinates required for path rendering on GlobalThreatMap.
  - Delete: DELETE /admin/map/deployments/{id} removes the record from both
            admin list and map list; second delete returns 404.
  - Error logging: malformed payloads produce 422 with a Pydantic detail array
            and create an entry in /admin/error-logs (source='validation').
"""

import time
import uuid
import os

import httpx
import pytest

BASE_URL = os.environ.get("TEST_API_URL", "http://localhost:8001/api")


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture(scope="module")
def admin_cookies():
    """Login as admin and return session cookies."""
    with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
        res = client.post("/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!",
        })
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        cookies = dict(res.cookies)
        assert "auth_token" in cookies, "No auth_token cookie returned on login"
        return cookies


# ============================================================================
# CREATE ACCEPTANCE CHECKS
# ============================================================================

class TestDeploymentCreate:
    """
    Acceptance checks for deployment creation.

    Acceptance criteria:
      - POST /api/admin/map/deployments returns 200 with the created deployment.
      - Re-fetch via GET /api/admin/map/deployments includes the new record.
      - GET /api/map/deployments (GlobalThreatMap source) includes the record
        and exposes non-null destination coords for path rendering.
    """

    @pytest.fixture(scope="class")
    def created_deployment(self, admin_cookies):
        """Create a deployment for the class; delete it after all tests."""
        title = f"Acceptance Test Deployment {uuid.uuid4().hex[:6]}"
        payload = {
            "title": title,
            "description": "Automated acceptance test — do not promote",
            "status": "deploying",
            "destination_name": "Pohnpei, Federated States of Micronesia",
            "destination_latitude": 6.8874,
            "destination_longitude": 158.2150,
            "is_active": True,
        }
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/admin/map/deployments", json=payload)
            assert res.status_code == 200, f"Deployment create failed: {res.text}"
            dep = res.json()
            yield dep
            # Teardown: remove the test deployment so it doesn't pollute state
            client.delete(f"/admin/map/deployments/{dep['id']}")

    def test_create_returns_200(self, created_deployment):
        """Response body must contain an 'id' field."""
        assert "id" in created_deployment

    def test_create_id_has_dep_prefix(self, created_deployment):
        """Generated deployment IDs should follow the dep_<hex> convention."""
        assert created_deployment["id"].startswith("dep_")

    def test_create_persists_title(self, created_deployment):
        """Title in the response must match what was submitted."""
        assert "Acceptance Test Deployment" in created_deployment["title"]

    def test_create_persists_destination_coords(self, created_deployment):
        """Destination latitude and longitude must be persisted accurately."""
        assert created_deployment["destination_latitude"] == pytest.approx(6.8874, abs=1e-4)
        assert created_deployment["destination_longitude"] == pytest.approx(158.2150, abs=1e-4)

    def test_create_defaults_start_to_schofield(self, created_deployment):
        """When origin coords are omitted the backend defaults to Schofield Barracks."""
        assert created_deployment["start_latitude"] == pytest.approx(21.4959, abs=1e-4)
        assert created_deployment["start_longitude"] == pytest.approx(-158.0648, abs=1e-4)

    def test_admin_list_includes_new_deployment(self, admin_cookies, created_deployment):
        """GET /admin/map/deployments must include the newly created record (simulates page reload)."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.get("/admin/map/deployments")
        assert res.status_code == 200
        ids = [d["id"] for d in res.json()]
        assert created_deployment["id"] in ids, (
            "New deployment not found in admin list after creation"
        )

    def test_map_deployments_includes_new_deployment(self, admin_cookies, created_deployment):
        """GET /map/deployments (GlobalThreatMap source) must include the active deployment."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.get("/map/deployments")
        assert res.status_code == 200
        ids = [d["id"] for d in res.json()]
        assert created_deployment["id"] in ids, (
            "New deployment not found in /map/deployments payload"
        )

    def test_map_deployment_exposes_destination_for_path(self, admin_cookies, created_deployment):
        """
        The map payload must expose non-null destination coords so GlobalThreatMap
        can render a route path between origin and destination.
        """
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.get("/map/deployments")
        assert res.status_code == 200
        dep = next(
            (d for d in res.json() if d["id"] == created_deployment["id"]), None
        )
        assert dep is not None, "Deployment missing from /map/deployments"
        assert dep["destination_latitude"] is not None, "destination_latitude is null"
        assert dep["destination_longitude"] is not None, "destination_longitude is null"


# ============================================================================
# DELETE ACCEPTANCE CHECKS
# ============================================================================

class TestDeploymentDelete:
    """
    Acceptance checks for deployment deletion.

    Acceptance criteria:
      - DELETE /api/admin/map/deployments/{id} returns 200.
      - Immediate refetch: GET /api/admin/map/deployments no longer contains the record.
      - GET /api/map/deployments (GlobalThreatMap) no longer contains the record.
      - A second DELETE on the same ID returns 404 (not 200 or 409).
    """

    @pytest.fixture(scope="class")
    def deployment_to_delete(self, admin_cookies):
        """Create a deployment that will be deleted by the first test in this class."""
        payload = {
            "title": f"Delete Test Deployment {uuid.uuid4().hex[:6]}",
            "status": "planning",
            "destination_name": "Test Deletion Site",
            "destination_latitude": 10.0,
            "destination_longitude": 120.0,
            "is_active": True,
        }
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/admin/map/deployments", json=payload)
            assert res.status_code == 200, f"Setup deployment create failed: {res.text}"
            return res.json()

    def test_delete_returns_200(self, admin_cookies, deployment_to_delete):
        """DELETE must return 200 with a 'message' field."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.delete(f"/admin/map/deployments/{deployment_to_delete['id']}")
        assert res.status_code == 200
        assert res.json().get("message") == "Deployment deleted"

    def test_delete_removes_from_admin_list(self, admin_cookies, deployment_to_delete):
        """After DELETE the record must be absent from GET /admin/map/deployments."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.get("/admin/map/deployments")
        assert res.status_code == 200
        ids = [d["id"] for d in res.json()]
        assert deployment_to_delete["id"] not in ids, (
            "Deleted deployment still appears in admin list"
        )

    def test_delete_removes_from_map_deployments(self, admin_cookies, deployment_to_delete):
        """After DELETE the record must be absent from GET /map/deployments."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.get("/map/deployments")
        assert res.status_code == 200
        ids = [d["id"] for d in res.json()]
        assert deployment_to_delete["id"] not in ids, (
            "Deleted deployment still appears in /map/deployments"
        )

    def test_double_delete_returns_404(self, admin_cookies, deployment_to_delete):
        """A second DELETE on the same ID must return 404 (record no longer exists)."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.delete(f"/admin/map/deployments/{deployment_to_delete['id']}")
        assert res.status_code == 404


# ============================================================================
# ERROR LOGGING ACCEPTANCE CHECKS
# ============================================================================

class TestDeploymentErrorLogging:
    """
    Acceptance checks for error logging on malformed create requests.

    Acceptance criteria:
      - A payload with waypoints=null (invalid List[dict]) → 422.
      - A payload with an invalid status literal → 422.
      - The 422 response body contains a 'detail' array (Pydantic v2 format,
        required by the frontend's formatApiError utility).
      - The RequestValidationError handler logs the event to /admin/error-logs
        with source='validation' so it appears in the admin Error Logs UI.
    """

    def test_null_waypoints_returns_422(self, admin_cookies):
        """Sending waypoints=null (not a valid List[dict]) must produce a 422."""
        payload = {"title": "Test", "waypoints": None}
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/admin/map/deployments", json=payload)
        assert res.status_code == 422

    def test_invalid_status_returns_422(self, admin_cookies):
        """Sending an unknown status literal must produce a 422."""
        payload = {"title": "Test", "status": "unknown_status"}
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/admin/map/deployments", json=payload)
        assert res.status_code == 422

    def test_invalid_dest_lat_type_returns_422(self, admin_cookies):
        """Sending a non-numeric destination_latitude must produce a 422."""
        payload = {"title": "Test", "destination_latitude": "not-a-number"}
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/admin/map/deployments", json=payload)
        assert res.status_code == 422

    def test_422_response_has_detail_array(self, admin_cookies):
        """
        The 422 response must include 'detail' as a list (Pydantic v2 format).
        The frontend's formatApiError() iterates over this array — if it is a
        plain string, the user sees '[object Object]' instead of a real message.
        """
        payload = {"title": "Test", "waypoints": None}
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/admin/map/deployments", json=payload)
        assert res.status_code == 422
        data = res.json()
        assert "detail" in data, "422 response missing 'detail' field"
        assert isinstance(data["detail"], list), (
            f"'detail' should be a list but got {type(data['detail'])}: {data['detail']}"
        )

    def test_422_creates_error_log_entry(self, admin_cookies):
        """
        A 422 RequestValidationError must create an entry in /admin/error-logs
        with source='validation' (written by the RequestValidationError handler
        added to server.py).
        """
        payload = {"title": f"ErrorLog Probe {uuid.uuid4().hex[:6]}", "waypoints": None}
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            client.post("/admin/map/deployments", json=payload)
            # Allow the async MongoDB write to complete
            time.sleep(0.5)
            res = client.get("/admin/error-logs", params={"source": "validation"})

        assert res.status_code == 200
        data = res.json()
        assert data["total"] > 0, (
            "No validation error logs found after triggering a 422 on "
            "POST /admin/map/deployments. Ensure RequestValidationError handler "
            "is registered in server.py."
        )
        # At least one entry must reference the deployment endpoint
        paths = [log.get("request_path", "") for log in data["logs"]]
        assert any("/map/deployments" in p for p in paths), (
            f"None of the validation error logs reference the deployment path. "
            f"Found paths: {paths}"
        )
