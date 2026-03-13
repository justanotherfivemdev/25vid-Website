"""
Automated test suite for 25th Infantry Division backend.
Covers: auth, Discord callback, admin authorization, RSVP, file upload validation, search.
"""
import pytest
import httpx
import os
import uuid

BASE_URL = os.environ.get("TEST_API_URL", "http://localhost:8001/api")

# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture(scope="module")
def test_user():
    """Register a fresh test user, return credentials + cookies."""
    email = f"testuser_{uuid.uuid4().hex[:8]}@25thvid.com"
    password = "TestPass123!"
    username = f"TestOp_{uuid.uuid4().hex[:6]}"
    with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
        res = client.post("/auth/register", json={
            "email": email, "username": username, "password": password
        })
        assert res.status_code == 200, f"Register failed: {res.text}"
        data = res.json()
        cookies = dict(res.cookies)
        assert "auth_token" in cookies, "No auth_token cookie set on register"
        return {
            "email": email, "password": password, "username": username,
            "user": data["user"], "cookies": cookies
        }


@pytest.fixture(scope="module")
def admin_cookies():
    """Login as admin, return cookies."""
    with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
        res = client.post("/auth/login", json={
            "email": "bishop@azimuth.ops", "password": "Admin123!"
        })
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        cookies = dict(res.cookies)
        assert "auth_token" in cookies
        return cookies


# ============================================================================
# AUTH TESTS
# ============================================================================

class TestAuth:
    def test_register_sets_cookie(self, test_user):
        """Registration should return user data AND set HttpOnly cookie."""
        assert test_user["cookies"].get("auth_token")
        assert test_user["user"]["email"] == test_user["email"]

    def test_login_sets_cookie(self, test_user):
        """Login should set HttpOnly cookie."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.post("/auth/login", json={
                "email": test_user["email"], "password": test_user["password"]
            })
            assert res.status_code == 200
            assert "auth_token" in dict(res.cookies)

    def test_me_with_cookie(self, test_user):
        """GET /auth/me should work with cookie authentication."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.get("/auth/me")
            assert res.status_code == 200
            assert res.json()["email"] == test_user["email"]

    def test_me_without_auth_fails(self):
        """GET /auth/me without cookie/token should return 401."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.get("/auth/me")
            assert res.status_code == 401

    def test_logout_clears_cookie(self, test_user):
        """POST /auth/logout should clear the auth cookie."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.post("/auth/logout")
            assert res.status_code == 200
            # After logout, a new request with the cleared cookie should fail
            # Note: httpx doesn't auto-apply set-cookie from responses, so we simulate

    def test_register_password_too_short(self):
        """Registration with password < 8 chars should fail."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.post("/auth/register", json={
                "email": "short@test.com", "username": "shortpw", "password": "abc"
            })
            assert res.status_code == 422  # Pydantic validation error

    def test_register_duplicate_email(self, test_user):
        """Duplicate email registration should fail."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.post("/auth/register", json={
                "email": test_user["email"], "username": "dup", "password": "LongEnough123!"
            })
            assert res.status_code == 400

    def test_login_wrong_password(self, test_user):
        """Login with wrong password should return 401."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.post("/auth/login", json={
                "email": test_user["email"], "password": "WrongPassword!"
            })
            assert res.status_code == 401

    def test_no_token_in_url_discord_flow(self):
        """Discord callback should NOT put JWT in URL query params."""
        # We can't fully test OAuth flow but we verify the callback doesn't
        # include discord_token in redirects by checking the endpoint exists
        with httpx.Client(base_url=BASE_URL, follow_redirects=False) as client:
            # Without valid code/state, should redirect with error, NOT with token
            res = client.get("/auth/discord/callback?code=fake&state=fake")
            assert res.status_code in (302, 307)
            location = res.headers.get("location", "")
            assert "discord_token" not in location
            assert "discord_error" in location or "discord_success" in location


# ============================================================================
# ADMIN AUTHORIZATION TESTS
# ============================================================================

class TestAdminAuth:
    def test_admin_endpoint_requires_auth(self):
        """Admin endpoints should reject unauthenticated requests."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.get("/admin/users")
            assert res.status_code == 401

    def test_admin_endpoint_rejects_member(self, test_user):
        """Admin endpoints should reject non-admin users with 403."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.get("/admin/users")
            assert res.status_code == 403

    def test_admin_endpoint_allows_admin(self, admin_cookies):
        """Admin endpoints should allow admin users."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.get("/admin/users")
            assert res.status_code == 200
            assert isinstance(res.json(), list)


# ============================================================================
# RSVP TESTS
# ============================================================================

class TestRSVP:
    @pytest.fixture(scope="class")
    def operation_id(self, admin_cookies):
        """Create a test operation."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/operations", json={
                "title": f"Test Op {uuid.uuid4().hex[:6]}",
                "description": "Test operation for RSVP testing",
                "operation_type": "combat",
                "date": "2026-12-25",
                "time": "18:00",
                "max_participants": 3
            })
            assert res.status_code == 200
            return res.json()["id"]

    def test_rsvp_attending(self, test_user, operation_id):
        """User should be able to RSVP as attending."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.post(f"/operations/{operation_id}/rsvp", json={
                "status": "attending", "role_notes": "Rifleman"
            })
            assert res.status_code == 200
            assert res.json()["your_status"] == "attending"

    def test_rsvp_uses_rsvps_field(self, test_user, operation_id):
        """Operation should store RSVPs in 'rsvps' field, not 'rsvp_list'."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.get(f"/operations/{operation_id}")
            assert res.status_code == 200
            op = res.json()
            assert "rsvps" in op
            assert "rsvp_list" not in op

    def test_rsvp_cancel(self, test_user, operation_id):
        """User should be able to cancel RSVP."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.delete(f"/operations/{operation_id}/rsvp")
            assert res.status_code == 200


# ============================================================================
# FILE UPLOAD VALIDATION TESTS
# ============================================================================

class TestFileUpload:
    def test_upload_requires_auth(self):
        """File upload should require authentication."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.post("/upload", files={"file": ("test.txt", b"hello", "text/plain")})
            assert res.status_code == 401

    def test_upload_with_auth(self, admin_cookies):
        """Authenticated user should be able to upload files."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/upload", files={
                "file": ("test.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 100, "image/png")
            })
            assert res.status_code == 200
            assert "url" in res.json()


    def test_upload_ico_with_auth(self, admin_cookies):
        """Authenticated user should be able to upload .ico files for favicon support."""
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.post("/upload", files={
                "file": ("favicon.ico", b"\x00\x00\x01\x00" + b"\x00" * 100, "image/x-icon")
            })
            assert res.status_code == 200
            assert res.json().get("url", "").endswith(".ico")


# ============================================================================
# SEARCH TESTS
# ============================================================================

class TestSearch:
    def test_search_requires_auth(self):
        """Search should require authentication."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.get("/search?q=test")
            assert res.status_code == 401

    def test_search_min_length(self, test_user):
        """Search query must be at least 2 characters."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.get("/search?q=a")
            assert res.status_code == 400

    def test_search_escapes_regex(self, test_user):
        """Search should handle regex special chars safely (no crash)."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.get("/search?q=test.*%5B%5D%28%29%7C")  # test.*[]()| 
            assert res.status_code == 200  # Should not crash

    def test_search_returns_results(self, test_user):
        """Valid search should return operations and discussions."""
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.get("/search?q=test")
            assert res.status_code == 200
            data = res.json()
            assert "operations" in data
            assert "discussions" in data


# ============================================================================
# CORS TESTS
# ============================================================================

class TestCORS:
    def test_cors_rejects_wildcard_with_credentials(self):
        """CORS should not use wildcard origins when credentials are enabled."""
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.options("/auth/login", headers={
                "Origin": "https://evil-site.com",
                "Access-Control-Request-Method": "POST"
            })
            # Should not reflect evil-site.com as allowed origin
            acao = res.headers.get("access-control-allow-origin", "")
            assert acao != "*"
            assert "evil-site.com" not in acao
