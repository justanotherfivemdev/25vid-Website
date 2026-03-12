"""
Test recruitment pipeline endpoints for 25th Infantry Division Milsim website
Phase: Recruitment Pipeline testing
Tests: Public billets API, application submission, admin management
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_PREFIX = "TEST_RECRUIT_"

# Test credentials
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASSWORD = "TestAdmin123!"


class TestPublicRecruitmentEndpoints:
    """Tests for public (no-auth) recruitment endpoints"""
    
    def test_get_open_billets_public(self):
        """Public endpoint should return open billets without auth"""
        response = requests.get(f"{BASE_URL}/api/recruitment/billets")
        print(f"GET /api/recruitment/billets -> {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} open billets")
        return data
    
    def test_submit_application_public(self):
        """Public endpoint should accept application submission"""
        unique_id = str(uuid.uuid4())[:8]
        application_data = {
            "applicant_name": f"{TEST_PREFIX}Applicant_{unique_id}",
            "applicant_email": f"test_{unique_id}@example.com",
            "discord_username": f"test_user_{unique_id}#1234",
            "timezone": "EST",
            "experience": "5 years of milsim experience in various games.",
            "availability": "Weekends and evenings EST",
            "why_join": "Looking to join a dedicated milsim community."
        }
        
        response = requests.post(
            f"{BASE_URL}/api/recruitment/apply",
            json=application_data
        )
        print(f"POST /api/recruitment/apply -> {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain application id"
        assert "message" in data, "Response should contain success message"
        print(f"Application submitted with ID: {data['id']}")
        return data["id"]
    
    def test_submit_application_with_billet_id(self):
        """Application can reference a specific billet"""
        unique_id = str(uuid.uuid4())[:8]
        # First get available billets
        billets_response = requests.get(f"{BASE_URL}/api/recruitment/billets")
        billets = billets_response.json() if billets_response.status_code == 200 else []
        
        billet_id = billets[0]["id"] if billets else None
        
        application_data = {
            "applicant_name": f"{TEST_PREFIX}Applicant_Billet_{unique_id}",
            "applicant_email": f"test_billet_{unique_id}@example.com",
            "experience": "Tactical shooter experience",
            "availability": "Weekends",
            "why_join": "Want to be part of this unit",
            "billet_id": billet_id  # Optional reference
        }
        
        response = requests.post(
            f"{BASE_URL}/api/recruitment/apply",
            json=application_data
        )
        print(f"POST /api/recruitment/apply (with billet) -> {response.status_code}")
        assert response.status_code == 200
        return response.json()["id"]


class TestAdminRecruitmentEndpoints:
    """Tests for admin-only recruitment management endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get auth token for admin endpoints"""
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.text}")
        
        token = login_response.json().get("access_token")
        self.session = session
        self.headers = {"Authorization": f"Bearer {token}"}
    
    def test_get_recruitment_stats(self):
        """Admin should get recruitment statistics"""
        response = self.session.get(
            f"{BASE_URL}/api/admin/recruitment/stats",
            headers=self.headers
        )
        print(f"GET /api/admin/recruitment/stats -> {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify expected fields
        assert "open_billets" in data, "Stats should include open_billets count"
        assert "pending" in data, "Stats should include pending count"
        assert "reviewing" in data, "Stats should include reviewing count"
        assert "accepted" in data, "Stats should include accepted count"
        assert "total_applications" in data, "Stats should include total_applications"
        
        print(f"Stats: {data}")
        return data
    
    def test_stats_requires_auth(self):
        """Stats endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/recruitment/stats")
        assert response.status_code == 401, "Should return 401 without auth"
        print("Stats correctly requires authentication")
    
    def test_get_all_billets_admin(self):
        """Admin can get all billets including closed"""
        response = self.session.get(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers
        )
        print(f"GET /api/admin/recruitment/billets -> {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Admin sees {len(data)} total billets")
        return data
    
    def test_create_billet(self):
        """Admin can create a new billet"""
        unique_id = str(uuid.uuid4())[:8]
        billet_data = {
            "title": f"{TEST_PREFIX}Squad Leader_{unique_id}",
            "company": "Alpha",
            "platoon": "1st Platoon",
            "description": "Lead a squad of 4-6 operators in tactical operations",
            "requirements": "Leadership experience, good communication skills",
            "is_open": True
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers,
            json=billet_data
        )
        print(f"POST /api/admin/recruitment/billets -> {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain billet id"
        print(f"Billet created with ID: {data['id']}")
        return data["id"]
    
    def test_update_billet(self):
        """Admin can update an existing billet"""
        # First create a billet
        unique_id = str(uuid.uuid4())[:8]
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers,
            json={
                "title": f"{TEST_PREFIX}ToUpdate_{unique_id}",
                "description": "Original description",
                "is_open": True
            }
        )
        billet_id = create_response.json()["id"]
        
        # Now update it
        update_response = self.session.put(
            f"{BASE_URL}/api/admin/recruitment/billets/{billet_id}",
            headers=self.headers,
            json={"description": "Updated description", "is_open": False}
        )
        print(f"PUT /api/admin/recruitment/billets/{billet_id} -> {update_response.status_code}")
        assert update_response.status_code == 200
        
        # Verify update persisted
        get_response = self.session.get(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers
        )
        billets = get_response.json()
        updated = next((b for b in billets if b["id"] == billet_id), None)
        assert updated is not None, "Updated billet should exist"
        assert updated["description"] == "Updated description"
        assert updated["is_open"] == False
        print("Billet update verified")
        return billet_id
    
    def test_delete_billet(self):
        """Admin can delete a billet"""
        # Create one to delete
        unique_id = str(uuid.uuid4())[:8]
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers,
            json={
                "title": f"{TEST_PREFIX}ToDelete_{unique_id}",
                "description": "Will be deleted",
                "is_open": True
            }
        )
        billet_id = create_response.json()["id"]
        
        # Delete it
        delete_response = self.session.delete(
            f"{BASE_URL}/api/admin/recruitment/billets/{billet_id}",
            headers=self.headers
        )
        print(f"DELETE /api/admin/recruitment/billets/{billet_id} -> {delete_response.status_code}")
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = self.session.get(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers
        )
        billets = get_response.json()
        deleted = next((b for b in billets if b["id"] == billet_id), None)
        assert deleted is None, "Deleted billet should not exist"
        print("Billet deletion verified")
    
    def test_get_applications_list(self):
        """Admin can get list of all applications"""
        response = self.session.get(
            f"{BASE_URL}/api/admin/recruitment/applications",
            headers=self.headers
        )
        print(f"GET /api/admin/recruitment/applications -> {response.status_code}")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} applications")
        return data
    
    def test_update_application_status(self):
        """Admin can update application status"""
        # First submit an application
        unique_id = str(uuid.uuid4())[:8]
        app_response = requests.post(
            f"{BASE_URL}/api/recruitment/apply",
            json={
                "applicant_name": f"{TEST_PREFIX}StatusTest_{unique_id}",
                "applicant_email": f"status_{unique_id}@test.com",
                "experience": "Test experience",
                "availability": "Test availability",
                "why_join": "Testing status updates"
            }
        )
        app_id = app_response.json()["id"]
        
        # Update to reviewing
        update_response = self.session.put(
            f"{BASE_URL}/api/admin/recruitment/applications/{app_id}",
            headers=self.headers,
            json={"status": "reviewing", "admin_notes": "Under review by test"}
        )
        print(f"PUT /api/admin/recruitment/applications/{app_id} (reviewing) -> {update_response.status_code}")
        assert update_response.status_code == 200
        
        # Verify status changed
        get_response = self.session.get(
            f"{BASE_URL}/api/admin/recruitment/applications/{app_id}",
            headers=self.headers
        )
        assert get_response.status_code == 200
        app_data = get_response.json()
        assert app_data["status"] == "reviewing"
        assert app_data["admin_notes"] == "Under review by test"
        assert "reviewed_by" in app_data
        print(f"Application status updated to 'reviewing' by {app_data.get('reviewed_by')}")
        
        return app_id


class TestBilletsCRUDPersistence:
    """Tests to verify billets CRUD operations persist correctly"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip("Admin login failed")
        self.session = session
        self.headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
    
    def test_created_billet_shows_in_public_endpoint(self):
        """Open billet created by admin should appear in public endpoint"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create an OPEN billet
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers,
            json={
                "title": f"{TEST_PREFIX}PublicVisible_{unique_id}",
                "description": "Should appear in public listing",
                "is_open": True
            }
        )
        billet_id = create_response.json()["id"]
        
        # Check public endpoint
        public_response = requests.get(f"{BASE_URL}/api/recruitment/billets")
        billets = public_response.json()
        found = next((b for b in billets if b["id"] == billet_id), None)
        assert found is not None, "Open billet should appear in public listing"
        assert found["title"] == f"{TEST_PREFIX}PublicVisible_{unique_id}"
        print("Open billet correctly visible in public endpoint")
        
        # Clean up
        self.session.delete(
            f"{BASE_URL}/api/admin/recruitment/billets/{billet_id}",
            headers=self.headers
        )
    
    def test_closed_billet_not_in_public_endpoint(self):
        """Closed billet should NOT appear in public endpoint"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create a CLOSED billet
        create_response = self.session.post(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers,
            json={
                "title": f"{TEST_PREFIX}ClosedHidden_{unique_id}",
                "description": "Should NOT appear in public listing",
                "is_open": False
            }
        )
        billet_id = create_response.json()["id"]
        
        # Check public endpoint
        public_response = requests.get(f"{BASE_URL}/api/recruitment/billets")
        billets = public_response.json()
        found = next((b for b in billets if b["id"] == billet_id), None)
        assert found is None, "Closed billet should NOT appear in public listing"
        print("Closed billet correctly hidden from public endpoint")
        
        # Admin should still see it
        admin_response = self.session.get(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers
        )
        admin_billets = admin_response.json()
        admin_found = next((b for b in admin_billets if b["id"] == billet_id), None)
        assert admin_found is not None, "Closed billet should be visible to admin"
        print("Admin can still see closed billet")
        
        # Clean up
        self.session.delete(
            f"{BASE_URL}/api/admin/recruitment/billets/{billet_id}",
            headers=self.headers
        )


class TestCleanup:
    """Cleanup test data after tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        session = requests.Session()
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip("Admin login failed for cleanup")
        self.session = session
        self.headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
    
    def test_cleanup_test_billets(self):
        """Remove test billets created during testing"""
        response = self.session.get(
            f"{BASE_URL}/api/admin/recruitment/billets",
            headers=self.headers
        )
        if response.status_code != 200:
            return
        
        billets = response.json()
        test_billets = [b for b in billets if b["title"].startswith(TEST_PREFIX)]
        
        for billet in test_billets:
            self.session.delete(
                f"{BASE_URL}/api/admin/recruitment/billets/{billet['id']}",
                headers=self.headers
            )
            print(f"Cleaned up billet: {billet['title']}")
        
        print(f"Cleaned up {len(test_billets)} test billets")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
