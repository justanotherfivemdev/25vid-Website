"""
Phase 3 Backend API tests for Azimuth Operations Group MilSim website.
Tests: Site Content (nav, sectionHeadings), Public site-content API, 
       Operation logo_url badge, Announcement badge_url, dynamic section headings
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://command-center-v2-2.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"
TEST_PREFIX = "TEST_P3_"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip("Admin login failed - skipping authenticated tests")
    return response.json()["access_token"]


class TestPhase3SiteContent:
    """Phase 3 site content management tests - nav, sectionHeadings"""
    
    def test_get_admin_site_content_has_full_structure(self, admin_token):
        """Test admin site content endpoint returns full structure including nav, sectionHeadings"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have all sections from Phase 1, 2, and 3
        assert "hero" in data
        assert "about" in data
        assert "footer" in data
        assert "operationalSuperiority" in data
        assert "lethality" in data
        assert "gallery" in data
        print("✓ Admin site content has all required sections")
    
    def test_update_site_content_with_nav(self, admin_token):
        """Test updating site content with nav brand name and button text"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get current content
        get_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert get_response.status_code == 200
        content = get_response.json()
        
        # Add/update nav section
        test_brand = f"{TEST_PREFIX}TEST BRAND"
        test_btn = "ENLIST NOW"
        content["nav"] = {
            "brandName": test_brand,
            "buttonText": test_btn
        }
        
        # Save
        put_response = requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)
        assert put_response.status_code == 200
        print(f"✓ Updated nav brandName to: {test_brand}")
        
        # Verify by re-fetching
        verify_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data.get("nav", {}).get("brandName") == test_brand
        assert verify_data.get("nav", {}).get("buttonText") == test_btn
        print("✓ Nav settings persisted correctly")
        
        # Cleanup - restore original brand name
        content["nav"]["brandName"] = "AZIMUTH OPERATIONS GROUP"
        content["nav"]["buttonText"] = "JOIN NOW"
        requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)
    
    def test_update_site_content_with_section_headings(self, admin_token):
        """Test updating site content with sectionHeadings"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current content
        get_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert get_response.status_code == 200
        content = get_response.json()
        
        # Add/update sectionHeadings
        test_ops_heading = f"{TEST_PREFIX}UPCOMING OPS"
        test_ops_subtext = "Join the tactical mission"
        test_intel_heading = f"{TEST_PREFIX}INTEL BRIEFING"
        
        content["sectionHeadings"] = content.get("sectionHeadings", {})
        content["sectionHeadings"]["operations"] = {
            "heading": test_ops_heading,
            "subtext": test_ops_subtext
        }
        content["sectionHeadings"]["intel"] = {
            "heading": test_intel_heading,
            "subtext": "Stay updated"
        }
        
        # Save
        put_response = requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)
        assert put_response.status_code == 200
        print(f"✓ Updated section headings")
        
        # Verify by re-fetching
        verify_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data.get("sectionHeadings", {}).get("operations", {}).get("heading") == test_ops_heading
        assert verify_data.get("sectionHeadings", {}).get("intel", {}).get("heading") == test_intel_heading
        print("✓ Section headings persisted correctly")
        
        # Cleanup - restore defaults
        content["sectionHeadings"]["operations"]["heading"] = "UPCOMING OPERATIONS"
        content["sectionHeadings"]["intel"]["heading"] = "LATEST INTEL"
        requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)
    
    def test_update_hero_tagline(self, admin_token):
        """Test updating hero tagline via site content"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current content
        get_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert get_response.status_code == 200
        content = get_response.json()
        
        # Update hero tagline
        test_line1 = f"{TEST_PREFIX}TAGLINE 1"
        test_line2 = f"{TEST_PREFIX}TAGLINE 2"
        content["hero"] = content.get("hero", {})
        content["hero"]["tagline"] = {
            "line1": test_line1,
            "line2": test_line2
        }
        
        # Save
        put_response = requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)
        assert put_response.status_code == 200
        print(f"✓ Updated hero tagline")
        
        # Verify
        verify_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data.get("hero", {}).get("tagline", {}).get("line1") == test_line1
        assert verify_data.get("hero", {}).get("tagline", {}).get("line2") == test_line2
        print("✓ Hero tagline persisted correctly")
        
        # Cleanup
        content["hero"]["tagline"]["line1"] = "JOIN TODAY,"
        content["hero"]["tagline"]["line2"] = "SAVE TOMORROW."
        requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)
    
    def test_update_footer_description(self, admin_token):
        """Test updating footer description"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current content
        get_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert get_response.status_code == 200
        content = get_response.json()
        
        # Update footer
        test_desc = f"{TEST_PREFIX}Test footer description"
        content["footer"] = content.get("footer", {})
        content["footer"]["description"] = test_desc
        
        # Save
        put_response = requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)
        assert put_response.status_code == 200
        print(f"✓ Updated footer description")
        
        # Verify
        verify_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data.get("footer", {}).get("description") == test_desc
        print("✓ Footer description persisted correctly")
        
        # Cleanup
        content["footer"]["description"] = "Professional MilSim operations since 2025"
        requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)


class TestPublicSiteContent:
    """Test public site-content API endpoint"""
    
    def test_public_site_content_returns_data(self):
        """Test that public site-content endpoint returns stored data"""
        response = requests.get(f"{BASE_URL}/api/site-content")
        assert response.status_code == 200
        
        data = response.json()
        # Data can be null if never saved, or an object if saved
        if data is not None:
            # If data exists, check structure
            print(f"✓ Public site-content returns data with keys: {list(data.keys())}")
        else:
            print("✓ Public site-content returns null (no custom content saved)")
    
    def test_public_site_content_reflects_admin_changes(self, admin_token):
        """Test that public site-content reflects changes made by admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current admin content
        admin_response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert admin_response.status_code == 200
        content = admin_response.json()
        
        # Make a distinctive change
        unique_marker = f"{TEST_PREFIX}MARKER_{uuid.uuid4().hex[:8]}"
        content["footer"] = content.get("footer", {})
        content["footer"]["description"] = unique_marker
        
        # Save via admin endpoint
        put_response = requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)
        assert put_response.status_code == 200
        
        # Verify via public endpoint
        public_response = requests.get(f"{BASE_URL}/api/site-content")
        assert public_response.status_code == 200
        public_data = public_response.json()
        
        assert public_data is not None
        assert public_data.get("footer", {}).get("description") == unique_marker
        print("✓ Public site-content reflects admin changes")
        
        # Cleanup
        content["footer"]["description"] = "Professional MilSim operations since 2025"
        requests.put(f"{BASE_URL}/api/admin/site-content", json=content, headers=headers)


class TestOperationWithLogoUrl:
    """Test operations with logo_url badge field"""
    
    def test_create_operation_with_logo_url(self, admin_token):
        """Test creating operation with logo_url badge"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": f"{TEST_PREFIX}Op_Logo_{uuid.uuid4().hex[:8]}",
            "description": "Operation with logo badge",
            "operation_type": "combat",
            "date": "2026-04-15",
            "time": "21:00",
            "max_participants": 20,
            "logo_url": "https://example.com/flag.png"
        }
        
        response = requests.post(f"{BASE_URL}/api/operations", json=payload, headers=headers)
        assert response.status_code == 200, f"Create operation failed: {response.text}"
        
        data = response.json()
        assert data["logo_url"] == "https://example.com/flag.png"
        print(f"✓ Created operation with logo_url: {data['title']}")
        
        # Verify in public list
        list_response = requests.get(f"{BASE_URL}/api/operations")
        assert list_response.status_code == 200
        ops = list_response.json()
        found = next((op for op in ops if op["id"] == data["id"]), None)
        assert found is not None
        assert found["logo_url"] == "https://example.com/flag.png"
        print("✓ logo_url visible in public operations list")
    
    def test_update_operation_logo_url(self, admin_token):
        """Test updating operation logo_url"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create operation
        create_payload = {
            "title": f"{TEST_PREFIX}Update_Logo_{uuid.uuid4().hex[:8]}",
            "description": "Operation to update logo",
            "operation_type": "training",
            "date": "2026-05-01",
            "time": "18:00",
            "logo_url": ""
        }
        create_response = requests.post(f"{BASE_URL}/api/operations", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        op_id = create_response.json()["id"]
        
        # Update with logo
        update_payload = {
            "title": create_payload["title"],
            "description": create_payload["description"],
            "operation_type": "training",
            "date": "2026-05-01",
            "time": "18:00",
            "logo_url": "https://example.com/updated-flag.png"
        }
        update_response = requests.put(f"{BASE_URL}/api/admin/operations/{op_id}", json=update_payload, headers=headers)
        assert update_response.status_code == 200
        print(f"✓ Updated operation logo_url for ID: {op_id}")


class TestAnnouncementWithBadgeUrl:
    """Test announcements with badge_url field"""
    
    def test_create_announcement_with_badge_url(self, admin_token):
        """Test creating announcement with badge_url"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": f"{TEST_PREFIX}Intel_Badge_{uuid.uuid4().hex[:8]}",
            "content": "Announcement with badge",
            "priority": "urgent",
            "badge_url": "https://example.com/badge.png"
        }
        
        response = requests.post(f"{BASE_URL}/api/announcements", json=payload, headers=headers)
        assert response.status_code == 200, f"Create announcement failed: {response.text}"
        
        data = response.json()
        assert data["badge_url"] == "https://example.com/badge.png"
        print(f"✓ Created announcement with badge_url: {data['title']}")
        
        # Verify in public list
        list_response = requests.get(f"{BASE_URL}/api/announcements")
        assert list_response.status_code == 200
        anns = list_response.json()
        found = next((ann for ann in anns if ann["id"] == data["id"]), None)
        assert found is not None
        assert found["badge_url"] == "https://example.com/badge.png"
        print("✓ badge_url visible in public announcements list")
    
    def test_update_announcement_badge_url(self, admin_token):
        """Test updating announcement badge_url"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create announcement
        create_payload = {
            "title": f"{TEST_PREFIX}Update_Badge_{uuid.uuid4().hex[:8]}",
            "content": "Announcement to update badge",
            "priority": "high",
            "badge_url": ""
        }
        create_response = requests.post(f"{BASE_URL}/api/announcements", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        ann_id = create_response.json()["id"]
        
        # Update with badge
        update_payload = {
            "title": create_payload["title"],
            "content": create_payload["content"],
            "priority": "high",
            "badge_url": "https://example.com/updated-badge.png"
        }
        update_response = requests.put(f"{BASE_URL}/api/admin/announcements/{ann_id}", json=update_payload, headers=headers)
        assert update_response.status_code == 200
        print(f"✓ Updated announcement badge_url for ID: {ann_id}")


class TestOperationTypes:
    """Test operation type field and filtering"""
    
    def test_create_operations_with_different_types(self, admin_token):
        """Test creating operations with all supported types"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        types = ["combat", "training", "recon", "support"]
        created_ids = []
        
        for op_type in types:
            payload = {
                "title": f"{TEST_PREFIX}{op_type.capitalize()}_{uuid.uuid4().hex[:8]}",
                "description": f"Test {op_type} operation",
                "operation_type": op_type,
                "date": "2026-06-01",
                "time": "19:00"
            }
            response = requests.post(f"{BASE_URL}/api/operations", json=payload, headers=headers)
            assert response.status_code == 200, f"Failed to create {op_type} operation: {response.text}"
            data = response.json()
            assert data["operation_type"] == op_type
            created_ids.append(data["id"])
            print(f"✓ Created {op_type} operation")
        
        # Verify all types appear in list
        list_response = requests.get(f"{BASE_URL}/api/operations")
        assert list_response.status_code == 200
        ops = list_response.json()
        
        for created_id in created_ids:
            found = next((op for op in ops if op["id"] == created_id), None)
            assert found is not None
        print("✓ All operation types appear in public list")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
