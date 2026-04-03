# Arma Reforger Mod Error Catalog

This catalog defines how the dashboard should classify and explain common server-side issues.

Primary references:

- [Bohemia: Server Config](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Config)
- [Bohemia: Server Hosting](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Hosting)
- [Bohemia: Server Management](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Management)

## Classification Model

Every detection should map to one of these source categories:

- `engine`
- `config`
- `workshop-download`
- `mod-load`
- `runtime-script`
- `battleye-rcon`
- `network`
- `performance`

Each record should also preserve:

- normalized signature
- confidence score
- source streams
- affected servers
- evidence excerpts
- recommended actions
- operator verdict

## Common Error Families

### `config`

Typical signatures:

- `JSON is invalid`
- `There are errors in server config`
- `Param "#/... " has an incorrect type`
- `additional properties`

What it usually means:

- malformed JSON
- wrong field type
- outdated legacy config shape
- unsupported custom option

Recommended actions:

- validate the generated config
- compare against the official Bohemia schema
- remove legacy booleans that became arrays or objects
- retry with optional blocks removed

### `workshop-download`

Typical signatures:

- `curl_easy_perform, code: 23`
- `Failed writing received data to disk/application`
- workshop download failures
- temporary directory write failures

What it usually means:

- unwritable temp or workshop path
- broken Docker volume permissions
- full disk
- interrupted mod download

Recommended actions:

- verify profile, workshop, and temp directory write permissions
- set `-addonTempDir` to a writable location if needed
- confirm Docker volume mounts and free space

### `mod-load`

Typical signatures:

- failed to mount content
- missing or incompatible dependency
- addon removed after failed required download
- missing scenario or asset provided by a mod

What it usually means:

- bad load order
- wrong version pin
- broken dependency chain
- stale or partial workshop content

Recommended actions:

- verify dependency list
- compare required versus optional mods
- clear and re-sync the affected workshop content
- test with the minimum mod set

### `runtime-script`

Typical signatures:

- scripted exceptions
- repeated assertion or script error spam
- gameplay system init failures
- watcher regex matches against custom server-side scripts

What it usually means:

- a mod loads but fails during runtime
- mission or admin tooling script regression
- bad data flowing into a scripted system

Recommended actions:

- capture the evidence stream
- identify the mod or scenario responsible
- compare first-seen and last-seen timing with recent config changes

### `battleye-rcon`

Typical signatures:

- RCON auth failures
- missing or invalid BattlEye password
- RCON timeout behavior
- missing GameID or MasterPort messages after bad BattlEye config edits

What it usually means:

- bad RCON password
- incorrect BattlEye config edits
- too many RCON clients connected
- stale connections that were not logged out cleanly

Recommended actions:

- verify `rcon.password`, `rcon.permission`, and `rcon.maxClients`
- avoid overwriting existing BattlEye config content
- recycle stale clients and re-test with one operator session

### `network`

Typical signatures:

- backend registration failures
- query port access issues
- external connection failures
- browser-visible but unjoinable server state

What it usually means:

- wrong public address
- port forwarding mismatch
- interface binding mistake
- host firewall issue

Recommended actions:

- verify `publicAddress`, `publicPort`, `bindAddress`, and forwarded UDP ports
- prefer leaving address fields unset unless there is a specific routing need

### `performance`

Typical signatures:

- sustained low FPS from `logStats`
- CPU or memory threshold breaches
- repeated threshold watcher alerts
- watchdog degradation without hard failure

What it usually means:

- excessive AI or navmesh load
- too many mods
- host saturation
- poor max FPS tuning

Recommended actions:

- confirm `-maxFPS` is set
- review AI-heavy or large-map mods
- test with fewer optional systems enabled
- inspect memory growth and network throughput together

### `engine`

Typical signatures:

- generic startup or shutdown failures
- engine-side fatal errors not attributable to a mod
- crash-loop patterns

What it usually means:

- core runtime instability
- host/runtime mismatch
- non-mod server fault

Recommended actions:

- capture engine and backend evidence together
- separate core runtime failures from mod or config failures

## False Positives

Operators should be able to mark detections and mod issues as:

- `false_positive` when the signature is expected behavior
- `monitoring` when the pattern is real but not actionable yet
- `resolved` when remediation is complete
- `active` when the issue should stay visible

Good false-positive examples:

- a known restart cycle during first-boot mod download
- an intentionally optional mod being removed with warning
- a log watcher pattern that matched expected admin activity

## Evidence Rules

Every issue page should show enough context to answer:

1. What happened?
2. Which stream proved it?
3. Is it core server, config, BattlEye/RCON, or mod-related?
4. Has the operator already reviewed it?

That evidence is one of the main differentiators for the dashboard, so the catalog should favor precise attribution over noisy keyword matching.
