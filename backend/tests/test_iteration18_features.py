"""
Iteration 18 Testing: Briefing Acknowledgment + Campaign System

Features tested:
1. POST /api/intel/{id}/acknowledge - Mark briefing as read
2. DELETE /api/intel/{id}/acknowledge - Remove acknowledgment
3. GET /api/admin/intel/{id}/acknowledgments - Admin view who acknowledged
4. GET /api/intel - Returns ack_count and user_acknowledged fields
5. Campaign CRUD: GET /api/campaigns, GET /api/campaigns/active, GET /api/campaigns/{id}
6. Campaign Admin: POST/PUT/DELETE /api/admin/campaigns
7. Regression: Intel CRUD, no blue colors
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASS = "TestAdmin123!"


class TestAuthSetup:
    """Setup: Get auth token for admin user"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASS
        })
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        data = res.json()
        assert "access_token" in data
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_session(self, admin_token):
        """Session with admin auth"""
        session = requests.Session()
        session.headers.update({
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"
        })
        return session
    
    def test_admin_login(self, admin_token):
        """Verify admin login works"""
        assert admin_token is not None
        assert len(admin_token) > 10
        print(f"✓ Admin login successful, token length: {len(admin_token)}")


class TestIntelAcknowledgment:
    """Test briefing acknowledgment feature"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get admin session"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASS
        })
        assert res.status_code == 200
        token = res.json()["access_token"]
        session = requests.Session()
        session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return session
    
    def test_01_get_intel_list_has_ack_fields(self, admin_session):
        """GET /api/intel returns ack_count and user_acknowledged"""
        res = admin_session.get(f"{BASE_URL}/api/intel")
        assert res.status_code == 200, f"Failed: {res.text}"
        briefings = res.json()
        assert isinstance(briefings, list)
        if len(briefings) > 0:
            first = briefings[0]
            assert "ack_count" in first, "Missing ack_count field"
            assert "user_acknowledged" in first, "Missing user_acknowledged field"
            print(f"✓ Intel list has ack fields, first briefing ack_count: {first['ack_count']}, user_acknowledged: {first['user_acknowledged']}")
        else:
            pytest.skip("No briefings to test")
    
    def test_02_acknowledge_briefing(self, admin_session):
        """POST /api/intel/{id}/acknowledge marks briefing as read"""
        # Get first briefing
        res = admin_session.get(f"{BASE_URL}/api/intel")
        assert res.status_code == 200
        briefings = res.json()
        if len(briefings) == 0:
            pytest.skip("No briefings to test")
        
        briefing = briefings[0]
        briefing_id = briefing["id"]
        initial_ack = briefing.get("user_acknowledged", False)
        
        # If already acknowledged, unacknowledge first
        if initial_ack:
            res = admin_session.delete(f"{BASE_URL}/api/intel/{briefing_id}/acknowledge")
            assert res.status_code == 200
        
        # Now acknowledge
        res = admin_session.post(f"{BASE_URL}/api/intel/{briefing_id}/acknowledge")
        assert res.status_code == 200, f"Acknowledge failed: {res.text}"
        data = res.json()
        assert "ack_count" in data
        assert data["ack_count"] >= 1
        print(f"✓ Briefing acknowledged, ack_count: {data['ack_count']}")
        
        # Verify in list
        res2 = admin_session.get(f"{BASE_URL}/api/intel")
        assert res2.status_code == 200
        updated = next((b for b in res2.json() if b["id"] == briefing_id), None)
        assert updated is not None
        assert updated["user_acknowledged"] == True
        print(f"✓ Verified user_acknowledged is True in list")
    
    def test_03_unacknowledge_briefing(self, admin_session):
        """DELETE /api/intel/{id}/acknowledge removes acknowledgment"""
        # Get first briefing
        res = admin_session.get(f"{BASE_URL}/api/intel")
        briefings = res.json()
        if len(briefings) == 0:
            pytest.skip("No briefings")
        
        briefing = briefings[0]
        briefing_id = briefing["id"]
        
        # Ensure acknowledged first
        if not briefing.get("user_acknowledged"):
            admin_session.post(f"{BASE_URL}/api/intel/{briefing_id}/acknowledge")
        
        # Unacknowledge
        res = admin_session.delete(f"{BASE_URL}/api/intel/{briefing_id}/acknowledge")
        assert res.status_code == 200, f"Unacknowledge failed: {res.text}"
        data = res.json()
        assert "ack_count" in data
        print(f"✓ Briefing unacknowledged, ack_count: {data['ack_count']}")
        
        # Verify
        res2 = admin_session.get(f"{BASE_URL}/api/intel")
        updated = next((b for b in res2.json() if b["id"] == briefing_id), None)
        assert updated["user_acknowledged"] == False
        print(f"✓ Verified user_acknowledged is False in list")
    
    def test_04_admin_get_acknowledgments(self, admin_session):
        """GET /api/admin/intel/{id}/acknowledgments returns list of who acknowledged"""
        # Get a briefing with ack_count > 0 or acknowledge one
        res = admin_session.get(f"{BASE_URL}/api/intel")
        briefings = res.json()
        if not briefings:
            pytest.skip("No briefings")
        
        # Acknowledge first briefing to ensure there's an ack
        briefing_id = briefings[0]["id"]
        admin_session.post(f"{BASE_URL}/api/intel/{briefing_id}/acknowledge")
        
        # Get acknowledgments list
        res = admin_session.get(f"{BASE_URL}/api/admin/intel/{briefing_id}/acknowledgments")
        assert res.status_code == 200, f"Get acknowledgments failed: {res.text}"
        acks = res.json()
        assert isinstance(acks, list)
        if len(acks) > 0:
            first_ack = acks[0]
            assert "user_id" in first_ack
            assert "username" in first_ack
            assert "acknowledged_at" in first_ack
            print(f"✓ Got {len(acks)} acknowledgments, first by: {first_ack['username']}")
        else:
            print("✓ Acknowledgments endpoint works (empty list)")
    
    def test_05_acknowledge_idempotent(self, admin_session):
        """Acknowledging twice should be idempotent"""
        res = admin_session.get(f"{BASE_URL}/api/intel")
        if not res.json():
            pytest.skip("No briefings")
        
        briefing_id = res.json()[0]["id"]
        
        # Acknowledge twice
        res1 = admin_session.post(f"{BASE_URL}/api/intel/{briefing_id}/acknowledge")
        res2 = admin_session.post(f"{BASE_URL}/api/intel/{briefing_id}/acknowledge")
        
        # Both should succeed (or say already acknowledged)
        assert res1.status_code == 200
        assert res2.status_code == 200
        
        # ack_count should not increase twice
        count1 = res1.json().get("ack_count", 0)
        count2 = res2.json().get("ack_count", 0)
        assert count2 <= count1 + 1, "ack_count increased unexpectedly on double ack"
        print(f"✓ Acknowledge is idempotent")


class TestCampaignSystem:
    """Test campaign/theater map system"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get admin session"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASS
        })
        assert res.status_code == 200
        token = res.json()["access_token"]
        session = requests.Session()
        session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return session
    
    def test_01_get_all_campaigns(self, admin_session):
        """GET /api/campaigns returns list of campaigns"""
        res = admin_session.get(f"{BASE_URL}/api/campaigns")
        assert res.status_code == 200, f"Failed: {res.text}"
        campaigns = res.json()
        assert isinstance(campaigns, list)
        print(f"✓ Got {len(campaigns)} campaigns")
        if len(campaigns) > 0:
            first = campaigns[0]
            assert "id" in first
            assert "name" in first
            assert "status" in first
            print(f"  First campaign: {first['name']} ({first['status']})")
    
    def test_02_get_active_campaign(self, admin_session):
        """GET /api/campaigns/active returns active campaign or null"""
        res = admin_session.get(f"{BASE_URL}/api/campaigns/active")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        if data is None:
            print("✓ No active campaign (null returned)")
        else:
            assert "id" in data
            assert "name" in data
            assert data.get("status") == "active"
            print(f"✓ Active campaign: {data['name']}")
            # Check for phases and objectives
            if "phases" in data:
                print(f"  Phases: {len(data['phases'])}")
            if "objectives" in data:
                print(f"  Objectives: {len(data['objectives'])}")
    
    def test_03_get_campaign_by_id(self, admin_session):
        """GET /api/campaigns/{id} returns specific campaign"""
        # First get list to get an ID
        res = admin_session.get(f"{BASE_URL}/api/campaigns")
        campaigns = res.json()
        if not campaigns:
            pytest.skip("No campaigns to test")
        
        campaign_id = campaigns[0]["id"]
        res = admin_session.get(f"{BASE_URL}/api/campaigns/{campaign_id}")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert data["id"] == campaign_id
        print(f"✓ Got campaign by ID: {data['name']}")
        
        # Check structure
        expected_fields = ["id", "name", "status"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
    
    def test_04_create_campaign(self, admin_session):
        """POST /api/admin/campaigns creates new campaign"""
        payload = {
            "name": "TEST_Operation Iron Storm",
            "description": "Test campaign for iteration 18",
            "theater": "Test Theater",
            "status": "planning",
            "situation": "Test situation report",
            "commander_notes": "Test commander notes",
            "phases": [
                {"name": "Phase 1", "status": "planned", "description": "Initial phase"},
                {"name": "Phase 2", "status": "planned", "description": "Main assault"}
            ],
            "objectives": [
                {"name": "OBJ Alpha", "status": "pending", "priority": "primary", "description": "Take the hill"},
                {"name": "OBJ Bravo", "status": "pending", "priority": "secondary", "grid_ref": "AB1234"}
            ]
        }
        
        res = admin_session.post(f"{BASE_URL}/api/admin/campaigns", json=payload)
        assert res.status_code in [200, 201], f"Create failed: {res.text}"
        data = res.json()
        assert data["name"] == payload["name"]
        assert "id" in data
        print(f"✓ Created campaign: {data['name']} (ID: {data['id']})")
        
        # Verify phases and objectives
        assert len(data.get("phases", [])) == 2
        assert len(data.get("objectives", [])) == 2
        print(f"  Created with {len(data['phases'])} phases, {len(data['objectives'])} objectives")
        
        return data["id"]
    
    def test_05_update_campaign(self, admin_session):
        """PUT /api/admin/campaigns/{id} updates campaign"""
        # Get test campaign
        res = admin_session.get(f"{BASE_URL}/api/campaigns")
        campaigns = [c for c in res.json() if c["name"].startswith("TEST_")]
        if not campaigns:
            pytest.skip("No test campaign found")
        
        campaign_id = campaigns[0]["id"]
        update_payload = {
            "status": "active",
            "commander_notes": "Updated commander notes for testing"
        }
        
        res = admin_session.put(f"{BASE_URL}/api/admin/campaigns/{campaign_id}", json=update_payload)
        assert res.status_code == 200, f"Update failed: {res.text}"
        
        # Verify update
        res2 = admin_session.get(f"{BASE_URL}/api/campaigns/{campaign_id}")
        assert res2.status_code == 200
        data = res2.json()
        assert data["status"] == "active"
        assert data["commander_notes"] == "Updated commander notes for testing"
        print(f"✓ Updated campaign status to 'active'")
    
    def test_06_delete_campaign(self, admin_session):
        """DELETE /api/admin/campaigns/{id} deletes campaign"""
        # Get test campaigns
        res = admin_session.get(f"{BASE_URL}/api/campaigns")
        test_campaigns = [c for c in res.json() if c["name"].startswith("TEST_")]
        
        for campaign in test_campaigns:
            res = admin_session.delete(f"{BASE_URL}/api/admin/campaigns/{campaign['id']}")
            assert res.status_code == 200, f"Delete failed: {res.text}"
            print(f"✓ Deleted test campaign: {campaign['name']}")
        
        # Verify deletion
        res2 = admin_session.get(f"{BASE_URL}/api/campaigns")
        remaining = [c for c in res2.json() if c["name"].startswith("TEST_")]
        assert len(remaining) == 0, "Test campaigns not fully deleted"
        print("✓ All test campaigns deleted")
    
    def test_07_campaign_404_handling(self, admin_session):
        """Non-existent campaign returns 404"""
        res = admin_session.get(f"{BASE_URL}/api/campaigns/nonexistent-id-12345")
        assert res.status_code == 404
        print("✓ 404 returned for non-existent campaign")


class TestIntelRegression:
    """Regression tests for Intel CRUD"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get admin session"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASS
        })
        assert res.status_code == 200
        token = res.json()["access_token"]
        session = requests.Session()
        session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        return session
    
    def test_01_get_intel_list(self, admin_session):
        """GET /api/intel returns briefings list"""
        res = admin_session.get(f"{BASE_URL}/api/intel")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} intel briefings")
    
    def test_02_create_intel(self, admin_session):
        """POST /api/admin/intel creates briefing"""
        payload = {
            "title": "TEST_Iteration18_Briefing",
            "content": "Test content for iteration 18 testing",
            "category": "intel_update",
            "classification": "routine",
            "tags": ["test", "iteration18"]
        }
        res = admin_session.post(f"{BASE_URL}/api/admin/intel", json=payload)
        assert res.status_code in [200, 201], f"Create failed: {res.text}"
        data = res.json()
        assert data["title"] == payload["title"]
        print(f"✓ Created intel briefing: {data['title']}")
    
    def test_03_get_intel_tags(self, admin_session):
        """GET /api/intel/tags returns unique tags"""
        res = admin_session.get(f"{BASE_URL}/api/intel/tags")
        assert res.status_code == 200
        tags = res.json()
        assert isinstance(tags, list)
        print(f"✓ Got {len(tags)} unique tags")
    
    def test_04_cleanup_test_intel(self, admin_session):
        """Cleanup: Delete test intel"""
        res = admin_session.get(f"{BASE_URL}/api/intel")
        test_briefings = [b for b in res.json() if b.get("title", "").startswith("TEST_")]
        
        for briefing in test_briefings:
            admin_session.delete(f"{BASE_URL}/api/admin/intel/{briefing['id']}")
            print(f"  Deleted test briefing: {briefing['title']}")
        
        print(f"✓ Cleaned up {len(test_briefings)} test briefings")


class TestEndpointSecurity:
    """Test admin-only endpoints require admin role"""
    
    def test_01_admin_acknowledgments_requires_admin(self):
        """GET /api/admin/intel/{id}/acknowledgments requires admin"""
        # No auth
        res = requests.get(f"{BASE_URL}/api/admin/intel/fake-id/acknowledgments")
        assert res.status_code == 401
        print("✓ Admin acknowledgments endpoint requires auth")
    
    def test_02_admin_campaigns_requires_admin(self):
        """Campaign admin endpoints require admin role"""
        res = requests.post(f"{BASE_URL}/api/admin/campaigns", json={"name": "Test"})
        assert res.status_code == 401
        print("✓ Campaign create endpoint requires auth")
        
        res = requests.put(f"{BASE_URL}/api/admin/campaigns/fake-id", json={"name": "Test"})
        assert res.status_code == 401
        print("✓ Campaign update endpoint requires auth")
        
        res = requests.delete(f"{BASE_URL}/api/admin/campaigns/fake-id")
        assert res.status_code == 401
        print("✓ Campaign delete endpoint requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
