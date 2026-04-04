import asyncio
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

import services.server_runtime_host as runtime_host
import services.server_watchers as server_watchers
from services.server_runtime_host import get_server_runtime_host, reset_server_runtime_host_cache
from services.server_watchers import (
    ESSENTIAL_WATCHER_TEMPLATES,
    _threshold_triggered,
    build_essential_watchers,
    ensure_default_watchers,
)


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _limit):
        return list(self._docs)


class _FakeCollection:
    def __init__(self):
        self.docs = []

    def find(self, query, projection=None):
        results = []
        for doc in self.docs:
            if any(doc.get(key) != value for key, value in query.items()):
                continue
            if not projection:
                results.append(dict(doc))
                continue

            projected = {}
            for key, include in projection.items():
                if key == "_id" or not include:
                    continue
                if key in doc:
                    projected[key] = doc[key]
            results.append(projected)
        return _FakeCursor(results)

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


def teardown_function():
    reset_server_runtime_host_cache()


def test_get_server_runtime_host_prefers_explicit_env(monkeypatch):
    monkeypatch.setenv("SERVER_RUNTIME_HOST", "10.20.30.40")
    reset_server_runtime_host_cache()

    assert get_server_runtime_host() == "10.20.30.40"


def test_get_server_runtime_host_uses_first_resolvable_candidate(monkeypatch):
    monkeypatch.delenv("SERVER_RUNTIME_HOST", raising=False)
    monkeypatch.setattr(runtime_host, "_resolves", lambda host: host == "host.docker.internal")
    reset_server_runtime_host_cache()

    assert get_server_runtime_host() == "host.docker.internal"


def test_get_server_runtime_host_falls_back_to_loopback(monkeypatch):
    monkeypatch.delenv("SERVER_RUNTIME_HOST", raising=False)
    monkeypatch.setattr(runtime_host, "_resolves", lambda _host: False)
    reset_server_runtime_host_cache()

    assert get_server_runtime_host() == "127.0.0.1"


def test_build_essential_watchers_covers_admin_rcon_mod_and_performance():
    watchers = build_essential_watchers("srv-ops", created_by="tester")
    template_keys = {watcher.template_key for watcher in watchers}

    assert len(watchers) == len(ESSENTIAL_WATCHER_TEMPLATES)
    assert {
        "essential-battleye-rcon",
        "essential-admin-actions",
        "essential-mod-failures",
        "essential-low-fps",
    }.issubset(template_keys)
    assert all(watcher.system_managed for watcher in watchers)
    assert all(watcher.enabled and watcher.notify for watcher in watchers)
    assert all(watcher.recommended_actions for watcher in watchers)

    low_fps = next(watcher for watcher in watchers if watcher.template_key == "essential-low-fps")
    assert low_fps.metric == "server_fps"
    assert low_fps.comparison == "lt"
    assert low_fps.threshold == 20


def test_ensure_default_watchers_is_idempotent(monkeypatch):
    fake_collection = _FakeCollection()
    monkeypatch.setattr(server_watchers, "db", SimpleNamespace(server_watchers=fake_collection))

    created_first = asyncio.run(ensure_default_watchers("srv-seed", created_by="tester"))
    created_second = asyncio.run(ensure_default_watchers("srv-seed", created_by="tester"))

    assert len(created_first) == len(ESSENTIAL_WATCHER_TEMPLATES)
    assert created_second == []
    assert len(fake_collection.docs) == len(ESSENTIAL_WATCHER_TEMPLATES)


def test_threshold_triggered_supports_greater_and_less_than_comparisons():
    assert _threshold_triggered(10, 9, "gt") is True
    assert _threshold_triggered(9, 9, "gte") is True
    assert _threshold_triggered(8, 9, "lt") is True
    assert _threshold_triggered(9, 9, "lte") is True
    assert _threshold_triggered(9, 9, "gt") is False
    assert _threshold_triggered(10, 9, "lt") is False
