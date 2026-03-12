"""
Test Suite: 25th Infantry Division - Recruit Flow Testing
Tests:
- New user registration and routing (recruit status by default)
- /api/recruit/my-application returns null for new recruit
- /api/recruit/apply creates application linked to user account
- User status determines routing (recruit vs active member)
- Admin authentication and routing
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRecruitRegistrationAndRouting:
    """Test new user registration flow and recruit routing"""
    
    @pytest.fixture(scope="class")
    def test_recruit_creds(self):
        """Generate unique test recruit credentials"""
        unique_id = uuid.uuid4().hex[:8]
        return {
            "email": f"recruit_test_{unique_id}@test.com",
            "username": f"TestRecruit_{unique_id}",
            "password": "TestRecruitPass123!"
        }
    
    @pytest.fixture(scope="class")
    def api_client(self):
        """Shared requests session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_new_user_registration_returns_recruit_status(self, api_client, test_recruit_creds):
        """New user registration should return status='recruit' by default"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": test_recruit_creds["email"],
                "username": test_recruit_creds["username"],
                "password": test_recruit_creds["password"]
            }
        )
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        # Verify user returned with recruit status
        assert "user" in data, "Response should contain user object"
        user = data["user"]
        assert user["status"] == "recruit", f"New user should have status='recruit', got '{user.get('status')}'"
        assert user["role"] == "member", f"New user should have role='member', got '{user.get('role')}'"
        print(f"✓ New user registered with status='recruit': {user['username']}")
    
    def test_recruit_my_application_null_for_new_user(self, api_client, test_recruit_creds):
        """New recruit should have no application - returns null"""
        # Login as the recruit
        login_resp = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_recruit_creds["email"],
                "password": test_recruit_creds["password"]
            }
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        # Check application endpoint - should return null
        response = api_client.get(f"{BASE_URL}/api/recruit/my-application")
        assert response.status_code == 200, f"my-application failed: {response.text}"
        
        data = response.json()
        assert data is None, f"New recruit should have no application, got: {data}"
        print("✓ /api/recruit/my-application returns null for new recruit")
    
    def test_recruit_submit_application(self, api_client, test_recruit_creds):
        """Recruit can submit application via /api/recruit/apply"""
        # Login as the recruit
        login_resp = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_recruit_creds["email"],
                "password": test_recruit_creds["password"]
            }
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        # Submit application
        response = api_client.post(
            f"{BASE_URL}/api/recruit/apply",
            json={
                "discord_username": "TestRecruit#1234",
                "timezone": "EST",
                "experience": "Test experience for milsim",
                "availability": "Weekends",
                "why_join": "Testing the recruit flow"
            }
        )
        assert response.status_code == 200, f"Application submission failed: {response.text}"
        data = response.json()
        
        assert "id" in data, "Response should contain application id"
        assert data.get("message") == "Application submitted successfully"
        print(f"✓ Application submitted successfully: {data['id']}")
    
    def test_recruit_my_application_returns_data_after_submit(self, api_client, test_recruit_creds):
        """After submission, /api/recruit/my-application returns the application"""
        # Login as the recruit
        login_resp = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_recruit_creds["email"],
                "password": test_recruit_creds["password"]
            }
        )
        assert login_resp.status_code == 200
        
        # Check application endpoint - should return the application now
        response = api_client.get(f"{BASE_URL}/api/recruit/my-application")
        assert response.status_code == 200, f"my-application failed: {response.text}"
        
        data = response.json()
        assert data is not None, "Application should exist after submission"
        assert data.get("status") == "pending", f"Application status should be 'pending', got: {data.get('status')}"
        assert data.get("applicant_email") == test_recruit_creds["email"]
        print(f"✓ /api/recruit/my-application returns application with status='{data['status']}'")
    
    def test_recruit_cannot_submit_duplicate_application(self, api_client, test_recruit_creds):
        """Recruit cannot submit a second application"""
        # Login as the recruit
        login_resp = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_recruit_creds["email"],
                "password": test_recruit_creds["password"]
            }
        )
        assert login_resp.status_code == 200
        
        # Try to submit another application - should fail
        response = api_client.post(
            f"{BASE_URL}/api/recruit/apply",
            json={
                "discord_username": "Duplicate#0000",
                "timezone": "PST",
                "experience": "Duplicate attempt",
                "availability": "Never",
                "why_join": "Should fail"
            }
        )
        assert response.status_code == 400, f"Duplicate submission should fail with 400, got {response.status_code}"
        print("✓ Duplicate application submission correctly rejected")


class TestAdminAndActiveMemberRouting:
    """Test admin and active member routing"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_admin_login_returns_admin_role(self, api_client):
        """Admin login should return role='admin'"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "testadmin@test.com",
                "password": "TestAdmin123!"
            }
        )
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        
        assert "user" in data, "Response should contain user object"
        user = data["user"]
        assert user["role"] == "admin", f"Admin should have role='admin', got '{user.get('role')}'"
        print(f"✓ Admin login returns role='admin': {user['username']}")
    
    def test_admin_can_access_users_endpoint(self, api_client):
        """Admin should be able to access admin-only endpoints"""
        # Login as admin first
        login_resp = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "testadmin@test.com",
                "password": "TestAdmin123!"
            }
        )
        assert login_resp.status_code == 200
        
        # Access admin users endpoint
        response = api_client.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 200, f"Admin users endpoint failed: {response.text}"
        print("✓ Admin can access /api/admin/users")
    
    def test_admin_can_access_recruitment_stats(self, api_client):
        """Admin should be able to access recruitment stats"""
        # Login as admin first
        login_resp = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "testadmin@test.com",
                "password": "TestAdmin123!"
            }
        )
        assert login_resp.status_code == 200
        
        # Access recruitment stats
        response = api_client.get(f"{BASE_URL}/api/admin/recruitment/stats")
        assert response.status_code == 200, f"Recruitment stats failed: {response.text}"
        data = response.json()
        
        # Verify stats structure
        assert "total_applications" in data
        assert "pending" in data
        print(f"✓ Admin can access recruitment stats: {data}")


class TestPublicJoinPage:
    """Test public /join page endpoints"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_recruitment_billets_public_endpoint(self, api_client):
        """Public billets endpoint should work without auth"""
        response = api_client.get(f"{BASE_URL}/api/recruitment/billets")
        assert response.status_code == 200, f"Billets endpoint failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Billets should return a list"
        print(f"✓ Public /api/recruitment/billets returns {len(data)} billets")


class TestUserStatusDeterminesRouting:
    """Test that user status determines proper routing"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_recruit_status_user(self, api_client):
        """User with status='recruit' should be identified correctly"""
        # Create and register a new unique test recruit
        unique_id = uuid.uuid4().hex[:8]
        response = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": f"status_test_{unique_id}@test.com",
                "username": f"StatusTest_{unique_id}",
                "password": "TestPass123!"
            }
        )
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        user = data["user"]
        # Verify the user status is recruit
        assert user["status"] == "recruit", f"New user should have status='recruit'"
        assert user["role"] == "member", "New user should have role='member'"
        
        # This user should be routed to /recruit in frontend (tested in playwright)
        print(f"✓ New user has status='recruit', role='member' - should route to /recruit")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    def test_cleanup_test_applications(self, api_client):
        """Cleanup test applications (optional - may skip if permissions don't allow)"""
        # Login as admin
        login_resp = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "testadmin@test.com",
                "password": "TestAdmin123!"
            }
        )
        if login_resp.status_code != 200:
            pytest.skip("Admin login failed - skipping cleanup")
        
        # Get all applications
        apps_resp = api_client.get(f"{BASE_URL}/api/admin/recruitment/applications")
        if apps_resp.status_code != 200:
            pytest.skip("Could not get applications for cleanup")
        
        apps = apps_resp.json()
        test_apps = [a for a in apps if "test" in a.get("applicant_email", "").lower()]
        print(f"✓ Found {len(test_apps)} test applications (cleanup optional)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
