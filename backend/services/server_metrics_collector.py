import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List

from database import db
from services.docker_agent import DockerAgent

logger = logging.getLogger(__name__)

docker_agent = DockerAgent()

_PERIOD_DELTAS = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
}

_RESOLUTION_SECONDS = {
    "1m": 60,
    "5m": 300,
    "1h": 3600,
}


async def collect_server_metrics(
    server_id: str, container_name: str
) -> Optional[dict]:
    """Collect a single snapshot of resource metrics for *server_id*."""
    stats = await docker_agent.get_container_stats(container_name)
    if stats is None:
        logger.warning("No stats returned for server %s (%s)", server_id, container_name)
        return None

    doc = {
        "server_id": server_id,
        "timestamp": datetime.now(timezone.utc),
        "cpu_percent": stats["cpu_percent"],
        "memory_mb": stats["memory_mb"],
        "memory_limit_mb": stats["memory_limit_mb"],
        "network_rx_bytes": stats["network_rx"],
        "network_tx_bytes": stats["network_tx"],
        "player_count": 0,  # placeholder — A2S query to be wired later
        "max_players": 0,
        "uptime_seconds": 0,
    }

    await db.server_metrics.insert_one(doc)
    return doc


async def metrics_collection_loop(interval: int = 15):
    """Background loop that collects metrics for every running server.

    Follows the same async-loop pattern used by ``server_health_loop``
    in *server_health_monitor.py*.
    """
    logger.info("Metrics collection loop started (interval=%ds)", interval)

    while True:
        try:
            cursor = db.managed_servers.find(
                {"status": "running"},
                {"_id": 0},
            )
            servers = await cursor.to_list(500)

            for server in servers:
                server_id = server.get("id", "")
                server_name = server.get("name", server_id)
                container_name = server.get("container_name", server_name)

                try:
                    await collect_server_metrics(server_id, container_name)
                except Exception as exc:
                    logger.warning(
                        "Metrics collection failed for %s: %s", server_name, exc
                    )

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
    """Return the latest metrics document plus 24-hour trend indicators."""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=24))

    latest = await db.server_metrics.find_one(
        {"server_id": server_id},
        {"_id": 0},
        sort=[("timestamp", -1)],
    )

    cursor = db.server_metrics.find(
        {"server_id": server_id, "timestamp": {"$gte": cutoff}},
        {"_id": 0},
    )
    recent = await cursor.to_list(10_000)

    if not recent:
        return {
            "server_id": server_id,
            "latest": latest,
            "trend_24h": None,
        }

    avg_cpu = sum(d["cpu_percent"] for d in recent) / len(recent)
    avg_memory = sum(d["memory_mb"] for d in recent) / len(recent)
    player_counts = [d.get("player_count", 0) for d in recent]

    return {
        "server_id": server_id,
        "latest": latest,
        "trend_24h": {
            "avg_cpu_percent": round(avg_cpu, 2),
            "avg_memory_mb": round(avg_memory, 2),
            "min_player_count": min(player_counts),
            "max_player_count": max(player_counts),
            "sample_count": len(recent),
        },
    }


async def get_metrics_range(
    server_id: str, period: str = "1h", resolution: str = "raw"
) -> list:
    """Return metrics for *server_id* over *period* at the given *resolution*.

    Parameters
    ----------
    period : str
        One of ``"1h"``, ``"6h"``, ``"24h"``, ``"7d"``.
    resolution : str
        ``"raw"`` returns individual documents; ``"1m"``, ``"5m"``, or
        ``"1h"`` returns values averaged/maxed per bucket via a MongoDB
        aggregation pipeline.
    """
    delta = _PERIOD_DELTAS.get(period, timedelta(hours=1))
    cutoff = datetime.now(timezone.utc) - delta

    base_match = {"server_id": server_id, "timestamp": {"$gte": cutoff}}

    if resolution == "raw":
        cursor = db.server_metrics.find(base_match, {"_id": 0}).sort("timestamp", 1)
        return await cursor.to_list(10_000)

    bucket_seconds = _RESOLUTION_SECONDS.get(resolution)
    if bucket_seconds is None:
        logger.warning("Unknown resolution %r, falling back to raw", resolution)
        cursor = db.server_metrics.find(base_match, {"_id": 0}).sort("timestamp", 1)
        return await cursor.to_list(10_000)

    pipeline: List[Dict] = [
        {"$match": base_match},
        {"$sort": {"timestamp": 1}},
        {
            "$group": {
                "_id": {
                    "$subtract": [
                        {"$toLong": "$timestamp"},
                        {
                            "$mod": [
                                {"$toLong": "$timestamp"},
                                bucket_seconds * 1000,
                            ]
                        },
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

    cursor = db.server_metrics.aggregate(pipeline)
    return await cursor.to_list(10_000)
