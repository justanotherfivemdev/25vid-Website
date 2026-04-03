import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from database import db
from services.docker_agent import DockerAgent

logger = logging.getLogger(__name__)

docker_agent = DockerAgent()

_PERIOD_DELTAS = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

_RESOLUTION_SECONDS = {
    "1m": 60,
    "5m": 300,
    "1h": 3600,
}


def _parse_started_at(value: str | None) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def collect_server_metrics(server: dict) -> Optional[dict]:
    server_id = server.get("id", "")
    container_name = server.get("container_name") or server.get("name", server_id)
    stats = await docker_agent.get_container_stats(container_name)
    if stats is None:
        logger.warning("No stats returned for server %s (%s)", server_id, container_name)
        return None

    details = await docker_agent.inspect_container(container_name)
    started_at = _parse_started_at((details or {}).get("started_at"))
    uptime_seconds = int((datetime.now(timezone.utc) - started_at).total_seconds()) if started_at else None
    game_config = (server.get("config") or {}).get("game") or {}

    doc = {
        "server_id": server_id,
        "timestamp": datetime.now(timezone.utc),
        "cpu_percent": stats["cpu_percent"],
        "memory_mb": stats["memory_mb"],
        "memory_limit_mb": stats["memory_limit_mb"],
        "network_rx_bytes": stats["network_rx"],
        "network_tx_bytes": stats["network_tx"],
        "player_count": None,
        "max_players": game_config.get("maxPlayers"),
        "uptime_seconds": uptime_seconds,
        "fps": None,
        "ping": None,
    }

    await db.server_metrics.insert_one(doc)
    return doc


async def metrics_collection_loop(interval: int = 15):
    logger.info("Metrics collection loop started (interval=%ds)", interval)

    while True:
        try:
            servers = await db.managed_servers.find({"status": "running"}, {"_id": 0}).to_list(500)
            for server in servers:
                server_name = server.get("name", server.get("id", "unknown"))
                try:
                    await collect_server_metrics(server)
                except Exception as exc:
                    logger.warning("Metrics collection failed for %s: %s", server_name, exc)
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Metrics collection loop error: %s", exc)
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break

    logger.info("Metrics collection loop stopped")


async def get_metrics_summary(server_id: str) -> dict:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)

    latest = await db.server_metrics.find_one(
        {"server_id": server_id},
        {"_id": 0},
        sort=[("timestamp", -1)],
    )

    recent = await db.server_metrics.find(
        {"server_id": server_id, "timestamp": {"$gte": cutoff}},
        {"_id": 0},
    ).to_list(10_000)

    if not recent:
        return {"server_id": server_id, "latest": latest, "trend_24h": None}

    avg_cpu = sum(d["cpu_percent"] for d in recent) / len(recent)
    avg_memory = sum(d["memory_mb"] for d in recent) / len(recent)
    player_counts = [d.get("player_count") or 0 for d in recent]

    return {
        "server_id": server_id,
        "latest": latest,
        "trend_24h": {
            "avg_cpu_percent": round(avg_cpu, 2),
            "avg_cpu": round(avg_cpu, 2),
            "avg_memory_mb": round(avg_memory, 2),
            "avg_memory": round(avg_memory, 2),
            "min_player_count": min(player_counts),
            "max_player_count": max(player_counts),
            "sample_count": len(recent),
        },
    }


async def get_metrics_range(server_id: str, period: str = "1h", resolution: str = "raw") -> list:
    delta = _PERIOD_DELTAS.get(period, timedelta(hours=1))
    cutoff = datetime.now(timezone.utc) - delta
    base_match = {"server_id": server_id, "timestamp": {"$gte": cutoff}}

    if resolution == "raw":
        return await db.server_metrics.find(base_match, {"_id": 0}).sort("timestamp", 1).to_list(10_000)

    bucket_seconds = _RESOLUTION_SECONDS.get(resolution)
    if bucket_seconds is None:
        logger.warning("Unknown resolution %r, falling back to raw", resolution)
        return await db.server_metrics.find(base_match, {"_id": 0}).sort("timestamp", 1).to_list(10_000)

    pipeline: List[Dict] = [
        {"$match": base_match},
        {"$sort": {"timestamp": 1}},
        {
            "$group": {
                "_id": {
                    "$subtract": [
                        {"$toLong": "$timestamp"},
                        {"$mod": [{"$toLong": "$timestamp"}, bucket_seconds * 1000]},
                    ]
                },
                "timestamp": {"$first": "$timestamp"},
                "avg_cpu_percent": {"$avg": "$cpu_percent"},
                "avg_memory_mb": {"$avg": "$memory_mb"},
                "max_memory_mb": {"$max": "$memory_mb"},
                "memory_limit_mb": {"$last": "$memory_limit_mb"},
                "max_network_rx_bytes": {"$max": "$network_rx_bytes"},
                "max_network_tx_bytes": {"$max": "$network_tx_bytes"},
                "max_player_count": {"$max": "$player_count"},
                "avg_player_count": {"$avg": "$player_count"},
                "max_players": {"$max": "$max_players"},
                "sample_count": {"$sum": 1},
            }
        },
        {"$sort": {"timestamp": 1}},
        {
            "$project": {
                "_id": 0,
                "server_id": server_id,
                "timestamp": 1,
                "avg_cpu_percent": {"$round": ["$avg_cpu_percent", 2]},
                "avg_memory_mb": {"$round": ["$avg_memory_mb", 2]},
                "max_memory_mb": 1,
                "memory_limit_mb": 1,
                "max_network_rx_bytes": 1,
                "max_network_tx_bytes": 1,
                "max_player_count": 1,
                "avg_player_count": {"$round": ["$avg_player_count", 2]},
                "max_players": 1,
                "sample_count": 1,
            }
        },
    ]

    return await db.server_metrics.aggregate(pipeline).to_list(10_000)
