# RCON Setup & Troubleshooting Guide

## Overview

The 25th VID panel uses BattlEye RCON (BERCon) over UDP to communicate with
Arma Reforger game-server containers.  The backend sends UDP packets from the
host machine to the published RCON port on each Docker container.

## Architecture

```
┌─────────────────┐      UDP       ┌───────────────────────┐
│  Backend         │  ──────────►  │  Docker Container      │
│  (rcon_bridge)   │               │  (Reforger Server)     │
│                  │               │                        │
│  host: runtime   │               │  RCON listens on       │
│  port: ports.rcon│               │  0.0.0.0:<RCON_PORT>   │
└─────────────────┘               └───────────────────────┘
```

The backend resolves the host via `get_server_runtime_host()`:
1. Checks `SERVER_RUNTIME_HOST` environment variable
2. Falls back to `host.docker.internal` (if resolvable)
3. Falls back to `127.0.0.1`

## Prerequisites

### 1. RCON Password Must Be Set

Each server needs an RCON password in its config.  The panel auto-generates one
during provisioning, but if provisioning failed or the config was cleared, RCON
will report "disabled".

**Fix:** Go to **Server Settings → RCON → RCON Password** and set a strong
password, then save and restart the server.

### 2. Firewall Must Allow RCON UDP Ports

RCON uses **UDP** (not TCP).  The default RCON port base is `19999` and
increments by `SERVER_PORT_BLOCK_SIZE` (default `10`) for each server.

Run the included firewall script to open all required ports:

```bash
sudo ./scripts/authorize-ports.sh          # opens for 5 servers
sudo ./scripts/authorize-ports.sh 10       # opens for 10 servers
```

Or manually open ports with `ufw`:

```bash
sudo ufw allow 19999:20039/udp comment "RCON ports"
```

### 3. Docker Must Publish RCON Ports

The orchestrator publishes RCON ports as UDP when creating containers.  Verify
with:

```bash
docker inspect <container_name> --format='{{json .NetworkSettings.Ports}}'
```

You should see an entry like:

```json
{ "19999/udp": [{ "HostIp": "0.0.0.0", "HostPort": "19999" }] }
```

If the port is not published, the container was created with an older config.
Delete and re-provision the server from the panel.

### 4. SERVER_RUNTIME_HOST (Dockerized Backend Only)

If the backend itself runs inside a Docker container (not on the bare host),
it needs `SERVER_RUNTIME_HOST=host.docker.internal` (or the actual host IP) to
reach the published ports on the Docker host.

Set this in your backend `.env` or `docker-compose.yml`:

```yaml
environment:
  SERVER_RUNTIME_HOST: host.docker.internal
```

On Linux, also add this to the backend container:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

## Troubleshooting Checklist

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| RCON shows "disabled" | No RCON password configured | Set password in Server Settings → RCON |
| RCON shows "unavailable" / timed out | Firewall blocking UDP | Run `authorize-ports.sh` or open ports manually |
| RCON shows "unavailable" / timed out | Port not published by Docker | Re-provision the server |
| RCON shows "unavailable" / timed out | Backend can't reach Docker host | Set `SERVER_RUNTIME_HOST` env var |
| RCON shows "auth_failed" | Password mismatch | Ensure Server Settings RCON password matches what the container was started with; restart after changing |
| WebSocket disconnects immediately | Auth cookie missing | Ensure you are logged in; check browser console for 4001 close code |
| WebSocket disconnects immediately | Permission denied | Check user role has `MANAGE_SERVERS` permission (close code 4003) |
| Commands time out after 15s | Server process crashed | Check Console tab for crash/error logs |

## Verifying RCON Connectivity

### From the host machine

```bash
# Install ncat if not present
sudo apt install ncat -y

# Send a raw BattlEye login packet (advanced)
# Or simply use the panel's RCON tab — the "Retry" button re-probes status
```

### From the panel

1. Navigate to the server workspace
2. Click the **RCON** tab
3. The status bar shows the current RCON state
4. Click **Retry** to re-probe
5. If status shows "BattlEye RCON is connected", send a command like `#status`

## Port Allocation Reference

| Resource | Default Base | Env Variable | Protocol |
|----------|-------------|-------------|----------|
| Game     | 2001        | `SERVER_PORT_BASE_GAME`  | UDP |
| Query    | 17777       | `SERVER_PORT_BASE_QUERY` | UDP |
| RCON     | 19999       | `SERVER_PORT_BASE_RCON`  | UDP |

Each additional server adds `SERVER_PORT_BLOCK_SIZE` (default: 10) to each base.

## Quick Setup Script

For a quick one-shot setup, run:

```bash
sudo ./scripts/setup-rcon.sh
```

This script validates the environment, opens firewall ports, and checks Docker
container port bindings.
