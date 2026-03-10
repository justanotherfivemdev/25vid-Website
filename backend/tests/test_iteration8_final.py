"""
Iteration 8 - Final Production Readiness Testing
Focus:
1. Verify requirements.txt has only essential dependencies (13 lines)
2. Verify Discord button conditional rendering (GET /api/auth/discord returns valid URL)
3. Full regression test of all features
4. Docs clean (no Emergent-specific bloat)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"
MEMBER_EMAIL = "testmember@azimuth.ops"
MEMBER_PASSWORD = "Test123!"


class TestAPIHealth:
    """Basic API health and root endpoint"""
    
    def test_api_root_operational(self):
        """API root returns operational status"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "operational"
        assert "Azimuth Operations Group" in data["message"]
        print("✓ API root operational")


class TestAuthenticationFlows:
    """Test email/password login, registration, and Discord OAuth availability"""
    
    def test_admin_login_success(self):
        """Admin can login with email/password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login works: {ADMIN_EMAIL}")
    
    def test_member_login_success(self):
        """Member can login with email/password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MEMBER_EMAIL,
            "password": MEMBER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == MEMBER_EMAIL
        print(f"✓ Member login works: {MEMBER_EMAIL}")
    
    def test_registration_works(self):
        """New user registration works"""
        import uuid
        test_email = f"test_iter8_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "username": f"TestUser_{uuid.uuid4().hex[:6]}",
            "password": "TestPass123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == test_email
        print(f"✓ Registration works for new user: {test_email}")
    
    def test_discord_oauth_endpoint_available(self):
        """GET /api/auth/discord returns OAuth URL - Discord is configured"""
        response = requests.get(f"{BASE_URL}/api/auth/discord")
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        assert "discord.com/oauth2/authorize" in data["url"]
        assert "client_id=" in data["url"]
        print("✓ Discord OAuth endpoint returns valid URL - Discord IS configured")
    
    def test_auth_me_returns_user_with_discord_fields(self):
        """GET /api/auth/me returns user with Discord integration fields"""
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login.json()["access_token"]
        response = requests.get(f"{BASE_URL}/api/auth/me", 
            headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        data = response.json()
        # Discord fields should exist even if null
        assert "discord_id" in data
        assert "discord_username" in data
        assert "discord_linked" in data
        print("✓ Auth /me returns Discord fields")


class TestDiscordOAuthEndpoints:
    """Test all Discord OAuth2 related endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return login.json()["access_token"]
    
    def test_discord_link_requires_auth(self):
        """GET /api/auth/discord/link requires authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/discord/link")
        assert response.status_code in [401, 403]
        print("✓ Discord /link endpoint requires auth")
    
    def test_discord_link_returns_url(self, admin_token):
        """GET /api/auth/discord/link returns OAuth URL with state"""
        response = requests.get(f"{BASE_URL}/api/auth/discord/link",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        assert "state=" in data["url"]
        print("✓ Discord /link returns OAuth URL with state")
    
    def test_discord_unlink_requires_auth(self):
        """DELETE /api/auth/discord/unlink requires authentication"""
        response = requests.delete(f"{BASE_URL}/api/auth/discord/unlink")
        assert response.status_code in [401, 403]
        print("✓ Discord /unlink requires auth")
    
    def test_discord_unlink_returns_400_if_not_linked(self, admin_token):
        """DELETE /api/auth/discord/unlink returns 400 if no Discord linked"""
        response = requests.delete(f"{BASE_URL}/api/auth/discord/unlink",
            headers={"Authorization": f"Bearer {admin_token}"})
        # Should be 400 since admin doesn't have Discord linked
        assert response.status_code == 400
        assert "No Discord account linked" in response.json()["detail"]
        print("✓ Discord /unlink returns 400 when not linked")


class TestOperationsEndpoints:
    """Test operations CRUD and RSVP functionality"""
    
    @pytest.fixture
    def admin_token(self):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return login.json()["access_token"]
    
    def test_operations_list(self):
        """GET /api/operations returns list"""
        response = requests.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Operations list works - {len(data)} operations")
    
    def test_operation_detail(self):
        """GET /api/operations/:id returns operation with required fields"""
        ops = requests.get(f"{BASE_URL}/api/operations").json()
        if ops:
            op_id = ops[0]["id"]
            response = requests.get(f"{BASE_URL}/api/operations/{op_id}")
            assert response.status_code == 200
            data = response.json()
            assert "id" in data
            assert "title" in data
            assert "rsvps" in data
            print(f"✓ Operation detail works - {data['title']}")
        else:
            pytest.skip("No operations to test")
    
    def test_operation_rsvp_flow(self, admin_token):
        """RSVP attend, change to tentative, cancel works"""
        ops = requests.get(f"{BASE_URL}/api/operations").json()
        if not ops:
            pytest.skip("No operations to test RSVP")
        
        op_id = ops[0]["id"]
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # RSVP as attending
        res1 = requests.post(f"{BASE_URL}/api/operations/{op_id}/rsvp",
            json={"status": "attending"}, headers=headers)
        assert res1.status_code == 200
        
        # Change to tentative
        res2 = requests.post(f"{BASE_URL}/api/operations/{op_id}/rsvp",
            json={"status": "tentative"}, headers=headers)
        assert res2.status_code == 200
        
        # Cancel RSVP
        res3 = requests.delete(f"{BASE_URL}/api/operations/{op_id}/rsvp",
            headers=headers)
        assert res3.status_code == 200
        print("✓ RSVP flow works: attend → tentative → cancel")


class TestDiscussionEndpoints:
    """Test discussion forum with pinning"""
    
    @pytest.fixture
    def admin_token(self):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return login.json()["access_token"]
    
    def test_discussions_list_pinned_first(self):
        """GET /api/discussions returns discussions with pinned at top"""
        response = requests.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Check if any pinned discussions exist
        pinned = [d for d in data if d.get("pinned")]
        if pinned and len(data) > 1:
            # Verify pinned items are at the top
            first_non_pinned_idx = next((i for i, d in enumerate(data) if not d.get("pinned")), len(data))
            for i, d in enumerate(data):
                if d.get("pinned"):
                    assert i < first_non_pinned_idx, "Pinned should come before non-pinned"
        print(f"✓ Discussions list works - {len(data)} discussions, {len(pinned)} pinned")
    
    def test_toggle_pin_discussion(self, admin_token):
        """PUT /api/admin/discussions/:id/pin toggles pin status"""
        discussions = requests.get(f"{BASE_URL}/api/discussions").json()
        if not discussions:
            pytest.skip("No discussions to test pin")
        
        disc_id = discussions[0]["id"]
        original_pinned = discussions[0].get("pinned", False)
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(f"{BASE_URL}/api/admin/discussions/{disc_id}/pin",
            headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["pinned"] == (not original_pinned)
        
        # Toggle back
        requests.put(f"{BASE_URL}/api/admin/discussions/{disc_id}/pin",
            headers=headers)
        print("✓ Pin toggle works")


class TestSearchEndpoint:
    """Test search functionality"""
    
    @pytest.fixture
    def member_token(self):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MEMBER_EMAIL, "password": MEMBER_PASSWORD
        })
        return login.json()["access_token"]
    
    def test_search_returns_categorized_results(self, member_token):
        """GET /api/search?q=... returns operations and discussions"""
        headers = {"Authorization": f"Bearer {member_token}"}
        response = requests.get(f"{BASE_URL}/api/search?q=test",
            headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "operations" in data
        assert "discussions" in data
        print("✓ Search returns categorized results")


class TestMyScheduleEndpoint:
    """Test my-schedule endpoint from Phase 7"""
    
    @pytest.fixture
    def admin_token(self):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return login.json()["access_token"]
    
    def test_my_schedule_returns_rsvpd_operations(self, admin_token):
        """GET /api/my-schedule returns operations user RSVP'd to"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/my-schedule", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ My schedule returns {len(data)} RSVP'd operations")


class TestAnnouncementsEndpoint:
    """Test announcements"""
    
    def test_announcements_list(self):
        """GET /api/announcements returns list"""
        response = requests.get(f"{BASE_URL}/api/announcements")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Announcements list works - {len(data)} announcements")


class TestTrainingEndpoint:
    """Test training programs"""
    
    def test_training_list(self):
        """GET /api/training returns list"""
        response = requests.get(f"{BASE_URL}/api/training")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Training list works - {len(data)} programs")


class TestGalleryEndpoint:
    """Test gallery"""
    
    def test_gallery_list(self):
        """GET /api/gallery returns list"""
        response = requests.get(f"{BASE_URL}/api/gallery")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Gallery list works - {len(data)} images")


class TestRosterEndpoints:
    """Test unit roster"""
    
    @pytest.fixture
    def member_token(self):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MEMBER_EMAIL, "password": MEMBER_PASSWORD
        })
        return login.json()["access_token"]
    
    def test_roster_list(self, member_token):
        """GET /api/roster returns member list"""
        headers = {"Authorization": f"Bearer {member_token}"}
        response = requests.get(f"{BASE_URL}/api/roster", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Roster list works - {len(data)} members")
    
    def test_member_profile(self, member_token):
        """GET /api/roster/:id returns member profile with Discord fields"""
        headers = {"Authorization": f"Bearer {member_token}"}
        roster = requests.get(f"{BASE_URL}/api/roster", headers=headers).json()
        if roster:
            user_id = roster[0]["id"]
            response = requests.get(f"{BASE_URL}/api/roster/{user_id}",
                headers=headers)
            assert response.status_code == 200
            data = response.json()
            assert "discord_linked" in data
            print(f"✓ Member profile works - {data['username']}")
        else:
            pytest.skip("No members in roster")


class TestAdminEndpoints:
    """Test admin-only endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return login.json()["access_token"]
    
    def test_admin_users_list(self, admin_token):
        """GET /api/admin/users returns all users"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Admin users list works - {len(data)} users")
    
    def test_admin_site_content(self, admin_token):
        """GET /api/admin/site-content returns CMS content"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/site-content",
            headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "hero" in data
        assert "about" in data
        print("✓ Admin site content works")


class TestPublicEndpoints:
    """Test public endpoints (no auth required)"""
    
    def test_public_site_content(self):
        """GET /api/site-content returns CMS content publicly"""
        response = requests.get(f"{BASE_URL}/api/site-content")
        assert response.status_code == 200
        # May return None if no content set, which is valid
        print("✓ Public site content endpoint works")


class TestSetPasswordEndpoint:
    """Test set-password endpoint from Phase 7"""
    
    @pytest.fixture
    def admin_token(self):
        login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        return login.json()["access_token"]
    
    def test_set_password_rejects_users_with_real_email(self, admin_token):
        """POST /api/auth/set-password rejects users with real emails"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/auth/set-password",
            json={"email": "newemail@test.com", "password": "newpass123"},
            headers=headers)
        assert response.status_code == 400
        assert "already have an email" in response.json()["detail"]
        print("✓ Set-password correctly rejects users with real email")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
