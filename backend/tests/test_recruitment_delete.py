import os
import uuid

import httpx
import pytest

BASE_URL = os.environ.get("TEST_API_URL", "http://localhost:8001/api")


@pytest.fixture(scope="module")
def admin_cookies():
    with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
        res = client.post("/auth/login", json={
            "email": "bishop@azimuth.ops",
            "password": "Admin123!",
        })
        assert res.status_code == 200, f"Admin login failed: {res.text}"
        cookies = dict(res.cookies)
        assert "auth_token" in cookies, "No auth_token cookie returned on login"
        return cookies


@pytest.fixture(scope="module")
def test_user():
    email = f"recruit_delete_{uuid.uuid4().hex[:8]}@25thvid.com"
    password = "TestPass123!"
    username = f"RecruitDelete_{uuid.uuid4().hex[:6]}"
    with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
        res = client.post("/auth/register", json={
            "email": email,
            "username": username,
            "password": password,
        })
        assert res.status_code == 200, f"Register failed: {res.text}"
        cookies = dict(res.cookies)
        assert "auth_token" in cookies, "No auth_token cookie returned on register"
        return {
            "email": email,
            "password": password,
            "username": username,
            "cookies": cookies,
        }


@pytest.fixture
def reviewed_application(admin_cookies):
    payload = {
        "applicant_name": f"Delete Recruit {uuid.uuid4().hex[:6]}",
        "applicant_email": f"delete_recruit_{uuid.uuid4().hex[:8]}@25thvid.com",
        "discord_username": "delete.recruit",
        "timezone": "America/Indiana/Indianapolis",
        "experience": "Frontend and backend delete flow verification.",
        "availability": "Weeknights and weekends.",
        "why_join": "To validate recruitment deletion after review.",
    }

    with httpx.Client(base_url=BASE_URL) as public_client:
        submit_res = public_client.post("/recruitment/apply", json=payload)
    assert submit_res.status_code == 200, f"Application submit failed: {submit_res.text}"
    application_id = submit_res.json()["id"]

    with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as admin_client:
        review_res = admin_client.put(
            f"/admin/recruitment/applications/{application_id}",
            json={"status": "accepted", "admin_notes": "Reviewed for delete tests"},
        )
        assert review_res.status_code == 200, f"Application review failed: {review_res.text}"

    yield {
        "id": application_id,
        "applicant_name": payload["applicant_name"],
    }

    with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as admin_client:
        admin_client.delete(f"/admin/recruitment/applications/{application_id}")


class TestRecruitmentApplicationDelete:
    def test_delete_reviewed_application_returns_200(self, admin_cookies, reviewed_application):
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            delete_res = client.delete(f"/admin/recruitment/applications/{reviewed_application['id']}")
            list_res = client.get("/admin/recruitment/applications")

        assert delete_res.status_code == 200
        assert delete_res.json() == {
            "message": "Application deleted",
            "id": reviewed_application["id"],
        }
        assert list_res.status_code == 200
        ids = [application["id"] for application in list_res.json()]
        assert reviewed_application["id"] not in ids, "Deleted application still appears in admin list"

    def test_delete_missing_application_returns_404(self, admin_cookies):
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.delete(f"/admin/recruitment/applications/{uuid.uuid4()}")

        assert res.status_code == 404
        assert res.json()["detail"] == "Application not found"

    def test_delete_invalid_application_id_returns_400(self, admin_cookies):
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            res = client.delete("/admin/recruitment/applications/not-a-valid-id")

        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid application id"

    def test_delete_requires_auth(self, reviewed_application):
        with httpx.Client(base_url=BASE_URL) as client:
            res = client.delete(f"/admin/recruitment/applications/{reviewed_application['id']}")

        assert res.status_code == 401

    def test_delete_rejects_non_admin(self, test_user, reviewed_application):
        with httpx.Client(base_url=BASE_URL, cookies=test_user["cookies"]) as client:
            res = client.delete(f"/admin/recruitment/applications/{reviewed_application['id']}")

        assert res.status_code == 403

    def test_double_delete_returns_404(self, admin_cookies, reviewed_application):
        with httpx.Client(base_url=BASE_URL, cookies=admin_cookies) as client:
            first_res = client.delete(f"/admin/recruitment/applications/{reviewed_application['id']}")
            second_res = client.delete(f"/admin/recruitment/applications/{reviewed_application['id']}")

        assert first_res.status_code == 200
        assert second_res.status_code == 404
        assert second_res.json()["detail"] == "Application not found"
