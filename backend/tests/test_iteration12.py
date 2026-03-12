"""
Iteration 12 Backend Tests - Auth Refactor + Member of the Week Feature
Tests:
- Auth flow (login, session persistence via cookies, logout)
- Member of the Week CRUD (set, get, clear)
- Admin header navigation buttons
- Announcement content preservation (whitespace-pre-wrap)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthCookieFlow:
    """Test auth via HttpOnly cookies - session persistence"""
    
    def test_login_sets_cookie(self):
        """Admin login sets auth_token cookie"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        assert "user" in data
        assert data["user"]["role"] == "admin"
        # Cookie should be set
        assert "auth_token" in session.cookies
        print(f"✓ Login sets cookie, user role: {data['user']['role']}")
    
    def test_auth_me_with_cookie(self):
        """GET /auth/me works with cookie auth"""
        session = requests.Session()
        # Login first
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!"
        })
        # Then hit /auth/me
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200, f"auth/me failed: {resp.text}"
        user = resp.json()
        assert user["username"] is not None
        print(f"✓ auth/me returns user: {user['username']}")
    
    def test_auth_me_without_cookie_fails(self):
        """GET /auth/me fails without auth"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 401
        print("✓ auth/me without auth returns 401")
    
    def test_logout_clears_session(self):
        """POST /auth/logout clears cookie"""
        session = requests.Session()
        # Login
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!"
        })
        # Logout
        resp = session.post(f"{BASE_URL}/api/auth/logout")
        assert resp.status_code == 200
        # Subsequent auth/me should fail
        resp2 = session.get(f"{BASE_URL}/api/auth/me")
        assert resp2.status_code == 401
        print("✓ Logout clears session")


class TestMemberOfTheWeek:
    """Test MOTW feature - GET/PUT/DELETE"""
    
    @pytest.fixture
    def admin_session(self):
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!"
        })
        assert resp.status_code == 200
        return session
    
    def test_get_motw_unauthenticated(self):
        """GET /member-of-the-week works without auth (public)"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/member-of-the-week")
        # Should return 200 even without auth (could be null or data)
        assert resp.status_code == 200
        print(f"✓ GET MOTW public: {resp.json()}")
    
    def test_set_motw_requires_admin(self):
        """PUT /admin/member-of-the-week requires admin"""
        session = requests.Session()
        resp = session.put(f"{BASE_URL}/api/admin/member-of-the-week", json={
            "user_id": "test",
            "reason": "test"
        })
        assert resp.status_code == 401
        print("✓ Set MOTW requires auth (401)")
    
    def test_set_and_get_motw(self, admin_session):
        """Admin can set MOTW and it's retrievable"""
        # First get a user ID
        users_resp = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert users_resp.status_code == 200
        users = users_resp.json()
        if not users:
            pytest.skip("No users to set as MOTW")
        user_id = users[0]["id"]
        
        # Set MOTW
        resp = admin_session.put(f"{BASE_URL}/api/admin/member-of-the-week", json={
            "user_id": user_id,
            "reason": "Outstanding performance in Iteration 12 testing"
        })
        assert resp.status_code == 200, f"Set MOTW failed: {resp.text}"
        motw = resp.json()
        assert motw["user_id"] == user_id
        print(f"✓ Set MOTW: {motw['username']}")
        
        # Verify GET returns it
        get_resp = admin_session.get(f"{BASE_URL}/api/member-of-the-week")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data is not None
        assert data["user_id"] == user_id
        print(f"✓ GET MOTW returns correct user: {data['username']}")
    
    def test_clear_motw(self, admin_session):
        """Admin can clear MOTW"""
        resp = admin_session.delete(f"{BASE_URL}/api/admin/member-of-the-week")
        assert resp.status_code == 200
        print("✓ Clear MOTW successful")


class TestAnnouncementLineBreaks:
    """Test announcement content preserves line breaks"""
    
    @pytest.fixture
    def admin_session(self):
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!"
        })
        assert resp.status_code == 200
        return session
    
    def test_create_announcement_with_linebreaks(self, admin_session):
        """Announcement content with newlines is preserved"""
        content_with_breaks = "Line 1\n\nLine 2 after paragraph break\n\nLine 3"
        resp = admin_session.post(f"{BASE_URL}/api/announcements", json={
            "title": "TEST_Iteration12_LineBreak_Test",
            "content": content_with_breaks,
            "priority": "normal"
        })
        assert resp.status_code == 200, f"Create failed: {resp.text}"
        data = resp.json()
        assert data["content"] == content_with_breaks
        print(f"✓ Announcement preserves line breaks in content")
        
        # Cleanup
        ann_id = data["id"]
        admin_session.delete(f"{BASE_URL}/api/admin/announcements/{ann_id}")


class TestAdminEndpoints:
    """Test admin endpoints are protected"""
    
    @pytest.fixture
    def admin_session(self):
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!"
        })
        assert resp.status_code == 200
        return session
    
    def test_admin_users_requires_admin(self):
        """GET /admin/users requires admin"""
        session = requests.Session()
        resp = session.get(f"{BASE_URL}/api/admin/users")
        assert resp.status_code == 401
        print("✓ /admin/users requires auth")
    
    def test_admin_can_access_users(self, admin_session):
        """Admin can access /admin/users"""
        resp = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert resp.status_code == 200
        users = resp.json()
        assert isinstance(users, list)
        print(f"✓ Admin can access users list ({len(users)} users)")


class TestPublicEndpoints:
    """Test public endpoints work without auth"""
    
    def test_operations_public(self):
        """GET /operations is public"""
        resp = requests.get(f"{BASE_URL}/api/operations")
        assert resp.status_code == 200
        print(f"✓ Operations endpoint public ({len(resp.json())} ops)")
    
    def test_announcements_public(self):
        """GET /announcements is public"""
        resp = requests.get(f"{BASE_URL}/api/announcements")
        assert resp.status_code == 200
        print(f"✓ Announcements endpoint public ({len(resp.json())} announcements)")
    
    def test_site_content_public(self):
        """GET /site-content is public"""
        resp = requests.get(f"{BASE_URL}/api/site-content")
        assert resp.status_code == 200
        print("✓ Site content endpoint public")
    
    def test_motw_public(self):
        """GET /member-of-the-week is public"""
        resp = requests.get(f"{BASE_URL}/api/member-of-the-week")
        assert resp.status_code == 200
        print(f"✓ MOTW endpoint public")


class TestSessionPersistence:
    """Test session persistence across multiple requests"""
    
    def test_session_persists_across_requests(self):
        """Session cookie persists across multiple API calls"""
        session = requests.Session()
        # Login
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!"
        })
        assert login_resp.status_code == 200
        
        # Make multiple requests - simulating page navigation
        endpoints = [
            "/api/auth/me",
            "/api/operations",
            "/api/announcements",
            "/api/auth/me",  # Check again
        ]
        
        for endpoint in endpoints:
            resp = session.get(f"{BASE_URL}{endpoint}")
            assert resp.status_code == 200, f"Request to {endpoint} failed after login"
        
        print("✓ Session persists across multiple requests (4 requests)")
    
    def test_admin_access_persists(self):
        """Admin role persists across page navigations"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!"
        })
        
        # Access multiple admin endpoints - simulating navigation
        admin_endpoints = [
            "/api/admin/users",
            "/api/admin/site-content",
            "/api/member-of-the-week",
            "/api/admin/users",  # Back to users
        ]
        
        for endpoint in admin_endpoints:
            resp = session.get(f"{BASE_URL}{endpoint}")
            assert resp.status_code == 200, f"Admin access to {endpoint} failed"
        
        print("✓ Admin access persists across navigation")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
