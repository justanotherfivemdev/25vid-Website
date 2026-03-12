"""
Phase 2 Backend API tests for Azimuth Operations Group MilSim website.
Tests: Training CRUD, Gallery CRUD, Discussions CRUD, RSVP, File uploads, Admin endpoints
"""
import pytest
import requests
import os
import uuid
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://command-center-v2-2.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"
TEST_PREFIX = "TEST_"


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


@pytest.fixture(scope="module")
def member_token():
    """Register and get a member token"""
    unique_id = str(uuid.uuid4())[:8]
    payload = {
        "email": f"{TEST_PREFIX}member_{unique_id}@test.com",
        "username": f"{TEST_PREFIX}member_{unique_id}",
        "password": "MemberTest123!"
    }
    response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    if response.status_code != 200:
        pytest.skip("Member registration failed")
    return response.json()["access_token"]


class TestPhase1Regression:
    """Phase 1 regression tests - ensure existing functionality still works"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        assert response.json()["status"] == "operational"
        print("✓ API root endpoint operational")
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "admin"
        print("✓ Admin login successful")
    
    def test_user_registration(self):
        """Test new user registration"""
        unique_id = str(uuid.uuid4())[:8]
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"{TEST_PREFIX}reg_{unique_id}@test.com",
            "username": f"{TEST_PREFIX}reg_{unique_id}",
            "password": "RegTest123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "member"
        print(f"✓ User registration successful: {data['user']['username']}")
    
    def test_public_operations(self):
        """Test public operations endpoint"""
        response = requests.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/operations returned {len(response.json())} operations")
    
    def test_public_announcements(self):
        """Test public announcements endpoint"""
        response = requests.get(f"{BASE_URL}/api/announcements")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/announcements returned {len(response.json())} announcements")


class TestTrainingCRUD:
    """Training management CRUD tests"""
    
    def test_get_training_list(self):
        """Test getting training list (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/training")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/training returned {len(response.json())} training programs")
    
    def test_create_training_admin(self, admin_token):
        """Test creating training program as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": f"{TEST_PREFIX}CQB Advanced",
            "description": "Close quarters battle training",
            "instructor": "SGT Miller",
            "schedule": "Saturday 1800 UTC",
            "duration": "2 hours",
            "image_url": ""
        }
        response = requests.post(f"{BASE_URL}/api/training", json=payload, headers=headers)
        assert response.status_code == 200, f"Create training failed: {response.text}"
        data = response.json()
        assert data["title"] == payload["title"]
        assert data["instructor"] == "SGT Miller"
        assert "id" in data
        print(f"✓ Created training: {data['title']} (ID: {data['id']})")
        return data
    
    def test_update_training_admin(self, admin_token):
        """Test updating training program as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First create a training
        create_payload = {
            "title": f"{TEST_PREFIX}Update_Training_{uuid.uuid4().hex[:8]}",
            "description": "Original description",
            "instructor": "SGT Original",
            "schedule": "Monday 1900 UTC",
            "duration": "1 hour"
        }
        create_response = requests.post(f"{BASE_URL}/api/training", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        training_id = create_response.json()["id"]
        
        # Now update it
        update_payload = {
            "title": f"{TEST_PREFIX}Updated_Training",
            "description": "Updated description",
            "instructor": "SGT Updated",
            "schedule": "Tuesday 2000 UTC",
            "duration": "3 hours"
        }
        update_response = requests.put(f"{BASE_URL}/api/admin/training/{training_id}", json=update_payload, headers=headers)
        assert update_response.status_code == 200
        print(f"✓ Updated training ID: {training_id}")
    
    def test_delete_training_admin(self, admin_token):
        """Test deleting training program as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First create a training to delete
        create_payload = {
            "title": f"{TEST_PREFIX}Delete_Training_{uuid.uuid4().hex[:8]}",
            "description": "To be deleted",
            "instructor": "SGT Delete",
            "schedule": "Never",
            "duration": "0 hours"
        }
        create_response = requests.post(f"{BASE_URL}/api/training", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        training_id = create_response.json()["id"]
        
        # Now delete it
        delete_response = requests.delete(f"{BASE_URL}/api/admin/training/{training_id}", headers=headers)
        assert delete_response.status_code == 200
        print(f"✓ Deleted training ID: {training_id}")
    
    def test_create_training_member_fails(self, member_token):
        """Test that member cannot create training (admin only)"""
        headers = {"Authorization": f"Bearer {member_token}"}
        payload = {
            "title": "Unauthorized Training",
            "description": "Should fail",
            "instructor": "Nobody",
            "schedule": "Never",
            "duration": "0 hours"
        }
        response = requests.post(f"{BASE_URL}/api/training", json=payload, headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Non-admin correctly denied training creation")


class TestGalleryCRUD:
    """Gallery management CRUD tests"""
    
    def test_get_gallery_list(self):
        """Test getting gallery list (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/gallery")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/gallery returned {len(response.json())} images")
    
    def test_get_gallery_by_category(self):
        """Test filtering gallery by category"""
        for cat in ['operation', 'training', 'team', 'equipment']:
            response = requests.get(f"{BASE_URL}/api/gallery?category={cat}")
            assert response.status_code == 200
            data = response.json()
            # Verify all returned items have correct category
            for img in data:
                assert img["category"] == cat, f"Expected category {cat}, got {img['category']}"
            print(f"✓ Gallery filter by '{cat}' works ({len(data)} images)")
    
    def test_create_gallery_image(self, admin_token):
        """Test creating gallery image"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": f"{TEST_PREFIX}Team Alpha Deploy",
            "image_url": "https://example.com/test-image.jpg",
            "category": "operation"
        }
        response = requests.post(f"{BASE_URL}/api/gallery", json=payload, headers=headers)
        assert response.status_code == 200, f"Create gallery image failed: {response.text}"
        data = response.json()
        assert data["title"] == payload["title"]
        assert data["category"] == "operation"
        assert "id" in data
        print(f"✓ Created gallery image: {data['title']} (ID: {data['id']})")
        return data
    
    def test_update_gallery_image(self, admin_token):
        """Test updating gallery image as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First create an image
        create_payload = {
            "title": f"{TEST_PREFIX}Update_Image_{uuid.uuid4().hex[:8]}",
            "image_url": "https://example.com/original.jpg",
            "category": "training"
        }
        create_response = requests.post(f"{BASE_URL}/api/gallery", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        image_id = create_response.json()["id"]
        
        # Now update it
        update_payload = {
            "title": f"{TEST_PREFIX}Updated_Image",
            "image_url": "https://example.com/updated.jpg",
            "category": "equipment"
        }
        update_response = requests.put(f"{BASE_URL}/api/admin/gallery/{image_id}", json=update_payload, headers=headers)
        assert update_response.status_code == 200
        print(f"✓ Updated gallery image ID: {image_id}")
    
    def test_delete_gallery_image(self, admin_token):
        """Test deleting gallery image as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First create an image to delete
        create_payload = {
            "title": f"{TEST_PREFIX}Delete_Image_{uuid.uuid4().hex[:8]}",
            "image_url": "https://example.com/delete.jpg",
            "category": "team"
        }
        create_response = requests.post(f"{BASE_URL}/api/gallery", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        image_id = create_response.json()["id"]
        
        # Now delete it
        delete_response = requests.delete(f"{BASE_URL}/api/admin/gallery/{image_id}", headers=headers)
        assert delete_response.status_code == 200
        print(f"✓ Deleted gallery image ID: {image_id}")


class TestDiscussionsCRUD:
    """Discussion forum CRUD tests"""
    
    def test_get_discussions_list(self):
        """Test getting discussions list (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/discussions")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/discussions returned {len(response.json())} discussions")
    
    def test_get_discussions_by_category(self):
        """Test filtering discussions by category"""
        for cat in ['general', 'operations', 'training', 'feedback']:
            response = requests.get(f"{BASE_URL}/api/discussions?category={cat}")
            assert response.status_code == 200
            print(f"✓ Discussion filter by '{cat}' works ({len(response.json())} discussions)")
    
    def test_create_discussion(self, member_token):
        """Test creating discussion as member"""
        headers = {"Authorization": f"Bearer {member_token}"}
        payload = {
            "category": "general",
            "title": f"{TEST_PREFIX}Test Thread {uuid.uuid4().hex[:8]}",
            "content": "Test content for discussion thread"
        }
        response = requests.post(f"{BASE_URL}/api/discussions", json=payload, headers=headers)
        assert response.status_code == 200, f"Create discussion failed: {response.text}"
        data = response.json()
        assert data["title"] == payload["title"]
        assert data["category"] == "general"
        assert "id" in data
        print(f"✓ Created discussion: {data['title']} (ID: {data['id']})")
        return data
    
    def test_get_single_discussion(self, member_token):
        """Test getting a single discussion by ID"""
        headers = {"Authorization": f"Bearer {member_token}"}
        
        # First create a discussion
        create_payload = {
            "category": "operations",
            "title": f"{TEST_PREFIX}Single_Discussion_{uuid.uuid4().hex[:8]}",
            "content": "Content for single get test"
        }
        create_response = requests.post(f"{BASE_URL}/api/discussions", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        discussion_id = create_response.json()["id"]
        
        # Now get it by ID
        get_response = requests.get(f"{BASE_URL}/api/discussions/{discussion_id}")
        assert get_response.status_code == 200
        data = get_response.json()
        assert data["id"] == discussion_id
        assert data["title"] == create_payload["title"]
        print(f"✓ GET single discussion ID: {discussion_id}")
    
    def test_add_reply_to_discussion(self, member_token):
        """Test adding reply to discussion"""
        headers = {"Authorization": f"Bearer {member_token}"}
        
        # First create a discussion
        create_payload = {
            "category": "feedback",
            "title": f"{TEST_PREFIX}Reply_Test_{uuid.uuid4().hex[:8]}",
            "content": "Original post content"
        }
        create_response = requests.post(f"{BASE_URL}/api/discussions", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        discussion_id = create_response.json()["id"]
        
        # Add reply
        reply_payload = {"content": "This is a test reply"}
        reply_response = requests.post(f"{BASE_URL}/api/discussions/{discussion_id}/reply", json=reply_payload, headers=headers)
        assert reply_response.status_code == 200
        reply_data = reply_response.json()
        assert "reply" in reply_data
        assert reply_data["reply"]["content"] == "This is a test reply"
        print(f"✓ Added reply to discussion ID: {discussion_id}")
        
        # Verify reply is in discussion
        get_response = requests.get(f"{BASE_URL}/api/discussions/{discussion_id}")
        assert get_response.status_code == 200
        assert len(get_response.json()["replies"]) == 1
        print("✓ Reply persisted in discussion")
    
    def test_admin_delete_discussion(self, admin_token, member_token):
        """Test admin can delete discussions"""
        member_headers = {"Authorization": f"Bearer {member_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create discussion as member
        create_payload = {
            "category": "general",
            "title": f"{TEST_PREFIX}Admin_Delete_{uuid.uuid4().hex[:8]}",
            "content": "To be deleted by admin"
        }
        create_response = requests.post(f"{BASE_URL}/api/discussions", json=create_payload, headers=member_headers)
        assert create_response.status_code == 200
        discussion_id = create_response.json()["id"]
        
        # Delete as admin
        delete_response = requests.delete(f"{BASE_URL}/api/admin/discussions/{discussion_id}", headers=admin_headers)
        assert delete_response.status_code == 200
        print(f"✓ Admin deleted discussion ID: {discussion_id}")
        
        # Verify it's gone
        get_response = requests.get(f"{BASE_URL}/api/discussions/{discussion_id}")
        assert get_response.status_code == 404
        print("✓ Discussion properly deleted")
    
    def test_admin_delete_reply(self, admin_token, member_token):
        """Test admin can delete replies"""
        member_headers = {"Authorization": f"Bearer {member_token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create discussion
        create_payload = {
            "category": "general",
            "title": f"{TEST_PREFIX}Reply_Delete_{uuid.uuid4().hex[:8]}",
            "content": "Discussion with reply to delete"
        }
        create_response = requests.post(f"{BASE_URL}/api/discussions", json=create_payload, headers=member_headers)
        assert create_response.status_code == 200
        discussion_id = create_response.json()["id"]
        
        # Add reply
        reply_response = requests.post(f"{BASE_URL}/api/discussions/{discussion_id}/reply", 
                                      json={"content": "Reply to delete"}, headers=member_headers)
        assert reply_response.status_code == 200
        reply_id = reply_response.json()["reply"]["id"]
        
        # Delete reply as admin
        delete_response = requests.delete(f"{BASE_URL}/api/admin/discussions/{discussion_id}/reply/{reply_id}", headers=admin_headers)
        assert delete_response.status_code == 200
        print(f"✓ Admin deleted reply ID: {reply_id}")
        
        # Verify reply is gone
        get_response = requests.get(f"{BASE_URL}/api/discussions/{discussion_id}")
        assert get_response.status_code == 200
        assert len(get_response.json()["replies"]) == 0
        print("✓ Reply properly deleted")


class TestRSVPFunctionality:
    """Operation RSVP tests"""
    
    def test_rsvp_toggle(self, admin_token, member_token):
        """Test RSVP toggle functionality"""
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        member_headers = {"Authorization": f"Bearer {member_token}"}
        
        # Create operation as admin
        op_payload = {
            "title": f"{TEST_PREFIX}RSVP_Test_{uuid.uuid4().hex[:8]}",
            "description": "Test operation for RSVP",
            "operation_type": "combat",
            "date": "2026-05-01",
            "time": "20:00",
            "max_participants": 10
        }
        create_response = requests.post(f"{BASE_URL}/api/operations", json=op_payload, headers=admin_headers)
        assert create_response.status_code == 200
        operation_id = create_response.json()["id"]
        
        # RSVP as member
        rsvp_response = requests.post(f"{BASE_URL}/api/operations/{operation_id}/rsvp", headers=member_headers)
        assert rsvp_response.status_code == 200
        assert rsvp_response.json()["message"] == "RSVP confirmed"
        assert rsvp_response.json()["rsvp_count"] == 1
        print(f"✓ Member RSVP'd to operation ID: {operation_id}")
        
        # Toggle RSVP (remove)
        rsvp_response2 = requests.post(f"{BASE_URL}/api/operations/{operation_id}/rsvp", headers=member_headers)
        assert rsvp_response2.status_code == 200
        assert rsvp_response2.json()["message"] == "RSVP removed"
        assert rsvp_response2.json()["rsvp_count"] == 0
        print("✓ Member RSVP toggled (removed)")


class TestFileUpload:
    """File upload and serving tests"""
    
    def test_file_upload_returns_api_path(self, admin_token):
        """Test that file upload returns /api/uploads/ path"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a simple test image (1x1 red pixel PNG)
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test_upload.png", png_data, "image/png")}
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        
        assert response.status_code == 200, f"File upload failed: {response.text}"
        data = response.json()
        assert "url" in data
        # Verify the URL starts with /api/uploads/ (new path)
        assert data["url"].startswith("/api/uploads/"), f"Expected /api/uploads/ path, got {data['url']}"
        print(f"✓ File uploaded with path: {data['url']}")
        return data["url"]
    
    def test_uploaded_file_accessible(self, admin_token):
        """Test that uploaded files can be accessed via GET"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Upload a file
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
        files = {"file": ("accessible_test.png", png_data, "image/png")}
        upload_response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        assert upload_response.status_code == 200
        file_url = upload_response.json()["url"]
        
        # Access the file
        full_url = f"{BASE_URL}{file_url}"
        get_response = requests.get(full_url)
        assert get_response.status_code == 200, f"Failed to access uploaded file at {full_url}"
        assert get_response.headers.get("content-type", "").startswith("image/")
        print(f"✓ Uploaded file accessible at: {full_url}")


class TestAdminEndpointsProtection:
    """Test that admin endpoints are properly protected"""
    
    def test_admin_users_requires_admin(self, member_token):
        """Test that non-admin cannot access admin users endpoint"""
        headers = {"Authorization": f"Bearer {member_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        assert response.status_code == 403
        print("✓ Non-admin correctly denied access to /api/admin/users")
    
    def test_admin_site_content_requires_admin(self, member_token):
        """Test that non-admin cannot access admin site-content endpoint"""
        headers = {"Authorization": f"Bearer {member_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/site-content", headers=headers)
        assert response.status_code == 403
        print("✓ Non-admin correctly denied access to /api/admin/site-content")
    
    def test_delete_operations_requires_admin(self, member_token, admin_token):
        """Test that non-admin cannot delete operations"""
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        member_headers = {"Authorization": f"Bearer {member_token}"}
        
        # Create an operation as admin
        op_payload = {
            "title": f"{TEST_PREFIX}Delete_Protection_{uuid.uuid4().hex[:8]}",
            "description": "Test operation",
            "operation_type": "training",
            "date": "2026-06-01",
            "time": "18:00"
        }
        create_response = requests.post(f"{BASE_URL}/api/operations", json=op_payload, headers=admin_headers)
        assert create_response.status_code == 200
        op_id = create_response.json()["id"]
        
        # Try to delete as member
        delete_response = requests.delete(f"{BASE_URL}/api/admin/operations/{op_id}", headers=member_headers)
        assert delete_response.status_code == 403
        print("✓ Non-admin correctly denied operation deletion")


class TestAdminOperationsCRUD:
    """Admin operations management tests"""
    
    def test_admin_create_operation(self, admin_token):
        """Test admin can create operations"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": f"{TEST_PREFIX}Admin_Op_{uuid.uuid4().hex[:8]}",
            "description": "Admin created operation",
            "operation_type": "combat",
            "date": "2026-07-01",
            "time": "21:00",
            "max_participants": 20
        }
        response = requests.post(f"{BASE_URL}/api/operations", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == payload["title"]
        print(f"✓ Admin created operation: {data['title']}")
        return data
    
    def test_admin_update_operation(self, admin_token):
        """Test admin can update operations"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create operation
        create_payload = {
            "title": f"{TEST_PREFIX}Update_Op_{uuid.uuid4().hex[:8]}",
            "description": "Original description",
            "operation_type": "recon",
            "date": "2026-08-01",
            "time": "19:00"
        }
        create_response = requests.post(f"{BASE_URL}/api/operations", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        op_id = create_response.json()["id"]
        
        # Update
        update_payload = {
            "title": f"{TEST_PREFIX}Updated_Op",
            "description": "Updated description",
            "operation_type": "support",
            "date": "2026-08-15",
            "time": "20:00"
        }
        update_response = requests.put(f"{BASE_URL}/api/admin/operations/{op_id}", json=update_payload, headers=headers)
        assert update_response.status_code == 200
        print(f"✓ Admin updated operation ID: {op_id}")
    
    def test_admin_delete_operation(self, admin_token):
        """Test admin can delete operations"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create operation
        create_payload = {
            "title": f"{TEST_PREFIX}Delete_Op_{uuid.uuid4().hex[:8]}",
            "description": "To be deleted",
            "operation_type": "training",
            "date": "2026-09-01",
            "time": "18:00"
        }
        create_response = requests.post(f"{BASE_URL}/api/operations", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        op_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/admin/operations/{op_id}", headers=headers)
        assert delete_response.status_code == 200
        print(f"✓ Admin deleted operation ID: {op_id}")


class TestAdminAnnouncementsCRUD:
    """Admin announcements management tests"""
    
    def test_admin_create_announcement(self, admin_token):
        """Test admin can create announcements"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "title": f"{TEST_PREFIX}Admin_Ann_{uuid.uuid4().hex[:8]}",
            "content": "Admin created announcement content",
            "priority": "high"
        }
        response = requests.post(f"{BASE_URL}/api/announcements", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == payload["title"]
        print(f"✓ Admin created announcement: {data['title']}")
        return data
    
    def test_admin_update_announcement(self, admin_token):
        """Test admin can update announcements"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create announcement
        create_payload = {
            "title": f"{TEST_PREFIX}Update_Ann_{uuid.uuid4().hex[:8]}",
            "content": "Original content",
            "priority": "normal"
        }
        create_response = requests.post(f"{BASE_URL}/api/announcements", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        ann_id = create_response.json()["id"]
        
        # Update
        update_payload = {
            "title": f"{TEST_PREFIX}Updated_Ann",
            "content": "Updated content",
            "priority": "urgent"
        }
        update_response = requests.put(f"{BASE_URL}/api/admin/announcements/{ann_id}", json=update_payload, headers=headers)
        assert update_response.status_code == 200
        print(f"✓ Admin updated announcement ID: {ann_id}")
    
    def test_admin_delete_announcement(self, admin_token):
        """Test admin can delete announcements"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create announcement
        create_payload = {
            "title": f"{TEST_PREFIX}Delete_Ann_{uuid.uuid4().hex[:8]}",
            "content": "To be deleted",
            "priority": "low"
        }
        create_response = requests.post(f"{BASE_URL}/api/announcements", json=create_payload, headers=headers)
        assert create_response.status_code == 200
        ann_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/admin/announcements/{ann_id}", headers=headers)
        assert delete_response.status_code == 200
        print(f"✓ Admin deleted announcement ID: {ann_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
