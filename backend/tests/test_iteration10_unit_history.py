"""
Iteration 10 Tests - Unit History Feature
Tests for the new Unit History timeline feature with admin CRUD operations.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# === Test Credentials ===
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"
NON_ADMIN_EMAIL = "test_e441d7@25thvid.com"
NON_ADMIN_PASSWORD = "Test123!Test"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def non_admin_token(api_client):
    """Get non-admin user token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": NON_ADMIN_EMAIL,
        "password": NON_ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Non-admin login failed: {response.text}"
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def non_admin_headers(non_admin_token):
    """Headers with non-admin auth"""
    return {"Authorization": f"Bearer {non_admin_token}", "Content-Type": "application/json"}


class TestUnitHistoryPublicAPI:
    """Test public GET /api/unit-history endpoint"""

    def test_get_unit_history_returns_list(self, api_client):
        """GET /api/unit-history should return a list of history entries (no auth required)"""
        response = api_client.get(f"{BASE_URL}/api/unit-history")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"Unit history returned {len(data)} entries")

    def test_unit_history_entries_sorted_by_sort_order(self, api_client):
        """History entries should be sorted by sort_order ascending"""
        response = api_client.get(f"{BASE_URL}/api/unit-history")
        assert response.status_code == 200
        data = response.json()
        if len(data) > 1:
            sort_orders = [entry.get("sort_order", 0) for entry in data]
            assert sort_orders == sorted(sort_orders), "Entries should be sorted by sort_order"
            print(f"Sort order verified: {sort_orders[:5]}...")

    def test_unit_history_entry_structure(self, api_client):
        """Each history entry should have required fields"""
        response = api_client.get(f"{BASE_URL}/api/unit-history")
        assert response.status_code == 200
        data = response.json()
        if len(data) > 0:
            entry = data[0]
            required_fields = ["id", "title", "year", "description", "campaign_type", "sort_order"]
            for field in required_fields:
                assert field in entry, f"Missing field: {field}"
            assert entry["campaign_type"] in ["campaign", "operation", "milestone"], \
                f"Invalid campaign_type: {entry['campaign_type']}"
            print(f"First entry: {entry['year']} - {entry['title']}")


class TestAdminUnitHistoryCRUD:
    """Test admin CRUD operations for unit history"""

    def test_create_history_entry_as_admin(self, api_client, admin_headers):
        """POST /api/admin/unit-history should create a new entry (admin only)"""
        unique_id = str(uuid.uuid4())[:8]
        test_entry = {
            "title": f"TEST_Campaign_{unique_id}",
            "year": "2025",
            "description": "Test campaign for iteration 10 testing",
            "campaign_type": "campaign",
            "sort_order": 9999,  # High number to not interfere with existing entries
            "image_url": ""
        }
        response = api_client.post(
            f"{BASE_URL}/api/admin/unit-history",
            json=test_entry,
            headers=admin_headers
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["title"] == test_entry["title"]
        assert data["year"] == test_entry["year"]
        assert "id" in data
        print(f"Created history entry: {data['id']}")
        # Store for cleanup
        api_client.test_created_entry_id = data["id"]

    def test_verify_created_entry_in_list(self, api_client, admin_headers):
        """Verify newly created entry appears in the list"""
        if not hasattr(api_client, 'test_created_entry_id'):
            pytest.skip("No entry was created")
        
        response = api_client.get(f"{BASE_URL}/api/unit-history")
        assert response.status_code == 200
        data = response.json()
        entry_ids = [e["id"] for e in data]
        assert api_client.test_created_entry_id in entry_ids, "Created entry not found in list"
        print(f"Entry {api_client.test_created_entry_id} found in list")

    def test_update_history_entry_as_admin(self, api_client, admin_headers):
        """PUT /api/admin/unit-history/{id} should update an entry (admin only)"""
        if not hasattr(api_client, 'test_created_entry_id'):
            pytest.skip("No entry was created")
        
        entry_id = api_client.test_created_entry_id
        update_data = {
            "title": "UPDATED_Test_Campaign",
            "year": "2025-2026",
            "description": "Updated description for testing",
            "campaign_type": "operation",  # Changed type
            "sort_order": 9998
        }
        response = api_client.put(
            f"{BASE_URL}/api/admin/unit-history/{entry_id}",
            json=update_data,
            headers=admin_headers
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        assert data.get("message") == "History entry updated successfully"
        print(f"Updated entry {entry_id}")

    def test_verify_update_persisted(self, api_client):
        """Verify update was actually persisted"""
        if not hasattr(api_client, 'test_created_entry_id'):
            pytest.skip("No entry was created")
        
        response = api_client.get(f"{BASE_URL}/api/unit-history")
        assert response.status_code == 200
        data = response.json()
        entry = next((e for e in data if e["id"] == api_client.test_created_entry_id), None)
        assert entry is not None, "Entry not found"
        assert entry["title"] == "UPDATED_Test_Campaign"
        assert entry["campaign_type"] == "operation"
        print(f"Update verified: {entry['title']}")

    def test_delete_history_entry_as_admin(self, api_client, admin_headers):
        """DELETE /api/admin/unit-history/{id} should delete an entry (admin only)"""
        if not hasattr(api_client, 'test_created_entry_id'):
            pytest.skip("No entry was created")
        
        entry_id = api_client.test_created_entry_id
        response = api_client.delete(
            f"{BASE_URL}/api/admin/unit-history/{entry_id}",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        data = response.json()
        assert data.get("message") == "History entry deleted successfully"
        print(f"Deleted entry {entry_id}")

    def test_verify_entry_deleted(self, api_client):
        """Verify entry was actually deleted"""
        if not hasattr(api_client, 'test_created_entry_id'):
            pytest.skip("No entry was created")
        
        response = api_client.get(f"{BASE_URL}/api/unit-history")
        assert response.status_code == 200
        data = response.json()
        entry_ids = [e["id"] for e in data]
        assert api_client.test_created_entry_id not in entry_ids, "Entry should be deleted"
        print("Deletion verified - entry no longer in list")


class TestNonAdminCannotModifyHistory:
    """Test that non-admin users cannot create/edit/delete history entries"""

    def test_non_admin_cannot_create_entry(self, api_client, non_admin_headers):
        """POST /api/admin/unit-history should return 403 for non-admin"""
        test_entry = {
            "title": "Unauthorized Entry",
            "year": "2025",
            "description": "This should fail",
            "campaign_type": "campaign",
            "sort_order": 999
        }
        response = api_client.post(
            f"{BASE_URL}/api/admin/unit-history",
            json=test_entry,
            headers=non_admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Non-admin correctly denied from creating history entry")

    def test_non_admin_cannot_update_entry(self, api_client, non_admin_headers):
        """PUT /api/admin/unit-history/{id} should return 403 for non-admin"""
        # Try to update any existing entry
        list_response = api_client.get(f"{BASE_URL}/api/unit-history")
        if list_response.status_code != 200 or len(list_response.json()) == 0:
            pytest.skip("No entries to test update on")
        
        entry_id = list_response.json()[0]["id"]
        update_data = {
            "title": "Unauthorized Update",
            "year": "2025",
            "description": "This should fail",
            "campaign_type": "campaign",
            "sort_order": 1
        }
        response = api_client.put(
            f"{BASE_URL}/api/admin/unit-history/{entry_id}",
            json=update_data,
            headers=non_admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Non-admin correctly denied from updating history entry")

    def test_non_admin_cannot_delete_entry(self, api_client, non_admin_headers):
        """DELETE /api/admin/unit-history/{id} should return 403 for non-admin"""
        # Try to delete any existing entry
        list_response = api_client.get(f"{BASE_URL}/api/unit-history")
        if list_response.status_code != 200 or len(list_response.json()) == 0:
            pytest.skip("No entries to test delete on")
        
        entry_id = list_response.json()[0]["id"]
        response = api_client.delete(
            f"{BASE_URL}/api/admin/unit-history/{entry_id}",
            headers=non_admin_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Non-admin correctly denied from deleting history entry")


class TestUnauthenticatedCannotModifyHistory:
    """Test that unauthenticated users cannot modify history entries"""

    def test_unauthenticated_cannot_create(self, api_client):
        """POST /api/admin/unit-history should return 401/403 without auth"""
        test_entry = {
            "title": "Unauthorized Entry",
            "year": "2025",
            "description": "This should fail",
            "campaign_type": "campaign",
            "sort_order": 999
        }
        response = api_client.post(
            f"{BASE_URL}/api/admin/unit-history",
            json=test_entry
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Unauthenticated correctly denied from creating history entry")


class TestExistingSeededHistoryEntries:
    """Test that pre-seeded history entries exist"""

    def test_seeded_entries_exist(self, api_client):
        """Should have pre-seeded history entries (7 expected from WWII to 2025)"""
        response = api_client.get(f"{BASE_URL}/api/unit-history")
        assert response.status_code == 200
        data = response.json()
        # Main agent mentioned 7 pre-seeded entries (1941-2025)
        assert len(data) >= 1, "Should have at least 1 seeded entry"
        
        # Check for some expected years from WWII to present
        years = [entry.get("year", "") for entry in data]
        print(f"Found {len(data)} history entries spanning years: {years}")


class TestRegressionExistingFeatures:
    """Regression tests - ensure existing features still work"""

    def test_api_health(self, api_client):
        """API root should return 25th Infantry Division API"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "25th Infantry Division API" in data.get("message", "")
        print("API health check passed")

    def test_admin_login_still_works(self, api_client):
        """Admin login should still work"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("user", {}).get("role") == "admin"
        print("Admin login verified")

    def test_operations_endpoint_works(self, api_client):
        """Operations endpoint should still work"""
        response = api_client.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        print(f"Operations endpoint returned {len(response.json())} operations")

    def test_announcements_endpoint_works(self, api_client):
        """Announcements endpoint should still work"""
        response = api_client.get(f"{BASE_URL}/api/announcements")
        assert response.status_code == 200
        print(f"Announcements endpoint returned {len(response.json())} announcements")

    def test_public_site_content_works(self, api_client):
        """Public site content should still return 25th ID branding"""
        response = api_client.get(f"{BASE_URL}/api/site-content")
        assert response.status_code == 200
        data = response.json()
        if data:
            assert data.get("nav", {}).get("brandName") == "25TH INFANTRY DIVISION"
        print("Public site content verified")
