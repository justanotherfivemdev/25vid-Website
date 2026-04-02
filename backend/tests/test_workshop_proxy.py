import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from services import workshop_proxy


def test_browse_workshop_normalizes_tags_for_cache_and_url(monkeypatch):
    captured = {}

    async def fake_get_cached(key):
        captured["cache_key"] = key
        return None

    async def fake_fetch_html(url):
        captured["url"] = url
        return "<html></html>"

    def fake_parse_mod_list(_html):
        return [{"id": "mod-1"}], 1

    async def fake_set_cached(key, _data):
        captured["set_cache_key"] = key

    monkeypatch.setattr(workshop_proxy, "_get_cached", fake_get_cached)
    monkeypatch.setattr(workshop_proxy, "_fetch_html", fake_fetch_html)
    monkeypatch.setattr(workshop_proxy, "_parse_mod_list", fake_parse_mod_list)
    monkeypatch.setattr(workshop_proxy, "_set_cached", fake_set_cached)

    result = asyncio.run(
        workshop_proxy.browse_workshop(
            category="popular",
            page=2,
            tags=[" map ", "weapon", "MAP", "", "weapon "],
        )
    )

    assert captured["cache_key"] == "browse:popularity:2:MAP,WEAPON"
    assert captured["set_cache_key"] == captured["cache_key"]
    assert captured["url"].endswith("?page=2&sort=popularity&tags=MAP&tags=WEAPON")
    assert result["mods"] == [{"id": "mod-1"}]


def test_search_workshop_normalizes_tags_for_cache_and_url(monkeypatch):
    captured = {}

    async def fake_get_cached(key):
        captured["cache_key"] = key
        return None

    async def fake_fetch_html(url):
        captured["url"] = url
        return "<html></html>"

    def fake_parse_mod_list(_html):
        return [{"id": "mod-2"}], 1

    async def fake_set_cached(key, _data):
        captured["set_cache_key"] = key

    monkeypatch.setattr(workshop_proxy, "_get_cached", fake_get_cached)
    monkeypatch.setattr(workshop_proxy, "_fetch_html", fake_fetch_html)
    monkeypatch.setattr(workshop_proxy, "_parse_mod_list", fake_parse_mod_list)
    monkeypatch.setattr(workshop_proxy, "_set_cached", fake_set_cached)

    result = asyncio.run(
        workshop_proxy.search_workshop(
            query="radar",
            page=3,
            sort="updated",
            tags=[" dependency", "UI", "ui", None],
        )
    )

    assert captured["cache_key"] == "search:radar:updated:3:DEPENDENCY,UI"
    assert captured["set_cache_key"] == captured["cache_key"]
    assert captured["url"].endswith(
        "?page=3&search=radar&sort=updated&tags=DEPENDENCY&tags=UI"
    )
    assert result["mods"] == [{"id": "mod-2"}]
