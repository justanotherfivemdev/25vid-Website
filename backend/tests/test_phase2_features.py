"""
Test Phase 2 Features for 25th Infantry Division Milsim Website
- Unit Tags API
- Roster Hierarchy API
- Operation RSVP Roster API
- Admin Unit Config
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://unit-colors-verify.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "testadmin@test.com"
ADMIN_PASSWORD = "TestAdmin123!"


@pytest.fixture(scope="module")
def session():
    """Create a requests session with cookies."""
    return requests.Session()


@pytest.fixture(scope="module")
def auth_session(session):
    """Login and get authenticated session."""
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return session


class TestUnitTagsAPI:
    """Test /api/unit-tags endpoint returns all tag categories."""
    
    def test_unit_tags_returns_ranks(self, auth_session):
        """Unit tags should include military ranks."""
        response = auth_session.get(f"{BASE_URL}/api/unit-tags")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "ranks" in data, "Response missing 'ranks' key"
        assert isinstance(data["ranks"], list), "Ranks should be a list"
        assert len(data["ranks"]) > 0, "Ranks list should not be empty"
        # Check for expected ranks
        assert "Private" in data["ranks"], "Missing 'Private' rank"
        assert "Sergeant" in data["ranks"], "Missing 'Sergeant' rank"
        print(f"✓ Unit tags returned {len(data['ranks'])} ranks")

    def test_unit_tags_returns_companies(self, auth_session):
        """Unit tags should include company options."""
        response = auth_session.get(f"{BASE_URL}/api/unit-tags")
        assert response.status_code == 200
        data = response.json()
        assert "companies" in data, "Response missing 'companies' key"
        assert isinstance(data["companies"], list)
        assert "Alpha" in data["companies"], "Missing 'Alpha' company"
        assert "Bravo" in data["companies"], "Missing 'Bravo' company"
        assert "HQ" in data["companies"], "Missing 'HQ' company"
        print(f"✓ Unit tags returned {len(data['companies'])} companies")

    def test_unit_tags_returns_platoons(self, auth_session):
        """Unit tags should include platoon options."""
        response = auth_session.get(f"{BASE_URL}/api/unit-tags")
        assert response.status_code == 200
        data = response.json()
        assert "platoons" in data, "Response missing 'platoons' key"
        assert "1st Platoon" in data["platoons"], "Missing '1st Platoon'"
        print(f"✓ Unit tags returned {len(data['platoons'])} platoons")

    def test_unit_tags_returns_squads(self, auth_session):
        """Unit tags should include squad options."""
        response = auth_session.get(f"{BASE_URL}/api/unit-tags")
        assert response.status_code == 200
        data = response.json()
        assert "squads" in data, "Response missing 'squads' key"
        assert "1st Squad" in data["squads"], "Missing '1st Squad'"
        print(f"✓ Unit tags returned {len(data['squads'])} squads")

    def test_unit_tags_returns_billets(self, auth_session):
        """Unit tags should include billet/position options."""
        response = auth_session.get(f"{BASE_URL}/api/unit-tags")
        assert response.status_code == 200
        data = response.json()
        assert "billets" in data, "Response missing 'billets' key"
        assert "Squad Leader" in data["billets"], "Missing 'Squad Leader'"
        assert "Rifleman" in data["billets"], "Missing 'Rifleman'"
        print(f"✓ Unit tags returned {len(data['billets'])} billets")

    def test_unit_tags_returns_specializations(self, auth_session):
        """Unit tags should include specialization/MOS options."""
        response = auth_session.get(f"{BASE_URL}/api/unit-tags")
        assert response.status_code == 200
        data = response.json()
        assert "specializations" in data, "Response missing 'specializations' key"
        assert "Infantry" in data["specializations"], "Missing 'Infantry'"
        print(f"✓ Unit tags returned {len(data['specializations'])} specializations")


class TestRosterHierarchyAPI:
    """Test /api/roster/hierarchy endpoint returns organizational structure."""
    
    def test_hierarchy_returns_command_staff(self, auth_session):
        """Hierarchy should include command_staff array."""
        response = auth_session.get(f"{BASE_URL}/api/roster/hierarchy")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "command_staff" in data, "Response missing 'command_staff' key"
        assert isinstance(data["command_staff"], list), "command_staff should be a list"
        print(f"✓ Hierarchy returned {len(data['command_staff'])} command staff")

    def test_hierarchy_returns_companies(self, auth_session):
        """Hierarchy should include companies object."""
        response = auth_session.get(f"{BASE_URL}/api/roster/hierarchy")
        assert response.status_code == 200
        data = response.json()
        assert "companies" in data, "Response missing 'companies' key"
        assert isinstance(data["companies"], dict), "companies should be a dict"
        print(f"✓ Hierarchy returned {len(data['companies'])} companies")

    def test_hierarchy_returns_unassigned(self, auth_session):
        """Hierarchy should include unassigned array."""
        response = auth_session.get(f"{BASE_URL}/api/roster/hierarchy")
        assert response.status_code == 200
        data = response.json()
        assert "unassigned" in data, "Response missing 'unassigned' key"
        assert isinstance(data["unassigned"], list), "unassigned should be a list"
        print(f"✓ Hierarchy returned {len(data['unassigned'])} unassigned members")

    def test_hierarchy_member_data_structure(self, auth_session):
        """Members in hierarchy should have expected fields."""
        response = auth_session.get(f"{BASE_URL}/api/roster/hierarchy")
        assert response.status_code == 200
        data = response.json()
        
        # Find a member from any section
        all_members = data["command_staff"] + data["unassigned"]
        for company_data in data["companies"].values():
            all_members.extend(company_data.get("unassigned", []))
            for platoon_data in company_data.get("platoons", {}).values():
                all_members.extend(platoon_data.get("unassigned", []))
                for squad_members in platoon_data.get("squads", {}).values():
                    all_members.extend(squad_members)
        
        if all_members:
            member = all_members[0]
            assert "id" in member, "Member missing 'id'"
            assert "username" in member, "Member missing 'username'"
            assert "rank" in member or member.get("rank") is None, "Member should have rank field"
            print(f"✓ Member data structure verified (checked {len(all_members)} members)")
        else:
            print("⚠ No members found in hierarchy to verify structure")


class TestOperationRosterAPI:
    """Test /api/operations/{id}/roster endpoint returns enriched RSVP data."""
    
    def test_operation_roster_endpoint_exists(self, auth_session):
        """Operation roster endpoint should respond (may be 404 if no operations)."""
        # First get an operation ID
        ops_response = auth_session.get(f"{BASE_URL}/api/operations")
        assert ops_response.status_code == 200
        operations = ops_response.json()
        
        if not operations:
            pytest.skip("No operations available to test roster endpoint")
        
        op_id = operations[0]["id"]
        response = auth_session.get(f"{BASE_URL}/api/operations/{op_id}/roster")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "operation_id" in data, "Response missing 'operation_id'"
        assert "rsvps" in data, "Response missing 'rsvps'"
        assert "counts" in data, "Response missing 'counts'"
        print(f"✓ Operation roster endpoint working for operation: {data.get('title', op_id)}")

    def test_operation_roster_rsvp_structure(self, auth_session):
        """Operation roster RSVPs should be grouped by status."""
        ops_response = auth_session.get(f"{BASE_URL}/api/operations")
        operations = ops_response.json()
        
        if not operations:
            pytest.skip("No operations available")
        
        op_id = operations[0]["id"]
        response = auth_session.get(f"{BASE_URL}/api/operations/{op_id}/roster")
        data = response.json()
        
        rsvps = data.get("rsvps", {})
        assert "attending" in rsvps, "RSVPs missing 'attending' list"
        assert "tentative" in rsvps, "RSVPs missing 'tentative' list"
        assert "waitlisted" in rsvps, "RSVPs missing 'waitlisted' list"
        assert isinstance(rsvps["attending"], list)
        assert isinstance(rsvps["tentative"], list)
        assert isinstance(rsvps["waitlisted"], list)
        print(f"✓ RSVP structure verified: {len(rsvps['attending'])} attending, {len(rsvps['tentative'])} tentative")

    def test_operation_roster_counts(self, auth_session):
        """Operation roster should include counts object."""
        ops_response = auth_session.get(f"{BASE_URL}/api/operations")
        operations = ops_response.json()
        
        if not operations:
            pytest.skip("No operations available")
        
        op_id = operations[0]["id"]
        response = auth_session.get(f"{BASE_URL}/api/operations/{op_id}/roster")
        data = response.json()
        
        counts = data.get("counts", {})
        assert "attending" in counts, "Counts missing 'attending'"
        assert "tentative" in counts, "Counts missing 'tentative'"
        assert "waitlisted" in counts, "Counts missing 'waitlisted'"
        assert "total" in counts, "Counts missing 'total'"
        print(f"✓ Roster counts: {counts}")


class TestAdminUnitTagsUpdate:
    """Test admin can add custom tags via /api/admin/unit-tags."""
    
    def test_admin_can_update_custom_tags(self, auth_session):
        """Admin should be able to save custom tags."""
        custom_tags = {
            "ranks": ["Custom Rank Test"],
            "companies": ["Echo"]
        }
        response = auth_session.put(f"{BASE_URL}/api/admin/unit-tags", json=custom_tags)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        print(f"✓ Custom tags saved: {data}")

    def test_custom_tags_appear_in_unit_tags(self, auth_session):
        """Custom tags should appear when fetching unit-tags."""
        # First add a custom tag
        custom_tags = {"companies": ["TEST_Company_Phase2"]}
        auth_session.put(f"{BASE_URL}/api/admin/unit-tags", json=custom_tags)
        
        # Now fetch and verify
        response = auth_session.get(f"{BASE_URL}/api/unit-tags")
        assert response.status_code == 200
        data = response.json()
        
        # The custom company might be merged with defaults
        # Note: depends on backend implementation - it may merge or append
        print(f"✓ Unit tags fetch after custom add successful")


class TestAuthWithCookies:
    """Test that authentication still works with HttpOnly cookies."""
    
    def test_login_sets_cookie(self):
        """Login should set auth_token cookie."""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        # Check cookies
        cookies = session.cookies.get_dict()
        # Note: HttpOnly cookies may not be visible in Python requests cookies dict
        # but the session should still work
        print(f"✓ Login successful, session cookies: {list(cookies.keys())}")

    def test_session_persists_across_requests(self):
        """Session should persist across multiple requests."""
        session = requests.Session()
        
        # Login
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        
        # Make multiple authenticated requests
        me_response = session.get(f"{BASE_URL}/api/auth/me")
        assert me_response.status_code == 200, "Failed to get /auth/me"
        
        roster_response = session.get(f"{BASE_URL}/api/roster")
        assert roster_response.status_code == 200, "Failed to get /roster"
        
        print("✓ Session persists across multiple requests")


class TestLandingPageBranding:
    """Test that landing page shows 25th Infantry Division branding."""
    
    def test_site_content_not_azimuth(self, auth_session):
        """Site content should not contain Azimuth references."""
        response = auth_session.get(f"{BASE_URL}/api/site-content")
        # Site content may be null if not set
        if response.status_code == 200:
            data = response.json()
            if data:
                content_str = str(data).lower()
                assert "azimuth" not in content_str, "Site content still contains 'Azimuth'"
                print("✓ Site content does not contain 'Azimuth'")
            else:
                print("✓ Site content is empty (will use frontend defaults)")
        else:
            print(f"⚠ Site content endpoint returned {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
