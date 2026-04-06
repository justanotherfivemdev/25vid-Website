# World Monitor — Source Consolidation

## Single Source of Truth

All World Monitor application code lives in:

```
frontend/src/features/worldmonitor/
```

This directory is used by **both** deployment modes:

| Mode | Entry point | How it works |
|------|-------------|--------------|
| **Embedded (production)** | `frontend/src/features/worldmonitor/main.ts` | `mountWorldMonitor()` is called by the React SPA via `WorldMonitorEmbed.jsx` |
| **Standalone (local dev)** | `worldmonitor/src/main.ts` | Bootstraps `new App('app')` directly; uses its own Vite dev server with API proxies |

The standalone `worldmonitor/` project's `vite.config.ts` and `tsconfig.json`
resolve `@/` to `../frontend/src/features/worldmonitor/`, so all imports point
to the shared source.

## Development

- **To work on World Monitor code**: edit files in `frontend/src/features/worldmonitor/`.
- **To run standalone dev server** (with local API proxies): `cd worldmonitor && npm run dev`.
- **Never edit files in `worldmonitor/src/`** other than `main.ts` — they are
  legacy copies that will be removed once the migration is fully verified.

## Legacy Files

`worldmonitor/src/` still contains a copy of the old source. These files are
**no longer used** by either build. They are kept temporarily for reference and
will be cleaned up in a future PR.
