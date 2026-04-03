# Arma Reforger Server Config Reference

This document is the dashboard-facing reference for how we deploy and edit Arma Reforger dedicated servers.

Primary references:

- [Bohemia: Server Config](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Config)
- [Bohemia: Server Hosting](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Hosting)
- [Bohemia: Server Management](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Management)
- [acemod/docker-reforger](https://github.com/acemod/docker-reforger)

## Dashboard Defaults

The dashboard now creates servers in two phases:

1. Deployment succeeds when the server record exists, the minimal runtime artifacts are written, and the Docker container is created.
2. Follow-up provisioning continues inside the individual server workspace.

New servers are intentionally "dashboard ready" but minimally opinionated:

- `rcon.password` is generated.
- `-logStats` is enabled so FPS and diagnostics work immediately.
- `-maxFPS` is enabled and defaults to `120`.
- Server Admin Tools bootstrap is enabled as a system-managed admin capability.
- Optional gameplay, persistence, and operating overrides are omitted until a user explicitly enables them.

## Minimal Config Shape

This is the baseline shape we target on first deployment:

```json
{
  "bindAddress": "0.0.0.0",
  "bindPort": 2001,
  "publicAddress": "",
  "publicPort": 2001,
  "a2s": {
    "address": "0.0.0.0",
    "port": 17777
  },
  "rcon": {
    "address": "0.0.0.0",
    "port": 19999,
    "password": "<generated>",
    "permission": "admin"
  },
  "game": {
    "name": "Server Name",
    "scenarioId": "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
    "maxPlayers": 32,
    "visible": true,
    "crossPlatform": true,
    "modsRequiredByDefault": true,
    "mods": []
  }
}
```

Notes:

- Bohemia's template shows `maxPlayers: 0`, while the public example uses `32`. We use `32` as the dashboard default because it is a sane starting point for hosted deployments.
- Bohemia recommends keeping `fastValidation` enabled and limiting dedicated server FPS with `-maxFPS`.
- `supportedPlatforms`, `gameProperties`, `persistence`, and `operating` are left out unless the operator chooses them.

## Startup Parameters

The dashboard manages these launch parameters by default:

- `-config <server-config.json>`
- `-maxFPS 120`
- `-logStats`

Useful optional flags from Bohemia hosting guidance:

- `-backendlog`
- `-logLevel`
- `-listScenarios`

Docker-specific note:

- Bohemia's hosting page calls out `-backendlog -nothrow -profile /home/profile` in its Linux and Docker examples.
- The `acemod/docker-reforger` image mounts config, profile, and workshop directories and updates to the latest version on restart.

## Core Fields

### Root networking

- `bindAddress`: usually leave empty or `0.0.0.0`; Bohemia warns this should normally be omitted unless the operator understands the network requirement.
- `bindPort`: default `2001`.
- `publicAddress`: usually omit and let backend detect it.
- `publicPort`: default `2001`.
- `a2s.port`: default `17777`.
- `rcon.port`: default `19999`.

### Game

- `game.name`: browser-visible server name.
- `game.password`: optional join password.
- `game.passwordAdmin`: optional in-game admin password. No spaces.
- `game.admins`: optional listed admins. IdentityIds are preferred.
- `game.scenarioId`: only one scenario is active at a time.
- `game.maxPlayers`: dashboard default `32`.
- `game.visible`: default `true`.
- `game.crossPlatform`: dashboard default `true`.
- `game.supportedPlatforms`: only set this when deliberately narrowing platform access.
- `game.modsRequiredByDefault`: official default `true`.

### Mods

- `mods[].version` is optional. If omitted, latest version is used.
- `mods[].required` inherits from `modsRequiredByDefault`.
- If `required` is `false`, Bohemia documents that the server can remove the mod with a warning if download fails.
- Server Admin Tools should remain system-managed and not appear as a mystery editable dependency.

## Optional Blocks

These sections are intentionally not pre-filled by the dashboard.

### `game.gameProperties`

Use only when the operator actually wants to override scenario behavior.

Important values from Bohemia:

- `serverMaxViewDistance`: `500..10000`, default `1600`
- `serverMinGrassDistance`: `0` or `50..150`, default `0`
- `networkViewDistance`: default `1500`
- `fastValidation`: default `true`
- `battlEye`: default `true`

### `game.persistence`

Persistence is optional and Bohemia says it is set up to work automatically for most use cases.

- `autoSaveInterval`: `0..60`, default `10`
- `hiveId`: `0..16383`, default `0`
- `databases`: named database overrides
- `storages`: named storage overrides

### `operating`

Only expose these when the operator is intentionally solving a gameplay or host-level issue.

- `lobbyPlayerSynchronise`: default `true`
- `disableCrashReporter`: default `false`
- `disableNavmeshStreaming`: array form is current; older boolean form is legacy
- `disableServerShutdown`: default `false`
- `disableAI`: default `false`
- `playerSaveTime`: default `120`
- `aiLimit`: default `-1`
- `slotReservationTimeout`: default `60`
- `joinQueue.maxSize`: default `0`

## RCON Notes

Bohemia documents:

- `rcon.password` is required for RCON to start.
- Passwords must be at least 3 characters and cannot contain spaces.
- `rcon.maxClients` range is `1..16`, default `16`.
- `permission` can be `admin` or `monitor`.
- If an RCON client exits without logout, Bohemia's management page notes the connection is de-authenticated after timeout.

## Dashboard Rules

These are the dashboard-specific conventions we should preserve:

- Treat host IPs, port allocations, Docker mounts, and runtime paths as backend-managed.
- Keep initial deployment minimal and let the server workspace own follow-up provisioning and optional config expansion.
- Surface admin tooling separately from user-selected mods.
- Prefer omitting optional config blocks instead of writing empty-but-opinionated defaults.
