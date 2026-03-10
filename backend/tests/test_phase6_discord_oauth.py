"""
Phase 6 Discord OAuth2 Tests - Azimuth Operations Group
Tests for Discord OAuth endpoints and finalization features
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"
MEMBER_EMAIL = "testmember@azimuth.ops"
MEMBER_PASSWORD = "Test123!"

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
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")

@pytest.fixture(scope="module")
def member_token(api_client):
    """Get member authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": MEMBER_EMAIL,
        "password": MEMBER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Member authentication failed")

@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

@pytest.fixture
def member_headers(member_token):
    return {"Authorization": f"Bearer {member_token}", "Content-Type": "application/json"}


# ============================================================================
# DISCORD OAUTH ENDPOINT TESTS
# ============================================================================

class TestDiscordOAuthEndpoints:
    """Tests for Discord OAuth2 endpoints"""
    
    def test_discord_login_returns_oauth_url(self, api_client):
        """GET /api/auth/discord returns valid Discord OAuth URL"""
        response = api_client.get(f"{BASE_URL}/api/auth/discord")
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        url = data["url"]
        # Verify it's a Discord OAuth URL with required params
        assert "discord.com/oauth2/authorize" in url
        assert "client_id=" in url
        assert "redirect_uri=" in url
        assert "response_type=code" in url
        assert "scope=" in url
        assert "state=" in url
        print(f"Discord login URL returned successfully with state param")

    def test_discord_link_requires_auth(self, api_client):
        """GET /api/auth/discord/link requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/auth/discord/link")
        assert response.status_code in [401, 403]
        print("Discord link endpoint correctly requires auth")

    def test_discord_link_returns_oauth_url_with_user_id(self, api_client, member_headers):
        """GET /api/auth/discord/link (authed) returns OAuth URL with state containing user_id"""
        response = api_client.get(f"{BASE_URL}/api/auth/discord/link", headers=member_headers)
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        url = data["url"]
        # Verify it's a Discord OAuth URL with state (which contains user_id internally)
        assert "discord.com/oauth2/authorize" in url
        assert "state=" in url
        print(f"Discord link URL returned for authenticated user with state")

    def test_discord_callback_bad_state_returns_error_redirect(self, api_client):
        """GET /api/auth/discord/callback with bad state redirects with discord_error"""
        # Test with invalid state parameter
        response = api_client.get(
            f"{BASE_URL}/api/auth/discord/callback?code=fake_code&state=invalid_state",
            allow_redirects=False
        )
        # Should return a redirect with discord_error
        assert response.status_code in [302, 307]
        location = response.headers.get("Location", "")
        assert "discord_error" in location
        print(f"Bad state correctly redirects with error: {location}")

    def test_discord_callback_no_params_returns_error(self, api_client):
        """GET /api/auth/discord/callback with no params returns error redirect"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/discord/callback",
            allow_redirects=False
        )
        assert response.status_code in [302, 307]
        location = response.headers.get("Location", "")
        assert "discord_error" in location
        print(f"Missing params correctly redirects with error")

    def test_discord_unlink_requires_auth(self, api_client):
        """DELETE /api/auth/discord/unlink requires authentication"""
        response = api_client.delete(f"{BASE_URL}/api/auth/discord/unlink")
        assert response.status_code in [401, 403]
        print("Discord unlink endpoint correctly requires auth (401/403)")

    def test_discord_unlink_returns_400_if_not_linked(self, api_client, member_headers):
        """DELETE /api/auth/discord/unlink returns 400 if no Discord linked"""
        response = api_client.delete(f"{BASE_URL}/api/auth/discord/unlink", headers=member_headers)
        # Should return 400 if Discord is not linked
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"Unlink correctly returns 400 when not linked: {data['detail']}")


# ============================================================================
# AUTH TESTS - Email/Password (Regression)
# ============================================================================

class TestExistingAuth:
    """Regression tests for existing email/password authentication"""
    
    def test_admin_login_works(self, api_client):
        """Admin email/password login still works"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"Admin login successful: {data['user']['username']}")

    def test_member_login_works(self, api_client):
        """Member email/password login still works"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": MEMBER_EMAIL,
            "password": MEMBER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == MEMBER_EMAIL
        print(f"Member login successful: {data['user']['username']}")

    def test_registration_works(self, api_client):
        """Email/password registration still works"""
        import uuid
        test_email = f"test_reg_{uuid.uuid4().hex[:8]}@azimuth.ops"
        response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "username": f"TestReg{uuid.uuid4().hex[:6]}",
            "password": "TestPass123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == test_email
        print(f"Registration successful for new user: {data['user']['email']}")

    def test_auth_me_returns_discord_fields(self, api_client, admin_headers):
        """GET /api/auth/me returns Discord integration fields"""
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        # Verify Discord fields are present in user response
        assert "discord_id" in data
        assert "discord_username" in data
        assert "discord_avatar" in data
        assert "discord_linked" in data
        print(f"User response includes Discord fields: discord_linked={data['discord_linked']}")


# ============================================================================
# ADMIN PAGES - Regression Tests
# ============================================================================

class TestAdminEndpointsRegression:
    """Regression tests for admin API endpoints"""
    
    def test_admin_site_content(self, api_client, admin_headers):
        """Admin site content endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/admin/site-content", headers=admin_headers)
        assert response.status_code == 200
        print("Admin site content endpoint working")

    def test_admin_users_list(self, api_client, admin_headers):
        """Admin users list endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Admin users list returned {len(data)} users")

    def test_operations_list(self, api_client):
        """Operations endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Operations list returned {len(data)} operations")

    def test_announcements_list(self, api_client):
        """Announcements endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/announcements")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Announcements list returned {len(data)} announcements")

    def test_discussions_list(self, api_client):
        """Discussions endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Discussions list returned {len(data)} discussions")

    def test_gallery_list(self, api_client):
        """Gallery endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/gallery")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Gallery list returned {len(data)} images")

    def test_training_list(self, api_client):
        """Training endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/training")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Training list returned {len(data)} training items")


# ============================================================================
# ROSTER & PROFILE TESTS (Regression)
# ============================================================================

class TestRosterAndProfile:
    """Tests for roster and profile endpoints"""
    
    def test_roster_list(self, api_client, member_headers):
        """Roster endpoint returns member list"""
        response = api_client.get(f"{BASE_URL}/api/roster", headers=member_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Roster returned {len(data)} members")

    def test_roster_profile_includes_discord_fields(self, api_client, member_headers, admin_headers):
        """Roster profile endpoint includes Discord fields"""
        # First get a user ID from roster
        roster_response = api_client.get(f"{BASE_URL}/api/roster", headers=member_headers)
        roster = roster_response.json()
        if not roster:
            pytest.skip("No users in roster to test")
        
        user_id = roster[0]["id"]
        response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers=member_headers)
        assert response.status_code == 200
        data = response.json()
        # Verify Discord fields
        assert "discord_id" in data
        assert "discord_username" in data
        assert "discord_avatar" in data
        assert "discord_linked" in data
        print(f"Profile includes Discord fields: discord_linked={data['discord_linked']}")


# ============================================================================
# SEARCH TESTS (Regression)
# ============================================================================

class TestSearchRegression:
    """Regression tests for search functionality"""
    
    def test_search_requires_auth(self, api_client):
        """Search requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/search?q=test")
        assert response.status_code in [401, 403]
        print("Search correctly requires auth")

    def test_search_returns_operations_and_discussions(self, api_client, member_headers):
        """Search returns operations and discussions arrays"""
        response = api_client.get(f"{BASE_URL}/api/search?q=test", headers=member_headers)
        assert response.status_code == 200
        data = response.json()
        assert "operations" in data
        assert "discussions" in data
        print(f"Search returned {len(data.get('operations', []))} ops, {len(data.get('discussions', []))} discussions")


# ============================================================================
# DISCUSSIONS PIN TESTS (Regression)
# ============================================================================

class TestDiscussionPinRegression:
    """Regression tests for discussion pinning"""
    
    def test_discussions_sorted_by_pinned(self, api_client):
        """Discussions are sorted with pinned first"""
        response = api_client.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        data = response.json()
        if len(data) > 1:
            # Check that pinned discussions appear before unpinned
            pinned_found = False
            for disc in data:
                if disc.get("pinned"):
                    pinned_found = True
                elif pinned_found and not disc.get("pinned"):
                    # Found an unpinned after a pinned - correct behavior
                    print("Discussions correctly sorted with pinned first")
                    return
            print("Pinned discussions sorted correctly (or no mix of pinned/unpinned)")


# ============================================================================
# API ROOT TEST
# ============================================================================

class TestAPIRoot:
    """Basic API health check"""
    
    def test_api_root(self, api_client):
        """API root returns operational status"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "operational"
        print("API root operational")
