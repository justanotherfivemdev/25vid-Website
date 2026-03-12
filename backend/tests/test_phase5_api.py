"""
Phase 5 Backend API Tests - Azimuth Operations Group
Tests for: RSVP system, Pinned forum threads, Discord integration prep, Search functionality
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://unit-colors-verify.preview.emergentagent.com')

# ============================================================================
# FIXTURES
# ============================================================================

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
        "email": "bishop@azimuth.ops",
        "password": "Admin123!"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed - skipping tests")

@pytest.fixture(scope="module")
def admin_user(api_client, admin_token):
    """Get admin user data"""
    response = api_client.get(f"{BASE_URL}/api/auth/me", 
                              headers={"Authorization": f"Bearer {admin_token}"})
    if response.status_code == 200:
        return response.json()
    pytest.skip("Could not get admin user data")

@pytest.fixture(scope="module")
def member_token(api_client):
    """Get member authentication token - create test user if needed"""
    # First try to login
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "testmember@azimuth.ops",
        "password": "Test123!"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    
    # If login fails, try to register
    response = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "email": "testmember@azimuth.ops",
        "username": "TestMember",
        "password": "Test123!"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    
    pytest.skip("Member authentication failed - skipping tests")

@pytest.fixture(scope="module")
def member_user(api_client, member_token):
    """Get member user data"""
    response = api_client.get(f"{BASE_URL}/api/auth/me", 
                              headers={"Authorization": f"Bearer {member_token}"})
    if response.status_code == 200:
        return response.json()
    pytest.skip("Could not get member user data")

@pytest.fixture(scope="module")
def authenticated_admin_client(api_client, admin_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client

@pytest.fixture(scope="module")
def test_operation_id():
    """Known test operation ID - Operation Blackout"""
    return "3d69dac2-8abf-43a6-bce7-fd393d6f614d"

# ============================================================================
# RSVP ENDPOINT TESTS
# ============================================================================

class TestRSVPEndpoints:
    """Tests for RSVP operations (POST, DELETE, GET /api/operations/{id}/rsvp)"""
    
    def test_get_rsvp_requires_auth(self, api_client, test_operation_id):
        """GET /api/operations/{id}/rsvp requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/operations/{test_operation_id}/rsvp",
                                  headers={})  # No auth
        assert response.status_code == 403 or response.status_code == 401
        print("PASS: GET /api/operations/{id}/rsvp requires auth")
    
    def test_get_rsvp_list(self, api_client, admin_token, test_operation_id):
        """GET /api/operations/{id}/rsvp returns RSVP list structure"""
        response = api_client.get(f"{BASE_URL}/api/operations/{test_operation_id}/rsvp",
                                  headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "attending" in data
        assert "tentative" in data
        assert "waitlisted" in data
        assert "counts" in data
        assert "max_participants" in data
        
        # Verify counts structure
        counts = data["counts"]
        assert "attending" in counts
        assert "tentative" in counts
        assert "waitlisted" in counts
        
        print(f"PASS: RSVP list structure correct. Counts: {counts}")
    
    def test_post_rsvp_attending(self, api_client, member_token, test_operation_id):
        """POST /api/operations/{id}/rsvp with status=attending"""
        response = api_client.post(f"{BASE_URL}/api/operations/{test_operation_id}/rsvp",
                                   json={"status": "attending", "role_notes": "Test role"},
                                   headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "your_status" in data or "rsvps" in data
        print(f"PASS: RSVP attending works. Response: {data.get('message')}")
    
    def test_verify_rsvp_in_list(self, api_client, member_token, member_user, test_operation_id):
        """Verify member appears in RSVP list after RSVPing"""
        response = api_client.get(f"{BASE_URL}/api/operations/{test_operation_id}/rsvp",
                                  headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # Check if user is in any RSVP list
        all_rsvps = data.get("attending", []) + data.get("tentative", []) + data.get("waitlisted", [])
        user_ids = [r.get("user_id") for r in all_rsvps]
        assert member_user["id"] in user_ids, f"User {member_user['id']} not found in RSVP list"
        print(f"PASS: Member {member_user['username']} found in RSVP list")
    
    def test_post_rsvp_tentative(self, api_client, member_token, test_operation_id):
        """POST /api/operations/{id}/rsvp with status=tentative"""
        response = api_client.post(f"{BASE_URL}/api/operations/{test_operation_id}/rsvp",
                                   json={"status": "tentative", "role_notes": "Maybe attending"},
                                   headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        assert data.get("your_status") == "tentative" or "tentative" in str(data.get("message", "")).lower()
        print("PASS: RSVP tentative status set correctly")
    
    def test_verify_rsvp_status_changed(self, api_client, member_token, member_user, test_operation_id):
        """Verify status changed to tentative"""
        response = api_client.get(f"{BASE_URL}/api/operations/{test_operation_id}/rsvp",
                                  headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # User should now be in tentative list
        tentative_ids = [r.get("user_id") for r in data.get("tentative", [])]
        assert member_user["id"] in tentative_ids, "User should be in tentative list"
        print("PASS: Member status changed to tentative in RSVP list")
    
    def test_delete_rsvp(self, api_client, member_token, test_operation_id):
        """DELETE /api/operations/{id}/rsvp cancels RSVP"""
        response = api_client.delete(f"{BASE_URL}/api/operations/{test_operation_id}/rsvp",
                                     headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        assert "cancelled" in data.get("message", "").lower() or "removed" in data.get("message", "").lower()
        print("PASS: RSVP cancelled successfully")
    
    def test_verify_rsvp_removed(self, api_client, member_token, member_user, test_operation_id):
        """Verify member no longer in RSVP list after cancellation"""
        response = api_client.get(f"{BASE_URL}/api/operations/{test_operation_id}/rsvp",
                                  headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        
        all_rsvps = data.get("attending", []) + data.get("tentative", []) + data.get("waitlisted", [])
        user_ids = [r.get("user_id") for r in all_rsvps]
        assert member_user["id"] not in user_ids, "User should not be in RSVP list after cancellation"
        print("PASS: Member removed from RSVP list after cancellation")
    
    def test_rsvp_not_found_operation(self, api_client, member_token):
        """RSVP to non-existent operation returns 404"""
        fake_id = str(uuid.uuid4())
        response = api_client.post(f"{BASE_URL}/api/operations/{fake_id}/rsvp",
                                   json={"status": "attending"},
                                   headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 404
        print("PASS: RSVP to non-existent operation returns 404")


# ============================================================================
# PROMOTE FROM WAITLIST TESTS (Admin)
# ============================================================================

class TestPromoteFromWaitlist:
    """Tests for PUT /api/admin/operations/{id}/rsvp/{user_id}/promote"""
    
    def test_promote_requires_admin(self, api_client, member_token, test_operation_id):
        """Promote endpoint requires admin role"""
        fake_user_id = str(uuid.uuid4())
        response = api_client.put(
            f"{BASE_URL}/api/admin/operations/{test_operation_id}/rsvp/{fake_user_id}/promote",
            json={},
            headers={"Authorization": f"Bearer {member_token}"}
        )
        assert response.status_code == 403
        print("PASS: Promote from waitlist requires admin role (403 for member)")
    
    def test_promote_not_found_user(self, api_client, admin_token, test_operation_id):
        """Promote non-waitlisted user returns 404"""
        fake_user_id = str(uuid.uuid4())
        response = api_client.put(
            f"{BASE_URL}/api/admin/operations/{test_operation_id}/rsvp/{fake_user_id}/promote",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404
        print("PASS: Promote non-waitlisted user returns 404")


# ============================================================================
# PIN/UNPIN DISCUSSION TESTS
# ============================================================================

class TestPinDiscussion:
    """Tests for PUT /api/admin/discussions/{id}/pin"""
    
    def test_pin_requires_admin(self, api_client, member_token):
        """Pin endpoint requires admin role"""
        # Get a discussion ID first
        response = api_client.get(f"{BASE_URL}/api/discussions")
        if response.status_code != 200 or not response.json():
            pytest.skip("No discussions available for testing")
        
        disc_id = response.json()[0]["id"]
        response = api_client.put(f"{BASE_URL}/api/admin/discussions/{disc_id}/pin",
                                  json={},
                                  headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 403
        print("PASS: Pin discussion requires admin role (403 for member)")
    
    def test_toggle_pin(self, api_client, admin_token):
        """Admin can toggle pin status on discussion"""
        # Get a discussion ID
        response = api_client.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        discussions = response.json()
        if not discussions:
            pytest.skip("No discussions available for testing")
        
        disc = discussions[0]
        disc_id = disc["id"]
        original_pinned = disc.get("pinned", False)
        
        # Toggle pin
        response = api_client.put(f"{BASE_URL}/api/admin/discussions/{disc_id}/pin",
                                  json={},
                                  headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        assert "pinned" in data
        new_pinned = data["pinned"]
        assert new_pinned == (not original_pinned), f"Pin should toggle from {original_pinned} to {not original_pinned}"
        print(f"PASS: Discussion pin toggled from {original_pinned} to {new_pinned}")
        
        # Toggle back to original state
        response = api_client.put(f"{BASE_URL}/api/admin/discussions/{disc_id}/pin",
                                  json={},
                                  headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        print("PASS: Pin status toggled back to original")
    
    def test_pin_not_found(self, api_client, admin_token):
        """Pin non-existent discussion returns 404"""
        fake_id = str(uuid.uuid4())
        response = api_client.put(f"{BASE_URL}/api/admin/discussions/{fake_id}/pin",
                                  json={},
                                  headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 404
        print("PASS: Pin non-existent discussion returns 404")
    
    def test_pinned_discussions_sorted_first(self, api_client, admin_token):
        """Verify pinned discussions appear first in list"""
        response = api_client.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        discussions = response.json()
        
        if not discussions:
            pytest.skip("No discussions available for testing")
        
        # Check sorting - pinned should be before unpinned
        seen_unpinned = False
        for d in discussions:
            if d.get("pinned", False):
                assert not seen_unpinned, "Pinned discussion found after unpinned - sorting incorrect"
            else:
                seen_unpinned = True
        
        print("PASS: Pinned discussions sorted first in list")


# ============================================================================
# SEARCH ENDPOINT TESTS
# ============================================================================

class TestSearchEndpoint:
    """Tests for GET /api/search"""
    
    def test_search_requires_auth(self, api_client):
        """Search endpoint requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/search?q=operation",
                                  headers={})  # No auth
        assert response.status_code == 403 or response.status_code == 401
        print("PASS: Search requires authentication")
    
    def test_search_min_query_length(self, api_client, member_token):
        """Search requires minimum 2 character query"""
        response = api_client.get(f"{BASE_URL}/api/search?q=a",
                                  headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 400
        print("PASS: Search requires minimum 2 characters (400 for 1 char)")
    
    def test_search_returns_structure(self, api_client, member_token):
        """Search returns operations and discussions"""
        response = api_client.get(f"{BASE_URL}/api/search?q=operation",
                                  headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        
        assert "operations" in data
        assert "discussions" in data
        assert isinstance(data["operations"], list)
        assert isinstance(data["discussions"], list)
        print(f"PASS: Search returns correct structure. Found {len(data['operations'])} operations, {len(data['discussions'])} discussions")
    
    def test_search_finds_operation(self, api_client, member_token):
        """Search finds existing operation by title"""
        response = api_client.get(f"{BASE_URL}/api/search?q=Blackout",
                                  headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # Should find Operation Blackout
        ops = data.get("operations", [])
        titles = [op.get("title", "").lower() for op in ops]
        assert any("blackout" in t for t in titles), "Should find Operation Blackout"
        print(f"PASS: Search found operation by title. Found: {[o.get('title') for o in ops]}")
    
    def test_search_no_results(self, api_client, member_token):
        """Search returns empty arrays for no matches"""
        response = api_client.get(f"{BASE_URL}/api/search?q=zzzznonexistent1234",
                                  headers={"Authorization": f"Bearer {member_token}"})
        assert response.status_code == 200
        data = response.json()
        
        assert len(data.get("operations", [])) == 0
        assert len(data.get("discussions", [])) == 0
        print("PASS: Search returns empty arrays for no matches")


# ============================================================================
# DISCORD INTEGRATION FIELDS TESTS
# ============================================================================

class TestDiscordIntegrationFields:
    """Tests for Discord integration prep fields in user profiles"""
    
    def test_discord_fields_in_user_response(self, api_client, admin_token):
        """User response includes Discord prep fields"""
        response = api_client.get(f"{BASE_URL}/api/auth/me",
                                  headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # Discord fields should exist (can be null)
        assert "discord_id" in data
        assert "discord_username" in data
        assert "discord_avatar" in data
        assert "discord_linked" in data
        print("PASS: Discord fields present in user response")
    
    def test_admin_can_set_discord_fields(self, api_client, admin_token, admin_user):
        """Admin can set discord_id and discord_username via profile update"""
        test_discord_id = "123456789012345678"
        test_discord_username = "TestOperator#1234"
        
        response = api_client.put(
            f"{BASE_URL}/api/admin/users/{admin_user['id']}/profile",
            json={
                "discord_id": test_discord_id,
                "discord_username": test_discord_username
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        print("PASS: Admin can update Discord prep fields")
        
        # Verify update persisted
        response = api_client.get(f"{BASE_URL}/api/auth/me",
                                  headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        assert data.get("discord_id") == test_discord_id
        assert data.get("discord_username") == test_discord_username
        print(f"PASS: Discord fields persisted - ID: {data.get('discord_id')}, Username: {data.get('discord_username')}")
    
    def test_discord_fields_in_roster_profile(self, api_client, admin_token, admin_user):
        """Discord fields visible in roster profile endpoint"""
        response = api_client.get(f"{BASE_URL}/api/roster/{admin_user['id']}",
                                  headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        assert "discord_id" in data
        assert "discord_username" in data
        print("PASS: Discord fields visible in roster profile")


# ============================================================================
# OPERATIONS WITH RSVP COUNTS IN LIST
# ============================================================================

class TestOperationsWithRSVP:
    """Tests for operations list including RSVP data"""
    
    def test_operations_include_rsvps(self, api_client):
        """Operations list includes rsvps array"""
        response = api_client.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        operations = response.json()
        
        if not operations:
            pytest.skip("No operations to test")
        
        op = operations[0]
        assert "rsvps" in op, "Operations should include rsvps array"
        print(f"PASS: Operations include rsvps array. First op has {len(op.get('rsvps', []))} RSVPs")
    
    def test_rsvp_entry_structure(self, api_client, test_operation_id):
        """RSVP entries have correct structure"""
        response = api_client.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        operations = response.json()
        
        # Find our test operation
        test_op = next((op for op in operations if op.get("id") == test_operation_id), None)
        if not test_op or not test_op.get("rsvps"):
            pytest.skip("Test operation not found or has no RSVPs")
        
        rsvp = test_op["rsvps"][0]
        assert "user_id" in rsvp
        assert "username" in rsvp
        assert "status" in rsvp
        print(f"PASS: RSVP entry structure correct: user_id, username, status present")


# ============================================================================
# REGRESSION TESTS
# ============================================================================

class TestRegressionPhase1to4:
    """Quick regression tests for Phase 1-4 functionality"""
    
    def test_api_root(self, api_client):
        """API root endpoint operational"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        assert response.json().get("status") == "operational"
        print("PASS: API root operational")
    
    def test_operations_endpoint(self, api_client):
        """Operations endpoint working"""
        response = api_client.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"PASS: Operations endpoint returns {len(response.json())} operations")
    
    def test_announcements_endpoint(self, api_client):
        """Announcements endpoint working"""
        response = api_client.get(f"{BASE_URL}/api/announcements")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"PASS: Announcements endpoint returns {len(response.json())} announcements")
    
    def test_discussions_endpoint(self, api_client):
        """Discussions endpoint working"""
        response = api_client.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"PASS: Discussions endpoint returns {len(response.json())} discussions")
    
    def test_training_endpoint(self, api_client):
        """Training endpoint working"""
        response = api_client.get(f"{BASE_URL}/api/training")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"PASS: Training endpoint returns {len(response.json())} training programs")
    
    def test_gallery_endpoint(self, api_client):
        """Gallery endpoint working"""
        response = api_client.get(f"{BASE_URL}/api/gallery")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"PASS: Gallery endpoint returns {len(response.json())} images")
    
    def test_roster_endpoint(self, api_client, admin_token):
        """Roster endpoint working (Phase 4)"""
        response = api_client.get(f"{BASE_URL}/api/roster",
                                  headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"PASS: Roster endpoint returns {len(response.json())} members")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
