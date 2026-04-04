# Arma Reforger Logging And Observability

This guide describes how the dashboard should collect, merge, and reason about server telemetry.

Primary references:

- [Bohemia: Server Hosting](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Hosting)
- [Bohemia: Server Config](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Config)
- [Bohemia: Server Management](https://community.bohemia.net/wiki/Arma_Reforger%3AServer_Management)
- [acemod/docker-reforger](https://github.com/acemod/docker-reforger)

## Log Sources We Merge

The dashboard now treats logs as one merged timeline made from:

- Docker stdout and stderr
- profile console logs
- backend log files created by `-backendlog`
- engine or `.rpt` style output discovered in the profile tree
- RCON command and response events recorded by the dashboard

The console should display `source` labels so operators can tell whether a line came from:

- `docker`
- `console`
- `backend`
- `engine`
- `rcon`

## Required Runtime Flags

These should stay enabled on managed deployments:

- `-logStats`
- `-maxFPS`
- `-backendlog`

Why:

- Bohemia explicitly recommends limiting `-maxFPS` for dedicated hosting.
- Bohemia's hosting page calls out `logStats` as the way to log server FPS.
- `-backendlog` gives us better diagnostics than Docker-only output.

## Filesystem Expectations

The official hosting guidance and the `acemod/docker-reforger` image both reinforce the same directory model:

- config directory mounted into `/reforger/Configs`
- profile directory mounted into `/home/profile`
- workshop directory mounted into `/reforger/workshop`

For hosted servers, treat the profile directory as the primary evidence location for:

- live console output
- backend logs
- generated support files
- SAT-related runtime artifacts

## Console Behavior

The console experience should follow these rules:

1. Load recent merged history on open.
2. Switch to websocket streaming for live updates.
3. Deduplicate by stable cursors so reconnects do not replay lines as new output.
4. Keep the console stream independent from general workspace refresh.

The server workspace itself should no longer re-fetch the full server document on a timer. Only the lightweight summary should poll, while the console stays live on websocket.

## Metrics Behavior

Metrics should be collected without harsh full-page refresh:

- Overview and Metrics modules poll only their own summary and timeseries endpoints.
- Server FPS should be derived from merged logs, not Docker-only logs.
- Sparse data should not draw misleading charts. Show stat states until a series is usable.

## RCON Observability

RCON transport remains separate from console transport, but RCON activity should be mirrored into the console timeline as evidence:

- command sent
- response received
- source label preserved as `rcon`

This gives us:

- better operator context
- better reports
- better false-positive review for watcher detections

Bohemia's management page also notes that RCON clients should log out cleanly; otherwise the server keeps the connection alive until timeout.

## Docker And Mod Download Notes

Bohemia's Docker hosting example calls out an important workshop failure mode:

- `Curl error=Failed writing received data to disk/application`
- `error curl_easy_perform, code: 23`

When this appears during large mod downloads:

- verify the container has a writable temp location
- consider using `-addonTempDir` to a writable path
- confirm the mounted workshop/profile paths are healthy

These should be classified as `workshop-download` issues, not generic mod-load failures.

## Watchers And Detections

Watchers should evaluate:

- health state changes
- log regex matches
- metric threshold breaches

Detections should store:

- raw evidence
- source category
- source streams
- confidence
- operator verdict

Allowed verdicts:

- `active`
- `monitoring`
- `resolved`
- `false_positive`

## Operator Workflow

Recommended flow:

1. Open Console to confirm whether the issue is coming from Docker, backend, engine, or RCON.
2. Check Metrics for FPS, player, CPU, memory, and network drift.
3. Review Watchers for recurring patterns.
4. Review Reports for historical evidence and repeated signatures.
5. Mark detections or mod issues as false positives when the evidence proves they are benign.

## Future Guardrails

Keep these implementation rules:

- Never let full-page polling drive the console.
- Never let logs, metrics, and diagnostics parse different sources for the same server.
- Prefer source-aware evidence over keyword-only matching.
- Preserve stable cursors across reconnects whenever possible.
