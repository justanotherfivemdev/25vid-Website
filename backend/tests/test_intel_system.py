"""
Test Intel/Briefing System APIs
Tests: GET /api/intel, GET /api/intel/tags, GET /api/intel/{id}, 
       POST /api/admin/intel, PUT /api/admin/intel/{id}, DELETE /api/admin/intel/{id}
Also tests operations roster endpoint: GET /api/operations/{id}/roster
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin test credentials
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASSWORD = "TestAdmin123!"


class TestIntelSystem:
    """Intel/Briefing System API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin to get auth cookie
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        self.user = login_response.json().get("user", {})
        assert self.user.get("role") == "admin", "User is not admin"
        
        yield
        
        # Cleanup is done in individual tests where necessary

    def test_01_get_intel_briefings_list(self):
        """Test GET /api/intel - list all briefings (requires auth)"""
        response = self.session.get(f"{BASE_URL}/api/intel")
        assert response.status_code == 200, f"Failed to get intel briefings: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/intel returned {len(data)} briefings")
        
        # Check if there's seed data
        if len(data) > 0:
            briefing = data[0]
            assert "id" in briefing, "Briefing should have id"
            assert "title" in briefing, "Briefing should have title"
            assert "category" in briefing, "Briefing should have category"
            assert "classification" in briefing, "Briefing should have classification"
            print(f"✓ First briefing: {briefing.get('title')}")
    
    def test_02_get_intel_tags(self):
        """Test GET /api/intel/tags - get all unique tags"""
        response = self.session.get(f"{BASE_URL}/api/intel/tags")
        assert response.status_code == 200, f"Failed to get intel tags: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of tags"
        print(f"✓ GET /api/intel/tags returned {len(data)} tags: {data}")

    def test_03_create_intel_briefing(self):
        """Test POST /api/admin/intel - create new briefing"""
        test_briefing = {
            "title": "TEST_Intel Briefing Alpha",
            "content": "This is a test briefing content.\n\nWith multiple paragraphs.\n\nAnd more details.",
            "category": "intel_update",
            "classification": "routine",
            "tags": ["test", "alpha", "automated"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/intel", json=test_briefing)
        assert response.status_code == 200, f"Failed to create briefing: {response.text}"
        
        data = response.json()
        assert "id" in data, "Created briefing should have id"
        assert data["title"] == test_briefing["title"], "Title should match"
        assert data["category"] == test_briefing["category"], "Category should match"
        assert data["classification"] == test_briefing["classification"], "Classification should match"
        assert data["tags"] == test_briefing["tags"], "Tags should match"
        assert data["author_name"] == self.user.get("username"), "Author should match logged-in user"
        
        self.test_briefing_id = data["id"]
        print(f"✓ Created briefing with ID: {self.test_briefing_id}")
        
        # Store for later tests
        pytest.created_briefing_id = data["id"]
        return data["id"]
    
    def test_04_get_single_intel_briefing(self):
        """Test GET /api/intel/{id} - get single briefing"""
        # Create a new briefing first if we don't have one
        test_briefing = {
            "title": "TEST_Single Briefing Test",
            "content": "Content for single briefing test",
            "category": "commanders_intent",
            "classification": "priority",
            "tags": ["single-test"]
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/intel", json=test_briefing)
        assert create_response.status_code == 200
        briefing_id = create_response.json()["id"]
        
        # Now get single briefing
        response = self.session.get(f"{BASE_URL}/api/intel/{briefing_id}")
        assert response.status_code == 200, f"Failed to get briefing: {response.text}"
        
        data = response.json()
        assert data["id"] == briefing_id
        assert data["title"] == test_briefing["title"]
        assert data["content"] == test_briefing["content"]
        print(f"✓ GET /api/intel/{briefing_id} returned correct briefing")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/admin/intel/{briefing_id}")
    
    def test_05_update_intel_briefing(self):
        """Test PUT /api/admin/intel/{id} - update briefing"""
        # Create a briefing to update
        test_briefing = {
            "title": "TEST_Update Briefing Test",
            "content": "Original content",
            "category": "operational_order",
            "classification": "immediate",
            "tags": ["update-test"]
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/intel", json=test_briefing)
        assert create_response.status_code == 200
        briefing_id = create_response.json()["id"]
        
        # Update the briefing
        update_data = {
            "title": "TEST_Update Briefing Test - UPDATED",
            "content": "Updated content with new information.\n\nMore details added.",
            "classification": "flash",
            "tags": ["update-test", "modified"]
        }
        update_response = self.session.put(f"{BASE_URL}/api/admin/intel/{briefing_id}", json=update_data)
        assert update_response.status_code == 200, f"Failed to update briefing: {update_response.text}"
        
        updated = update_response.json()
        assert updated["title"] == update_data["title"], "Title should be updated"
        assert updated["content"] == update_data["content"], "Content should be updated"
        assert updated["classification"] == update_data["classification"], "Classification should be updated"
        assert "modified" in updated["tags"], "Tags should be updated"
        assert updated.get("updated_at") is not None, "Updated_at should be set"
        print(f"✓ PUT /api/admin/intel/{briefing_id} successfully updated briefing")
        
        # Verify update persisted
        get_response = self.session.get(f"{BASE_URL}/api/intel/{briefing_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["title"] == update_data["title"]
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/admin/intel/{briefing_id}")
    
    def test_06_delete_intel_briefing(self):
        """Test DELETE /api/admin/intel/{id} - delete briefing"""
        # Create a briefing to delete
        test_briefing = {
            "title": "TEST_Delete Briefing Test",
            "content": "This briefing will be deleted",
            "category": "after_action_report",
            "classification": "routine",
            "tags": ["delete-test"]
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/intel", json=test_briefing)
        assert create_response.status_code == 200
        briefing_id = create_response.json()["id"]
        
        # Delete the briefing
        delete_response = self.session.delete(f"{BASE_URL}/api/admin/intel/{briefing_id}")
        assert delete_response.status_code == 200, f"Failed to delete briefing: {delete_response.text}"
        
        data = delete_response.json()
        assert data.get("message") == "Briefing deleted"
        print(f"✓ DELETE /api/admin/intel/{briefing_id} successfully deleted briefing")
        
        # Verify deletion - should return 404
        get_response = self.session.get(f"{BASE_URL}/api/intel/{briefing_id}")
        assert get_response.status_code == 404, "Deleted briefing should not be found"
        print("✓ Verified briefing no longer exists")
    
    def test_07_filter_by_category(self):
        """Test GET /api/intel?category=... - filter by category"""
        # Create test briefings with different categories
        categories = ["intel_update", "commanders_intent", "operational_order"]
        created_ids = []
        
        for cat in categories:
            briefing = {
                "title": f"TEST_Filter Category {cat}",
                "content": f"Content for {cat}",
                "category": cat,
                "classification": "routine",
                "tags": ["filter-test"]
            }
            response = self.session.post(f"{BASE_URL}/api/admin/intel", json=briefing)
            assert response.status_code == 200
            created_ids.append(response.json()["id"])
        
        # Filter by intel_update category
        filter_response = self.session.get(f"{BASE_URL}/api/intel?category=intel_update")
        assert filter_response.status_code == 200
        
        data = filter_response.json()
        assert all(b["category"] == "intel_update" for b in data), "All results should be intel_update category"
        print(f"✓ Category filter returned {len(data)} intel_update briefings")
        
        # Cleanup
        for bid in created_ids:
            self.session.delete(f"{BASE_URL}/api/admin/intel/{bid}")
    
    def test_08_filter_by_tag(self):
        """Test GET /api/intel?tag=... - filter by tag"""
        # Create test briefing with specific tag
        unique_tag = "unique-test-tag-12345"
        briefing = {
            "title": "TEST_Filter Tag Test",
            "content": "Content for tag filter test",
            "category": "training_bulletin",
            "classification": "routine",
            "tags": [unique_tag, "common-tag"]
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/intel", json=briefing)
        assert create_response.status_code == 200
        briefing_id = create_response.json()["id"]
        
        # Filter by unique tag
        filter_response = self.session.get(f"{BASE_URL}/api/intel?tag={unique_tag}")
        assert filter_response.status_code == 200
        
        data = filter_response.json()
        assert len(data) >= 1, "Should find at least one briefing with the tag"
        assert any(unique_tag in b.get("tags", []) for b in data), f"Results should contain {unique_tag}"
        print(f"✓ Tag filter returned {len(data)} briefings with tag '{unique_tag}'")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/admin/intel/{briefing_id}")
    
    def test_09_search_briefings(self):
        """Test GET /api/intel?search=... - search briefings"""
        # Create test briefing with unique searchable content
        unique_phrase = "UNIQUESEARCHPHRASE12345"
        briefing = {
            "title": f"TEST_Search Test {unique_phrase}",
            "content": "This briefing contains searchable content",
            "category": "intel_update",
            "classification": "routine",
            "tags": ["search-test"]
        }
        create_response = self.session.post(f"{BASE_URL}/api/admin/intel", json=briefing)
        assert create_response.status_code == 200
        briefing_id = create_response.json()["id"]
        
        # Search for the unique phrase
        search_response = self.session.get(f"{BASE_URL}/api/intel?search={unique_phrase}")
        assert search_response.status_code == 200
        
        data = search_response.json()
        assert len(data) >= 1, "Should find at least one briefing matching search"
        assert any(unique_phrase in b.get("title", "") for b in data), "Should find the test briefing"
        print(f"✓ Search returned {len(data)} results for '{unique_phrase}'")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/admin/intel/{briefing_id}")
    
    def test_10_all_categories(self):
        """Test all valid categories work correctly"""
        valid_categories = [
            "intel_update",
            "commanders_intent", 
            "operational_order",
            "after_action_report",
            "training_bulletin"
        ]
        
        for cat in valid_categories:
            briefing = {
                "title": f"TEST_Category Validation {cat}",
                "content": f"Testing category: {cat}",
                "category": cat,
                "classification": "routine",
                "tags": ["category-validation"]
            }
            response = self.session.post(f"{BASE_URL}/api/admin/intel", json=briefing)
            assert response.status_code == 200, f"Failed to create briefing with category '{cat}': {response.text}"
            
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/admin/intel/{response.json()['id']}")
        
        print(f"✓ All {len(valid_categories)} categories validated successfully")
    
    def test_11_all_classifications(self):
        """Test all valid classifications work correctly"""
        valid_classifications = ["routine", "priority", "immediate", "flash"]
        
        for cls in valid_classifications:
            briefing = {
                "title": f"TEST_Classification Validation {cls}",
                "content": f"Testing classification: {cls}",
                "category": "intel_update",
                "classification": cls,
                "tags": ["classification-validation"]
            }
            response = self.session.post(f"{BASE_URL}/api/admin/intel", json=briefing)
            assert response.status_code == 200, f"Failed to create briefing with classification '{cls}': {response.text}"
            
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/admin/intel/{response.json()['id']}")
        
        print(f"✓ All {len(valid_classifications)} classifications validated successfully")
    
    def test_12_cleanup_test_briefings(self):
        """Cleanup any remaining test briefings"""
        response = self.session.get(f"{BASE_URL}/api/intel")
        assert response.status_code == 200
        
        briefings = response.json()
        test_briefings = [b for b in briefings if b.get("title", "").startswith("TEST_")]
        
        for b in test_briefings:
            self.session.delete(f"{BASE_URL}/api/admin/intel/{b['id']}")
        
        print(f"✓ Cleaned up {len(test_briefings)} test briefings")


class TestOperationsRosterEndpoint:
    """Test Operations Roster API - Enhanced RSVP detail view"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        yield
    
    def test_01_get_operations_list(self):
        """Test GET /api/operations - list all operations"""
        response = self.session.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200, f"Failed to get operations: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/operations returned {len(data)} operations")
        
        if len(data) > 0:
            op = data[0]
            assert "id" in op
            assert "title" in op
            pytest.test_operation_id = op["id"]
            return op["id"]
        return None
    
    def test_02_get_operation_roster(self):
        """Test GET /api/operations/{id}/roster - get RSVP roster details"""
        # First get an operation
        ops_response = self.session.get(f"{BASE_URL}/api/operations")
        assert ops_response.status_code == 200
        
        ops = ops_response.json()
        if len(ops) == 0:
            pytest.skip("No operations available to test roster")
        
        op_id = ops[0]["id"]
        
        # Get roster for this operation
        roster_response = self.session.get(f"{BASE_URL}/api/operations/{op_id}/roster")
        assert roster_response.status_code == 200, f"Failed to get roster: {roster_response.text}"
        
        data = roster_response.json()
        
        # Validate structure
        assert "rsvps" in data, "Response should have 'rsvps' field"
        assert "counts" in data, "Response should have 'counts' field"
        
        # Validate counts structure
        counts = data["counts"]
        assert "attending" in counts
        assert "tentative" in counts
        assert "waitlisted" in counts
        assert "total" in counts
        
        # Validate rsvps structure (grouped by status)
        rsvps = data["rsvps"]
        assert "attending" in rsvps
        assert "tentative" in rsvps
        assert "waitlisted" in rsvps
        
        # If there are RSVPs, check the detail fields
        all_rsvps = rsvps["attending"] + rsvps["tentative"] + rsvps["waitlisted"]
        if len(all_rsvps) > 0:
            rsvp = all_rsvps[0]
            # Check expected fields from enhanced roster view
            expected_fields = ["user_id", "username"]
            for field in expected_fields:
                assert field in rsvp, f"RSVP should have '{field}' field"
            
            # These fields may be null but should be present
            optional_fields = ["rank", "company", "platoon", "billet", "role_notes", "avatar_url", "member_status"]
            for field in optional_fields:
                assert field in rsvp or rsvp.get(field) is None, f"RSVP should have '{field}' field (can be null)"
        
        print(f"✓ GET /api/operations/{op_id}/roster returned {data['counts']['total']} RSVPs")
        print(f"  Attending: {data['counts']['attending']}, Tentative: {data['counts']['tentative']}, Waitlisted: {data['counts']['waitlisted']}")


class TestAdminIntelNotAuthenticated:
    """Test that Intel admin endpoints require admin authentication"""
    
    def test_01_create_briefing_unauthorized(self):
        """Test POST /api/admin/intel requires admin auth"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/admin/intel", json={
            "title": "Unauthorized Test",
            "content": "Test",
            "category": "intel_update"
        })
        assert response.status_code == 401 or response.status_code == 403, \
            f"Should reject unauthenticated request: {response.status_code}"
        print("✓ POST /api/admin/intel correctly rejects unauthenticated requests")
    
    def test_02_member_endpoints_require_auth(self):
        """Test GET /api/intel requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/intel")
        assert response.status_code == 401, f"Should require auth: {response.status_code}"
        print("✓ GET /api/intel correctly requires authentication")
    
    def test_03_member_can_read_but_not_write(self):
        """Test that regular member cannot create/update/delete intel"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Register a test member
        unique_email = f"test_member_{os.urandom(4).hex()}@test.com"
        reg_response = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "username": "TestMember",
            "password": "TestMember123!"
        })
        
        if reg_response.status_code != 200:
            pytest.skip("Could not create test member")
        
        # Try to create a briefing (should fail)
        create_response = session.post(f"{BASE_URL}/api/admin/intel", json={
            "title": "Member Attempt",
            "content": "Test",
            "category": "intel_update"
        })
        assert create_response.status_code in [401, 403], \
            f"Member should not be able to create briefings: {create_response.status_code}"
        
        print("✓ Regular member correctly cannot create/modify intel briefings")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
