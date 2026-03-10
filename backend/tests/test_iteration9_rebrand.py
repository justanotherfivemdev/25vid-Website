"""
Iteration 9 - Testing rebrand from 'Azimuth Operations Group' to '25th Infantry Division'
Focus: Verify branding, homepage loads, all existing features still work
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials for testing
ADMIN_EMAIL = "bishop@azimuth.ops"
ADMIN_PASSWORD = "Admin123!"


class TestAPIHealth:
    """Basic API health checks with new branding"""
    
    def test_api_root_returns_25th_id_branding(self):
        """API root should now return '25th Infantry Division API'"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "25th Infantry Division API"
        assert data["status"] == "operational"
        print("✓ API root returns correct 25th Infantry Division branding")


class TestSiteContent:
    """Verify site content returns correct 25th ID branding"""
    
    def test_public_site_content_25th_id_branding(self):
        """Public site content should return 25th Infantry Division content"""
        response = requests.get(f"{BASE_URL}/api/site-content")
        assert response.status_code == 200
        data = response.json()
        
        # Verify nav branding
        assert data["nav"]["brandName"] == "25TH INFANTRY DIVISION"
        assert data["nav"]["buttonText"] == "ENLIST NOW"
        print("✓ Nav shows '25TH INFANTRY DIVISION' branding")
        
        # Verify hero content
        assert data["hero"]["tagline"] == "TROPIC LIGHTNING"
        assert "Ready to Strike" in data["hero"]["subtitle"]
        print("✓ Hero tagline is 'TROPIC LIGHTNING'")
        
        # Verify about section structure - paragraph1 and paragraph2 exist
        assert "paragraph1" in data["about"]
        assert "paragraph2" in data["about"]
        assert "25th Infantry Division" in data["about"]["paragraph1"]
        assert "Tropic Lightning" in data["about"]["paragraph1"]
        print("✓ About section has paragraph1/paragraph2 with 25th ID content")
        
        # Verify quote is an object (not a string)
        assert isinstance(data["about"]["quote"], dict)
        assert "text" in data["about"]["quote"]
        assert "author" in data["about"]["quote"]
        print("✓ About quote is a proper object with text and author")
        
        # Verify gallery structure
        assert "showcaseImages" in data["gallery"]
        assert isinstance(data["gallery"]["showcaseImages"], list)
        print("✓ Gallery has showcaseImages array")
        
        # Verify footer
        assert "25th Infantry Division" in data["footer"].get("unitName", "")
        assert data["footer"]["discord"] == "https://discord.gg/3CJH2ZspsU"
        assert data["footer"]["email"] == "delta@25thvid.com"
        assert "fictional" in data["footer"]["disclaimer"].lower()
        print("✓ Footer has correct 25th ID branding and contact info")
        
        # Verify section headings
        assert data["sectionHeadings"]["enlist"]["heading"] == "JOIN THE 25TH"
        print("✓ Section headings use 25th ID branding")


class TestAuthentication:
    """Verify authentication still works after rebrand"""
    
    def test_admin_login_works(self):
        """Admin login should still work"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login works - {ADMIN_EMAIL}")
        return data["access_token"]
    
    def test_registration_works(self):
        """New user registration should work"""
        import uuid
        test_email = f"test_{uuid.uuid4().hex[:8]}@25thvid.com"
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "username": f"TestSoldier_{uuid.uuid4().hex[:4]}",
            "password": "Test123!Test"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "member"
        print(f"✓ Registration works - created {test_email}")
        return data["access_token"]


class TestAdminEndpoints:
    """Verify admin endpoints still work"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_admin_site_content_endpoint(self, admin_token):
        """Admin site content endpoint should work and show 25th ID content"""
        response = requests.get(
            f"{BASE_URL}/api/admin/site-content",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["nav"]["brandName"] == "25TH INFANTRY DIVISION"
        print("✓ Admin site content endpoint works with 25th ID branding")
    
    def test_admin_users_list(self, admin_token):
        """Admin users list should work"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Admin users list works - {len(data)} users")


class TestCoreFeatures:
    """Verify all core features still work"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_operations_list(self):
        """Operations listing should work"""
        response = requests.get(f"{BASE_URL}/api/operations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Operations list works - {len(data)} operations")
    
    def test_announcements_list(self):
        """Announcements listing should work"""
        response = requests.get(f"{BASE_URL}/api/announcements")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Announcements list works - {len(data)} announcements")
    
    def test_discussions_list(self, admin_token):
        """Discussions listing should work"""
        response = requests.get(
            f"{BASE_URL}/api/discussions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Discussions list works - {len(data)} discussions")
    
    def test_gallery_list(self):
        """Gallery listing should work"""
        response = requests.get(f"{BASE_URL}/api/gallery")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Gallery list works - {len(data)} images")
    
    def test_training_list(self):
        """Training listing should work"""
        response = requests.get(f"{BASE_URL}/api/training")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Training list works - {len(data)} courses")
    
    def test_roster_list(self, admin_token):
        """Roster listing should work"""
        response = requests.get(
            f"{BASE_URL}/api/roster",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Roster list works - {len(data)} members")


class TestDiscordOAuth:
    """Verify Discord OAuth endpoints still work"""
    
    def test_discord_oauth_available(self):
        """Discord OAuth endpoint should be available"""
        response = requests.get(f"{BASE_URL}/api/auth/discord")
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        assert "discord.com/oauth2/authorize" in data["url"]
        print("✓ Discord OAuth endpoint available")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
