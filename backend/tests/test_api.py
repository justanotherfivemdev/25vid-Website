"""
Backend API tests for Azimuth Operations Group MilSim website.
Tests: Authentication (register/login), Operations, Announcements, File Upload, Site Content, Admin endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://tactical-hub-21.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"
TEST_USER_PREFIX = "TEST_"


class TestHealthAndBasicAPI:
    """Health check and basic API endpoints"""
    
    def test_api_root(self):
        """Test API root endpoint returns operational status"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Azimuth Operations Group API"
        assert data["status"] == "operational"
        print("API root endpoint working correctly")


class TestUserRegistration:
    """User registration flow tests"""
    
    def test_register_new_user(self):
        """Test registering a new user"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"{TEST_USER_PREFIX}user_{unique_id}@test.com",
            "username": f"{TEST_USER_PREFIX}user_{unique_id}",
            "password": "TestPassword123!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "access_token" in data, "Missing access_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["email"] == payload["email"]
        assert data["user"]["username"] == payload["username"]
        assert data["user"]["role"] == "member"
        print(f"Successfully registered user: {payload['username']}")
        
        return data
    
    def test_register_duplicate_email(self):
        """Test that duplicate email registration fails"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"{TEST_USER_PREFIX}dup_{unique_id}@test.com",
            "username": f"{TEST_USER_PREFIX}dup_{unique_id}",
            "password": "TestPassword123!"
        }
        
        # First registration should succeed
        response1 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response1.status_code == 200
        
        # Second registration with same email should fail
        payload["username"] = f"{TEST_USER_PREFIX}dup2_{unique_id}"
        response2 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response2.status_code == 400
        assert "already registered" in response2.json()["detail"].lower()
        print("Duplicate email registration correctly rejected")


class TestUserLogin:
    """User login flow tests"""
    
    def test_admin_login(self):
        """Test admin user login"""
        payload = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN_EMAIL
        print(f"Admin login successful: {ADMIN_EMAIL}")
        
        return data["access_token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials fails"""
        payload = {
            "email": "wrong@email.com",
            "password": "wrongpassword"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()
        print("Invalid credentials correctly rejected")
    
    def test_register_and_login_flow(self):
        """Test full registration then login flow"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"{TEST_USER_PREFIX}flow_{unique_id}@test.com"
        password = "TestFlow123!"
        username = f"{TEST_USER_PREFIX}flow_{unique_id}"
        
        # Register
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "username": username,
            "password": password
        })
        assert reg_response.status_code == 200
        
        # Login with same credentials
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        assert login_response.status_code == 200
        data = login_response.json()
        assert data["user"]["email"] == email
        print(f"Full registration and login flow successful for {email}")


class TestOperations:
    """Operations CRUD tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed - skipping authenticated tests")
        return response.json()["access_token"]
    
    def test_get_operations(self):
        """Test getting operations list (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"GET /api/operations returned {len(response.json())} operations")
    
    def test_create_operation_authenticated(self, admin_token):
        """Test creating operation with auth"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": f"{TEST_USER_PREFIX}Operation_{uuid.uuid4().hex[:8]}",
            "description": "Test operation description",
            "operation_type": "combat",
            "date": "2026-04-01",
            "time": "14:00"
        }
        
        response = requests.post(f"{BASE_URL}/api/operations", json=payload, headers=headers)
        assert response.status_code == 200, f"Create operation failed: {response.text}"
        
        data = response.json()
        assert data["title"] == payload["title"]
        assert data["operation_type"] == "combat"
        assert "id" in data
        print(f"Created operation: {data['title']}")
        
        return data
    
    def test_create_operation_unauthenticated(self):
        """Test creating operation without auth fails"""
        payload = {
            "title": "Unauthorized Operation",
            "description": "Should fail",
            "operation_type": "combat",
            "date": "2026-04-01",
            "time": "14:00"
        }
        
        response = requests.post(f"{BASE_URL}/api/operations", json=payload)
        assert response.status_code in [401, 403]
        print("Unauthenticated operation creation correctly rejected")


class TestAnnouncements:
    """Announcements CRUD tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_announcements(self):
        """Test getting announcements list (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/announcements")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"GET /api/announcements returned {len(response.json())} announcements")
    
    def test_create_announcement_authenticated(self, admin_token):
        """Test creating announcement with auth"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": f"{TEST_USER_PREFIX}Intel_{uuid.uuid4().hex[:8]}",
            "content": "Test intel content",
            "priority": "high"
        }
        
        response = requests.post(f"{BASE_URL}/api/announcements", json=payload, headers=headers)
        assert response.status_code == 200, f"Create announcement failed: {response.text}"
        
        data = response.json()
        assert data["title"] == payload["title"]
        assert data["priority"] == "high"
        assert "id" in data
        print(f"Created announcement: {data['title']}")
        
        return data


class TestFileUpload:
    """File upload API tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_upload_file_authenticated(self, admin_token):
        """Test file upload with authentication"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a simple test image (1x1 red pixel PNG)
        import base64
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test_image.png", png_data, "image/png")}
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        
        assert response.status_code == 200, f"File upload failed: {response.text}"
        data = response.json()
        assert "url" in data
        assert "filename" in data
        assert data["url"].startswith("/uploads/")
        print(f"File uploaded successfully: {data['url']}")
    
    def test_upload_file_unauthenticated(self):
        """Test file upload without auth fails"""
        import base64
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test_image.png", png_data, "image/png")}
        response = requests.post(f"{BASE_URL}/api/upload", files=files)
        
        assert response.status_code in [401, 403]
        print("Unauthenticated file upload correctly rejected")


class TestSiteContent:
    """Site content API tests"""
    
    def test_get_public_site_content(self):
        """Test public site content endpoint"""
        response = requests.get(f"{BASE_URL}/api/site-content")
        assert response.status_code == 200
        # Response can be null or object
        print(f"Public site content response: {type(response.json())}")
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_admin_site_content(self, admin_token):
        """Test admin site content endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        # Should have default structure
        assert "hero" in data
        assert "about" in data
        assert "footer" in data
        print("Admin site content endpoint working correctly")


class TestAdminEndpoints:
    """Admin-only endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    def test_get_all_users_admin(self, admin_token):
        """Test admin users list endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        # Should have at least the admin user
        assert len(users) >= 1
        # Verify admin user is in the list
        admin_found = any(u["email"] == ADMIN_EMAIL for u in users)
        assert admin_found, "Admin user not found in users list"
        print(f"Admin users endpoint returned {len(users)} users")
    
    def test_admin_users_requires_auth(self):
        """Test admin users endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code in [401, 403]
        print("Admin users endpoint correctly requires auth")


class TestPublicEndpoints:
    """Tests for public endpoints"""
    
    def test_discussions_endpoint(self):
        """Test discussions endpoint"""
        response = requests.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"Discussions endpoint returned {len(response.json())} discussions")
    
    def test_gallery_endpoint(self):
        """Test gallery endpoint"""
        response = requests.get(f"{BASE_URL}/api/gallery")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"Gallery endpoint returned {len(response.json())} images")
    
    def test_training_endpoint(self):
        """Test training endpoint"""
        response = requests.get(f"{BASE_URL}/api/training")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"Training endpoint returned {len(response.json())} training items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
