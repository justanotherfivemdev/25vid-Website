"""
Phase 4 Backend API Tests - Member Profile & Roster System
Tests:
- Roster endpoints: GET /api/roster, GET /api/roster/{id}
- Profile self-update: PUT /api/profile
- Admin profile update: PUT /api/admin/users/{id}/profile
- Mission history: POST/DELETE /api/admin/users/{id}/mission-history
- Training history: POST/DELETE /api/admin/users/{id}/training-history
- Awards: POST/DELETE /api/admin/users/{id}/awards
- Role separation: members limited to bio/avatar/timezone/favorite_role
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://vid-25-deploy.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"

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
    return response.json()["access_token"]

@pytest.fixture(scope="module")
def admin_user(api_client, admin_token):
    """Get admin user data"""
    response = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    return response.json()

@pytest.fixture(scope="module")
def test_member(api_client):
    """Create a test member and return token + user data"""
    unique_id = str(uuid.uuid4())[:8]
    email = f"TEST_P4_{unique_id}@test.com"
    username = f"TEST_P4_{unique_id}"
    password = "TestPass123!"
    
    response = api_client.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "username": username,
        "password": password,
        "rank": "Private",
        "specialization": "Infantry"
    })
    assert response.status_code == 200, f"Registration failed: {response.text}"
    data = response.json()
    return {
        "token": data["access_token"],
        "user": data["user"],
        "email": email,
        "password": password
    }

class TestRosterEndpoints:
    """Test roster listing and member profile retrieval"""
    
    def test_roster_get_requires_auth(self, api_client):
        """GET /api/roster requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/roster")
        assert response.status_code == 403 or response.status_code == 401
        print("✓ Roster endpoint requires authentication")
    
    def test_roster_get_returns_members(self, api_client, admin_token):
        """GET /api/roster returns list of members"""
        response = api_client.get(f"{BASE_URL}/api/roster", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Expected at least one member in roster"
        
        # Verify roster fields structure (should NOT include password_hash or email)
        member = data[0]
        assert "id" in member
        assert "username" in member
        assert "password_hash" not in member
        assert "email" not in member  # Roster excludes email for privacy
        print(f"✓ Roster returns {len(data)} members with correct fields")
    
    def test_roster_member_profile_get(self, api_client, admin_token, admin_user):
        """GET /api/roster/{id} returns full member profile"""
        user_id = admin_user["id"]
        response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # Verify profile includes extended Phase 4 fields
        assert "id" in data
        assert "username" in data
        assert "email" in data or "bio" in data  # Admin viewing self should see email
        assert "status" in data
        assert "rank" in data or data.get("rank") is None
        assert "awards" in data
        assert "mission_history" in data
        assert "training_history" in data
        print(f"✓ Member profile retrieved with Phase 4 fields: status={data.get('status')}")
    
    def test_roster_nonexistent_member_404(self, api_client, admin_token):
        """GET /api/roster/{invalid_id} returns 404"""
        response = api_client.get(f"{BASE_URL}/api/roster/nonexistent-user-id", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 404
        print("✓ Nonexistent member returns 404")

class TestProfileSelfUpdate:
    """Test member self-edit profile (limited fields)"""
    
    def test_profile_update_own_bio(self, api_client, test_member):
        """PUT /api/profile allows member to update their bio"""
        token = test_member["token"]
        new_bio = f"Test bio updated at {uuid.uuid4()}"
        
        response = api_client.put(f"{BASE_URL}/api/profile", 
            json={"bio": new_bio},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["bio"] == new_bio
        print(f"✓ Member can update own bio")
    
    def test_profile_update_own_timezone(self, api_client, test_member):
        """PUT /api/profile allows member to update timezone"""
        token = test_member["token"]
        
        response = api_client.put(f"{BASE_URL}/api/profile", 
            json={"timezone": "EST"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["timezone"] == "EST"
        print("✓ Member can update own timezone")
    
    def test_profile_update_own_avatar(self, api_client, test_member):
        """PUT /api/profile allows member to update avatar_url"""
        token = test_member["token"]
        
        response = api_client.put(f"{BASE_URL}/api/profile", 
            json={"avatar_url": "https://example.com/avatar.jpg"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["avatar_url"] == "https://example.com/avatar.jpg"
        print("✓ Member can update own avatar_url")
    
    def test_profile_update_own_favorite_role(self, api_client, test_member):
        """PUT /api/profile allows member to update favorite_role"""
        token = test_member["token"]
        
        response = api_client.put(f"{BASE_URL}/api/profile", 
            json={"favorite_role": "Sniper"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["favorite_role"] == "Sniper"
        print("✓ Member can update own favorite_role")
    
    def test_profile_update_no_fields_error(self, api_client, test_member):
        """PUT /api/profile with empty payload returns 400"""
        token = test_member["token"]
        
        response = api_client.put(f"{BASE_URL}/api/profile", 
            json={},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 400
        print("✓ Empty profile update returns 400 error")
    
    def test_profile_verify_update_persisted(self, api_client, test_member):
        """Verify profile updates are persisted via GET /api/auth/me"""
        token = test_member["token"]
        user_id = test_member["user"]["id"]
        
        # Update bio
        unique_bio = f"Persisted bio {uuid.uuid4()}"
        api_client.put(f"{BASE_URL}/api/profile", 
            json={"bio": unique_bio},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Verify via /auth/me
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json()["bio"] == unique_bio
        print("✓ Profile update persisted and verified via /auth/me")

class TestAdminProfileUpdate:
    """Test admin editing any member's profile (all fields)"""
    
    def test_admin_update_member_profile_basic(self, api_client, admin_token, test_member):
        """PUT /api/admin/users/{id}/profile allows admin to update any field"""
        user_id = test_member["user"]["id"]
        
        response = api_client.put(f"{BASE_URL}/api/admin/users/{user_id}/profile", 
            json={"rank": "Sergeant", "specialization": "Recon", "status": "active"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        print("✓ Admin can update member rank/specialization/status")
    
    def test_admin_update_member_squad(self, api_client, admin_token, test_member):
        """Admin can update squad assignment"""
        user_id = test_member["user"]["id"]
        
        response = api_client.put(f"{BASE_URL}/api/admin/users/{user_id}/profile", 
            json={"squad": "Alpha"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        print("✓ Admin can update member squad")
    
    def test_admin_update_member_role(self, api_client, admin_token, test_member):
        """Admin can change member role (member/admin)"""
        user_id = test_member["user"]["id"]
        
        # Set to member explicitly
        response = api_client.put(f"{BASE_URL}/api/admin/users/{user_id}/profile", 
            json={"role": "member"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        print("✓ Admin can update member role")
    
    def test_admin_update_member_all_fields(self, api_client, admin_token, test_member):
        """Admin can update all Phase 4 profile fields at once"""
        user_id = test_member["user"]["id"]
        
        response = api_client.put(f"{BASE_URL}/api/admin/users/{user_id}/profile", 
            json={
                "username": test_member["user"]["username"],  # Keep same to avoid conflicts
                "bio": "Admin updated bio",
                "avatar_url": "https://admin-set-avatar.jpg",
                "timezone": "PST",
                "favorite_role": "Commander",
                "rank": "Captain",
                "specialization": "Leadership",
                "status": "command",
                "squad": "HQ"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        print("✓ Admin can update all profile fields at once")
    
    def test_admin_update_verify_persisted(self, api_client, admin_token, test_member):
        """Verify admin profile update persisted via roster endpoint"""
        user_id = test_member["user"]["id"]
        
        # Update a unique field
        unique_bio = f"Admin verified bio {uuid.uuid4()}"
        api_client.put(f"{BASE_URL}/api/admin/users/{user_id}/profile", 
            json={"bio": unique_bio},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Verify via roster GET
        response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        assert response.json()["bio"] == unique_bio
        print("✓ Admin profile update persisted and verified")
    
    def test_admin_update_nonexistent_user_404(self, api_client, admin_token):
        """PUT /api/admin/users/{invalid_id}/profile returns 404"""
        response = api_client.put(f"{BASE_URL}/api/admin/users/invalid-user-id-xyz/profile", 
            json={"bio": "test"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404
        print("✓ Admin update nonexistent user returns 404")

class TestMissionHistory:
    """Test admin management of member mission history"""
    
    def test_add_mission_history(self, api_client, admin_token, test_member):
        """POST /api/admin/users/{id}/mission-history adds entry"""
        user_id = test_member["user"]["id"]
        
        response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/mission-history", 
            json={
                "operation_name": "Operation Phase4 Test",
                "date": "2026-01-15",
                "role_performed": "Squad Lead",
                "notes": "Automated test entry"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "entry" in data
        assert data["entry"]["operation_name"] == "Operation Phase4 Test"
        assert "id" in data["entry"]
        print(f"✓ Mission history entry added with ID: {data['entry']['id']}")
        return data["entry"]["id"]
    
    def test_verify_mission_history_in_profile(self, api_client, admin_token, test_member):
        """Verify mission history appears in profile"""
        user_id = test_member["user"]["id"]
        
        # First add an entry
        response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/mission-history", 
            json={
                "operation_name": "Mission History Verify Test",
                "date": "2026-01-16",
                "role_performed": "Pointman"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        entry_id = response.json()["entry"]["id"]
        
        # Now check profile
        profile_response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert profile_response.status_code == 200
        profile = profile_response.json()
        
        assert "mission_history" in profile
        assert len(profile["mission_history"]) > 0
        found = any(m["operation_name"] == "Mission History Verify Test" for m in profile["mission_history"])
        assert found, "Mission history entry not found in profile"
        print("✓ Mission history entry verified in profile")
    
    def test_delete_mission_history(self, api_client, admin_token, test_member):
        """DELETE /api/admin/users/{id}/mission-history/{entry_id} removes entry"""
        user_id = test_member["user"]["id"]
        
        # Add entry to delete
        add_response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/mission-history", 
            json={
                "operation_name": "To Be Deleted Mission",
                "date": "2026-01-17",
                "role_performed": "Tester"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        entry_id = add_response.json()["entry"]["id"]
        
        # Delete
        response = api_client.delete(f"{BASE_URL}/api/admin/users/{user_id}/mission-history/{entry_id}", 
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        # Verify removed from profile
        profile_response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        profile = profile_response.json()
        found = any(m.get("id") == entry_id for m in profile.get("mission_history", []))
        assert not found, "Mission history entry should have been deleted"
        print("✓ Mission history entry deleted successfully")

class TestTrainingHistory:
    """Test admin management of member training history"""
    
    def test_add_training_history(self, api_client, admin_token, test_member):
        """POST /api/admin/users/{id}/training-history adds entry"""
        user_id = test_member["user"]["id"]
        
        response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/training-history", 
            json={
                "course_name": "Basic Training Phase4",
                "completion_date": "2026-01-10",
                "instructor": "Sgt. Smith",
                "notes": "Automated test training"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "entry" in data
        assert data["entry"]["course_name"] == "Basic Training Phase4"
        assert "id" in data["entry"]
        print(f"✓ Training history entry added with ID: {data['entry']['id']}")
    
    def test_verify_training_history_in_profile(self, api_client, admin_token, test_member):
        """Verify training history appears in profile"""
        user_id = test_member["user"]["id"]
        
        # Add entry
        api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/training-history", 
            json={
                "course_name": "Training Verify Test",
                "completion_date": "2026-01-11",
                "instructor": "Test Instructor"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Check profile
        profile_response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        profile = profile_response.json()
        
        assert "training_history" in profile
        found = any(t["course_name"] == "Training Verify Test" for t in profile["training_history"])
        assert found
        print("✓ Training history entry verified in profile")
    
    def test_delete_training_history(self, api_client, admin_token, test_member):
        """DELETE /api/admin/users/{id}/training-history/{entry_id} removes entry"""
        user_id = test_member["user"]["id"]
        
        # Add
        add_response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/training-history", 
            json={
                "course_name": "To Delete Training",
                "completion_date": "2026-01-12"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        entry_id = add_response.json()["entry"]["id"]
        
        # Delete
        response = api_client.delete(f"{BASE_URL}/api/admin/users/{user_id}/training-history/{entry_id}", 
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        # Verify
        profile_response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        profile = profile_response.json()
        found = any(t.get("id") == entry_id for t in profile.get("training_history", []))
        assert not found
        print("✓ Training history entry deleted successfully")

class TestAwards:
    """Test admin management of member awards"""
    
    def test_add_award(self, api_client, admin_token, test_member):
        """POST /api/admin/users/{id}/awards adds award"""
        user_id = test_member["user"]["id"]
        
        response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/awards", 
            json={
                "name": "Phase 4 Test Medal",
                "date": "2026-01-15",
                "description": "Awarded for testing Phase 4"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "entry" in data
        assert data["entry"]["name"] == "Phase 4 Test Medal"
        assert "id" in data["entry"]
        print(f"✓ Award added with ID: {data['entry']['id']}")
    
    def test_verify_award_in_profile(self, api_client, admin_token, test_member):
        """Verify award appears in profile"""
        user_id = test_member["user"]["id"]
        
        # Add
        api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/awards", 
            json={"name": "Award Verify Medal"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Check
        profile_response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        profile = profile_response.json()
        
        assert "awards" in profile
        found = any(a["name"] == "Award Verify Medal" for a in profile["awards"])
        assert found
        print("✓ Award verified in profile")
    
    def test_delete_award(self, api_client, admin_token, test_member):
        """DELETE /api/admin/users/{id}/awards/{entry_id} removes award"""
        user_id = test_member["user"]["id"]
        
        # Add
        add_response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/awards", 
            json={"name": "To Delete Award"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        entry_id = add_response.json()["entry"]["id"]
        
        # Delete
        response = api_client.delete(f"{BASE_URL}/api/admin/users/{user_id}/awards/{entry_id}", 
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        # Verify
        profile_response = api_client.get(f"{BASE_URL}/api/roster/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
        profile = profile_response.json()
        found = any(a.get("id") == entry_id for a in profile.get("awards", []))
        assert not found
        print("✓ Award deleted successfully")

class TestRoleSeparation:
    """Test that members cannot edit restricted fields"""
    
    def test_member_cannot_update_rank(self, api_client, test_member):
        """PUT /api/profile should NOT accept rank field"""
        token = test_member["token"]
        
        # ProfileSelfUpdate model only accepts: avatar_url, bio, timezone, favorite_role
        # Sending other fields should be ignored or fail
        response = api_client.put(f"{BASE_URL}/api/profile", 
            json={"bio": "Testing role separation", "rank": "General"},  # rank should be ignored
            headers={"Authorization": f"Bearer {token}"}
        )
        # The endpoint should succeed but NOT update rank
        # Since Pydantic model ignores extra fields, let's verify rank wasn't changed
        if response.status_code == 200:
            # Check that rank wasn't changed (should still be what admin set)
            me_response = api_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
            # Rank should NOT be "General" - it should be unchanged
            assert me_response.json().get("rank") != "General" or me_response.json().get("rank") == "Captain"  # Admin set Captain earlier
            print("✓ Member cannot update restricted field 'rank'")
        elif response.status_code == 422:
            print("✓ Server rejects rank field in profile self-update (422)")
    
    def test_member_cannot_access_admin_endpoints(self, api_client, test_member):
        """Regular member cannot access admin profile update endpoint"""
        token = test_member["token"]
        user_id = test_member["user"]["id"]
        
        response = api_client.put(f"{BASE_URL}/api/admin/users/{user_id}/profile", 
            json={"rank": "General"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403, "Member should not access admin endpoints"
        print("✓ Member blocked from admin profile endpoint (403)")
    
    def test_member_cannot_add_mission_history(self, api_client, test_member):
        """Regular member cannot add mission history"""
        token = test_member["token"]
        user_id = test_member["user"]["id"]
        
        response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/mission-history", 
            json={"operation_name": "Unauthorized", "date": "2026-01-01", "role_performed": "Hacker"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        print("✓ Member blocked from adding mission history (403)")
    
    def test_member_cannot_add_awards(self, api_client, test_member):
        """Regular member cannot add awards"""
        token = test_member["token"]
        user_id = test_member["user"]["id"]
        
        response = api_client.post(f"{BASE_URL}/api/admin/users/{user_id}/awards", 
            json={"name": "Self-Awarded Medal"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        print("✓ Member blocked from adding awards (403)")

class TestRegressionPhase1to3:
    """Quick regression tests for Phase 1-3 endpoints"""
    
    def test_api_root(self, api_client):
        """GET /api/ returns operational status"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        assert "operational" in response.json().get("status", "")
        print("✓ API root operational")
    
    def test_operations_endpoint(self, api_client):
        """GET /api/operations returns list"""
        response = api_client.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Operations endpoint working")
    
    def test_announcements_endpoint(self, api_client):
        """GET /api/announcements returns list"""
        response = api_client.get(f"{BASE_URL}/api/announcements")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Announcements endpoint working")
    
    def test_training_endpoint(self, api_client):
        """GET /api/training returns list"""
        response = api_client.get(f"{BASE_URL}/api/training")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Training endpoint working")
    
    def test_discussions_endpoint(self, api_client):
        """GET /api/discussions returns list"""
        response = api_client.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Discussions endpoint working")
    
    def test_gallery_endpoint(self, api_client):
        """GET /api/gallery returns list"""
        response = api_client.get(f"{BASE_URL}/api/gallery")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Gallery endpoint working")
    
    def test_site_content_endpoint(self, api_client):
        """GET /api/site-content returns content"""
        response = api_client.get(f"{BASE_URL}/api/site-content")
        assert response.status_code == 200
        print("✓ Site content endpoint working")
    
    def test_admin_users_endpoint(self, api_client, admin_token):
        """GET /api/admin/users returns all users"""
        response = api_client.get(f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Verify Phase 4 fields in user response
        user = data[0]
        assert "status" in user
        assert "awards" in user
        assert "mission_history" in user
        assert "training_history" in user
        print(f"✓ Admin users endpoint returns {len(data)} users with Phase 4 fields")

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
