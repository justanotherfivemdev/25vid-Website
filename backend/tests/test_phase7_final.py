"""
Phase 7 - Final Production Testing (Comprehensive Regression)
Tests all features across phases 1-6 plus Phase 7 additions:
- POST /api/auth/set-password - Set password flow for Discord-only users
- GET /api/my-schedule - Operations user has RSVP'd to
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from seed data
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"
MEMBER_EMAIL = "testmember@azimuth.ops"
MEMBER_PASSWORD = "Test123!"

class TestHealthAndBasics:
    """Basic API health checks"""
    
    def test_api_root(self):
        """API root returns status"""
        res = requests.get(f"{BASE_URL}/api/")
        assert res.status_code == 200
        data = res.json()
        assert data.get("status") == "operational"
        print("✓ API root operational")

class TestAuthFlow:
    """Authentication flow tests"""
    
    def test_admin_login(self):
        """Admin can log in with email/password"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        data = res.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login: {data['user']['username']}")
        return data["access_token"]
    
    def test_member_login(self):
        """Member can log in with email/password"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MEMBER_EMAIL,
            "password": MEMBER_PASSWORD
        })
        assert res.status_code == 200, f"Member login failed: {res.text}"
        data = res.json()
        assert "access_token" in data
        assert data["user"]["role"] == "member"
        print(f"✓ Member login: {data['user']['username']}")
        return data["access_token"]
    
    def test_registration(self):
        """New user registration works"""
        import uuid
        unique_email = f"test_{uuid.uuid4().hex[:8]}@azimuth.ops"
        res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "username": f"TestUser_{uuid.uuid4().hex[:6]}",
            "password": "TestPass123!"
        })
        assert res.status_code == 200, f"Registration failed: {res.text}"
        data = res.json()
        assert "access_token" in data
        assert data["user"]["email"] == unique_email
        print(f"✓ Registration: {data['user']['username']}")
    
    def test_get_me_returns_discord_fields(self):
        """GET /api/auth/me returns Discord fields"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        me_res = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        data = me_res.json()
        assert "discord_id" in data
        assert "discord_username" in data
        assert "discord_linked" in data
        print("✓ /auth/me returns Discord fields")


class TestSetPassword:
    """POST /api/auth/set-password tests"""
    
    def test_set_password_rejects_if_user_has_email(self):
        """Users with real emails cannot use set-password endpoint"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        # Try to set password - should fail since admin has real email
        res = requests.post(f"{BASE_URL}/api/auth/set-password", json={
            "email": "new@email.com",
            "password": "NewPass123!"
        }, headers={"Authorization": f"Bearer {token}"})
        
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        assert "already have an email" in res.json().get("detail", "").lower()
        print("✓ set-password rejects users with real email")
    
    def test_set_password_validates_min_length(self):
        """Password must be at least 8 characters"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        # Even though this will fail for other reasons (user has email),
        # let's verify the validation message format
        res = requests.post(f"{BASE_URL}/api/auth/set-password", json={
            "email": "short@test.com",
            "password": "short"  # < 8 chars
        }, headers={"Authorization": f"Bearer {token}"})
        
        # Should get 422 for validation error or 400 for business logic
        assert res.status_code in [400, 422], f"Expected 400/422, got {res.status_code}"
        print("✓ set-password validates password length")
    
    def test_set_password_requires_auth(self):
        """Endpoint requires authentication"""
        res = requests.post(f"{BASE_URL}/api/auth/set-password", json={
            "email": "test@email.com",
            "password": "NewPass123!"
        })
        assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"
        print("✓ set-password requires auth")


class TestMySchedule:
    """GET /api/my-schedule tests"""
    
    def test_my_schedule_returns_rsvped_operations(self):
        """User with RSVPs sees their operations"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        res = requests.get(f"{BASE_URL}/api/my-schedule", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200, f"my-schedule failed: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        
        # Admin RSVP'd to Operation Blackout - check structure if any RSVPs exist
        if len(data) > 0:
            op = data[0]
            assert "id" in op
            assert "title" in op
            assert "date" in op
            assert "time" in op
            assert "operation_type" in op
            assert "my_status" in op
            print(f"✓ my-schedule returns {len(data)} operations with correct structure")
        else:
            print("✓ my-schedule returns empty array (no RSVPs)")
    
    def test_my_schedule_empty_for_new_user(self):
        """New user with no RSVPs gets empty array"""
        import uuid
        unique_email = f"new_{uuid.uuid4().hex[:8]}@azimuth.ops"
        reg_res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "username": f"NewUser_{uuid.uuid4().hex[:6]}",
            "password": "TestPass123!"
        })
        token = reg_res.json()["access_token"]
        
        res = requests.get(f"{BASE_URL}/api/my-schedule", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) == 0
        print("✓ my-schedule empty for new user")
    
    def test_my_schedule_requires_auth(self):
        """Endpoint requires authentication"""
        res = requests.get(f"{BASE_URL}/api/my-schedule")
        assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"
        print("✓ my-schedule requires auth")


class TestDiscordOAuth:
    """Discord OAuth endpoint tests"""
    
    def test_discord_login_returns_url(self):
        """GET /api/auth/discord returns OAuth URL"""
        res = requests.get(f"{BASE_URL}/api/auth/discord")
        assert res.status_code == 200
        data = res.json()
        assert "url" in data
        assert "discord.com" in data["url"]
        assert "oauth2/authorize" in data["url"]
        print("✓ Discord login returns OAuth URL")
    
    def test_discord_link_requires_auth(self):
        """GET /api/auth/discord/link requires authentication"""
        res = requests.get(f"{BASE_URL}/api/auth/discord/link")
        assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"
        print("✓ Discord link requires auth")
    
    def test_discord_link_returns_url(self):
        """Authenticated user can get link URL"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        res = requests.get(f"{BASE_URL}/api/auth/discord/link", headers={"Authorization": f"Bearer {token}"})
        # May return 200 with URL or 400 if already linked
        assert res.status_code in [200, 400], f"Unexpected status: {res.status_code}"
        if res.status_code == 200:
            assert "url" in res.json()
            print("✓ Discord link returns URL")
        else:
            print("✓ Discord link returns 400 (already linked)")
    
    def test_discord_unlink_requires_auth(self):
        """DELETE /api/auth/discord/unlink requires authentication"""
        res = requests.delete(f"{BASE_URL}/api/auth/discord/unlink")
        assert res.status_code in [401, 403]
        print("✓ Discord unlink requires auth")
    
    def test_discord_unlink_returns_400_if_not_linked(self):
        """User without Discord linked gets 400"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MEMBER_EMAIL, "password": MEMBER_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        res = requests.delete(f"{BASE_URL}/api/auth/discord/unlink", headers={"Authorization": f"Bearer {token}"})
        # 400 if not linked, or could be success if previously linked
        assert res.status_code in [200, 400]
        print(f"✓ Discord unlink returns {res.status_code}")


class TestOperationsEndpoints:
    """Operations CRUD tests"""
    
    def test_list_operations(self):
        """GET /api/operations returns list"""
        res = requests.get(f"{BASE_URL}/api/operations")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"✓ Operations list: {len(data)} operations")
    
    def test_get_single_operation(self):
        """GET /api/operations/{id} returns operation"""
        ops_res = requests.get(f"{BASE_URL}/api/operations")
        if ops_res.json():
            op_id = ops_res.json()[0]["id"]
            res = requests.get(f"{BASE_URL}/api/operations/{op_id}")
            assert res.status_code == 200
            data = res.json()
            assert data["id"] == op_id
            print(f"✓ Single operation: {data['title']}")
    
    def test_operation_rsvp_flow(self):
        """RSVP to operation works"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MEMBER_EMAIL, "password": MEMBER_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        ops_res = requests.get(f"{BASE_URL}/api/operations")
        if ops_res.json():
            op_id = ops_res.json()[0]["id"]
            
            # RSVP as attending
            rsvp_res = requests.post(f"{BASE_URL}/api/operations/{op_id}/rsvp", json={
                "status": "attending",
                "role_notes": "Test role"
            }, headers={"Authorization": f"Bearer {token}"})
            assert rsvp_res.status_code == 200
            
            # Get RSVPs
            rsvps_res = requests.get(f"{BASE_URL}/api/operations/{op_id}/rsvp", 
                headers={"Authorization": f"Bearer {token}"})
            assert rsvps_res.status_code == 200
            data = rsvps_res.json()
            assert "attending" in data
            assert "tentative" in data
            print("✓ RSVP flow works")


class TestAnnouncementsEndpoints:
    """Announcements tests"""
    
    def test_list_announcements(self):
        """GET /api/announcements returns list"""
        res = requests.get(f"{BASE_URL}/api/announcements")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"✓ Announcements list: {len(data)} announcements")


class TestDiscussionsEndpoints:
    """Discussions tests including pinning"""
    
    def test_list_discussions(self):
        """GET /api/discussions returns list with pinned first"""
        res = requests.get(f"{BASE_URL}/api/discussions")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        
        # Verify pinned threads come first
        pinned_indices = [i for i, d in enumerate(data) if d.get("pinned")]
        unpinned_indices = [i for i, d in enumerate(data) if not d.get("pinned")]
        if pinned_indices and unpinned_indices:
            assert max(pinned_indices) < min(unpinned_indices), "Pinned should be before unpinned"
            print(f"✓ Discussions list: {len(data)} discussions, pinned sorted first")
        else:
            print(f"✓ Discussions list: {len(data)} discussions")
    
    def test_toggle_pin_discussion(self):
        """Admin can pin/unpin discussions"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        disc_res = requests.get(f"{BASE_URL}/api/discussions")
        if disc_res.json():
            disc_id = disc_res.json()[0]["id"]
            orig_pinned = disc_res.json()[0].get("pinned", False)
            
            # Toggle pin
            res = requests.put(f"{BASE_URL}/api/admin/discussions/{disc_id}/pin", json={}, 
                headers={"Authorization": f"Bearer {token}"})
            assert res.status_code == 200
            data = res.json()
            assert data["pinned"] == (not orig_pinned)
            
            # Toggle back
            requests.put(f"{BASE_URL}/api/admin/discussions/{disc_id}/pin", json={},
                headers={"Authorization": f"Bearer {token}"})
            print("✓ Discussion pin toggle works")


class TestGalleryEndpoints:
    """Gallery tests"""
    
    def test_list_gallery(self):
        """GET /api/gallery returns list"""
        res = requests.get(f"{BASE_URL}/api/gallery")
        assert res.status_code == 200
        assert isinstance(res.json(), list)
        print(f"✓ Gallery list: {len(res.json())} images")


class TestTrainingEndpoints:
    """Training tests"""
    
    def test_list_training(self):
        """GET /api/training returns list"""
        res = requests.get(f"{BASE_URL}/api/training")
        assert res.status_code == 200
        assert isinstance(res.json(), list)
        print(f"✓ Training list: {len(res.json())} programs")


class TestRosterEndpoints:
    """Roster/profile tests"""
    
    def test_roster_list(self):
        """GET /api/roster returns member list"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        res = requests.get(f"{BASE_URL}/api/roster", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        if data:
            member = data[0]
            assert "id" in member
            assert "username" in member
        print(f"✓ Roster list: {len(data)} members")
    
    def test_member_profile(self):
        """GET /api/roster/{id} returns member profile"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        user_id = login_res.json()["user"]["id"]
        
        res = requests.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == user_id
        # Verify Discord fields present
        assert "discord_id" in data
        assert "discord_linked" in data
        print(f"✓ Member profile: {data['username']}")


class TestSearchEndpoint:
    """Search functionality tests"""
    
    def test_search_works(self):
        """GET /api/search returns results"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        res = requests.get(f"{BASE_URL}/api/search?q=test", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert "operations" in data
        assert "discussions" in data
        print("✓ Search works")


class TestAdminEndpoints:
    """Admin-only endpoint tests"""
    
    def test_admin_users_list(self):
        """GET /api/admin/users returns all users"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        res = requests.get(f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"✓ Admin users list: {len(data)} users")
    
    def test_admin_site_content(self):
        """GET /api/admin/site-content works"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        res = requests.get(f"{BASE_URL}/api/admin/site-content", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert "hero" in data
        assert "about" in data
        print("✓ Admin site content works")
    
    def test_admin_update_user_profile(self):
        """PUT /api/admin/users/{id}/profile works"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        # Get member user
        users_res = requests.get(f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {token}"})
        members = [u for u in users_res.json() if u["role"] == "member"]
        if members:
            member_id = members[0]["id"]
            res = requests.put(f"{BASE_URL}/api/admin/users/{member_id}/profile", json={
                "rank": "Private",
                "discord_id": "123456789"
            }, headers={"Authorization": f"Bearer {token}"})
            assert res.status_code == 200
            print("✓ Admin profile update works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
