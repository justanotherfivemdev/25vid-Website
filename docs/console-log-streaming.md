# Console Log Streaming Architecture & Troubleshooting

## Overview

The Console module provides real-time server log streaming via WebSocket. It
merges three independent log sources into a single unified stream:

| Source | Description | Backend pump |
|--------|-------------|--------------|
| **Docker** | Container stdout/stderr via Docker API | `pump_docker()` |
| **Profile files** | Log files in the server's profile directory (`console*.log`, `backend*.log`, `*.rpt`) | `pump_profile_files()` |
| **RCON events** | Admin actions stored in the database | `pump_rcon_events()` |

All three run concurrently. Entries are merged, sorted by timestamp, and
broadcast to every connected WebSocket client through a shared fan-out session
with a ring buffer.

## Architecture

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Docker API   │   │ Profile Dir  │   │  MongoDB     │
│ (container   │   │ (file tail)  │   │  (RCON log   │
│  log stream) │   │              │   │   events)    │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       ▼                  ▼                  ▼
  pump_docker()     pump_profile_files()  pump_rcon_events()
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                   asyncio.Queue (1024)
                          │
                          ▼
              stream_server_log_entries()
                          │
                          ▼
              _StreamSession (ring buffer: 1500)
                          │
            ┌─────────────┼──────────────┐
            ▼             ▼              ▼
      Subscriber 1   Subscriber 2   Subscriber N
      (WS client)    (WS client)    (WS client)
```

## WebSocket Protocol

### Connection URL

```
ws[s]://<host>/api/ws/servers/<server_id>/logs?tail=500
```

**Query parameters:**

| Param | Description | Default |
|-------|-------------|---------|
| `tail` | Number of initial history lines | `500` |
| `since_seq` | Sequence number for reconnect backfill | — |
| `since` | Unix or ISO timestamp (legacy) | — |
| `token` | JWT auth token (alternative to cookie) | — |

### Message Types

**Backend → Client:**

| Type | Fields | Description |
|------|--------|-------------|
| `status` | `state`, `server_id`, `count`, `backfill_count`, `last_seq`, `sources` | Connection lifecycle |
| `log` | `cursor`, `seq`, `timestamp`, `line`, `raw`, `source`, `stream` | Log entry |
| `heartbeat` | `seq`, `subscriber_count` | Keep-alive (every 30s) |
| `error` | `code`, `message` | Error notification |

**Status lifecycle:** `connected` → `backfilling` → `live`

The `live` status message includes a `sources` object showing which log sources
are available:

```json
{
  "type": "status",
  "state": "live",
  "sources": {
    "docker":  {"available": true},
    "profile": {"available": false, "reason": "path_not_found"},
    "rcon":    {"available": true, "has_events": false}
  }
}
```

### Close Codes

| Code | Meaning | Retriable? |
|------|---------|------------|
| `4001` | Authentication required | No |
| `4003` | Insufficient permissions | No |
| `4004` | Server not found | No |
| `4005` | Container not found | No |
| `4006` | Server not running | No |
| `1011` | Internal server error | Yes |
| Other | Transient failure | Yes |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKER_SOCKET_PATH` | `unix:///var/run/docker.sock` | Docker daemon socket |
| `SERVER_DATA_ROOT` | `<backend>/server-data` | Root for server data directories |

## Troubleshooting

### "Reconnecting to live stream" (connection cycling)

**Check 1: Nginx WebSocket proxy**

The reverse proxy must forward WebSocket upgrade headers. Verify:

```nginx
location /api {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_read_timeout 86400;  # Must be long for WebSocket
}
```

A short `proxy_read_timeout` (e.g. 90s) will cause Nginx to close the
connection after the timeout, triggering reconnect loops.

**Check 2: Browser DevTools**

Open Network → WS tab and look at the close code. The status bar in the
Console UI also shows the close code when reconnecting.

**Check 3: Backend logs**

Look for `ws_console.connected` or `ws_console.rejected` entries:

```
ws_console.auth_failed server=abc reason=no_token
ws_console.rejected server=abc reason=not_running status=stopped
```

### "No merged logs available yet"

This means the WebSocket connected successfully but no log entries arrived.
Check the source status indicators in the Console UI status bar. Common causes:

**Docker source unavailable:**
- Docker socket not mounted: Set `DOCKER_SOCKET_PATH` or mount
  `/var/run/docker.sock` into the backend container
- Container name mismatch: Verify `container_name` in server settings matches
  the actual Docker container name (`docker ps`)
- Container not running: The server may be starting or stopped

**Profile files unavailable:**
- No profile path: Set `profile_path` in server settings to the server's
  profile directory
- Path does not exist: Verify the path exists on the filesystem
- No log files: The server may not have generated log files yet

**RCON events unavailable:**
- RCON events are optional and may have no entries if RCON hasn't been used

### All sources unavailable

If Docker, profile files, and RCON events are all unavailable, the Console will
show "No merged logs available yet" with diagnostic details about each source.

Ensure at least one source is configured:

1. **Docker**: Mount the Docker socket and verify the container name
2. **Profile files**: Set the `profile_path` to a directory containing log files
3. **RCON**: Use the RCON console to generate events

## Key Files

| File | Purpose |
|------|---------|
| `backend/services/server_logs.py` | Log aggregation, pump tasks, source probing |
| `backend/services/log_streamer.py` | Shared stream sessions, ring buffer, fan-out |
| `backend/services/docker_agent.py` | Docker API facade |
| `backend/routes/servers.py` | WebSocket handler (`ws_server_logs`) |
| `frontend/src/pages/admin/servers/modules/ConsoleModule.jsx` | React console UI |
| `frontend/src/utils/serverRealtime.js` | WebSocket URL builder |
| `frontend/nginx.conf` | Docker Nginx config (WebSocket proxy) |
| `nginx-production.conf` | Production Nginx config (WebSocket proxy) |
