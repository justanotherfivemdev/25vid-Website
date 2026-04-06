# 25th Infantry Division — Tropic Lightning

A full-stack tactical operations platform for the 25th Infantry Division MilSim unit, featuring a public recruitment site, member operations hub, Campaigns workflows, and admin command center with live content editing.

## Features

- Public Landing Page with admin-editable content
- Campaigns for operations/objectives visualization
- Operations Management with RSVP and capacity handling
- Discussion Forum and Intel board
- Unit Roster and detailed member profiles
- Gallery, training management, and unit history timeline
- JWT authentication and optional Discord OAuth
- Backend file uploads with API serving

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Tailwind CSS, shadcn/ui |
| Backend | FastAPI (Python) |
| Database | MongoDB |
| Auth | JWT (+ optional Discord OAuth) |
| Process | systemd + Nginx (self-hosted Linux) |

---

## Linux Self-Hosting (Production)

This project is documented for **self-hosted Linux only**.

Follow the full deployment guide:

- **`DEPLOYMENT.md`** → end-to-end Ubuntu/Debian production setup

That guide includes:

1. Package prerequisites
2. Backend and frontend setup
3. systemd service creation
4. Nginx reverse proxy
5. TLS with Let's Encrypt
6. Admin bootstrap
7. MongoDB hardening
8. Backups
9. Update/redeploy checklist for hosting parties

---

## Local Development Quick Start

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn server:app --host 0.0.0.0 --port 8001 --reload --ws-ping-interval 20 --ws-ping-timeout 20

# Frontend
cd ../frontend
cp .env.example .env
yarn install
yarn start
```

For local HTTP development, set `COOKIE_SECURE=false` in `backend/.env`.

For live Arma Reforger console/RCON stability during local testing, keep the
WebSocket ping flags above enabled. They are required by our reconnect and
heartbeat protocol.

### Local Validation Commands

```bash
# Backend unit tests
cd backend
source venv/bin/activate
pytest tests/

# Frontend production build
cd ../frontend
CI=true REACT_APP_BACKEND_URL=http://localhost:8000 REACT_APP_MAPBOX_TOKEN=pk.test yarn build
```

---

## Required Environment Variables

### Backend (`backend/.env`)

- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_ALGORITHM` (typically `HS256`)
- `JWT_EXPIRATION_HOURS`

**Production:**

- `COOKIE_SECURE=true`
- `FRONTEND_URL=https://yourdomain.com`

**Optional — Discord OAuth2:**

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`

**Optional — Valyu API (Global Threat Map intelligence):**

- `VALYU_API_KEY`
- `VALYU_CACHE_TTL_MINUTES` (default `30`)
- `VALYU_EVENT_REFRESH_MINUTES` (default `10`)
- `VALYU_RATE_LIMIT_SECONDS` (default `30`)
- `VALYU_COUNTRY_CACHE_HOURS` (default `24`)

### Frontend (`frontend/.env`)

- `REACT_APP_BACKEND_URL=https://yourdomain.com`
- `REACT_APP_MAPBOX_TOKEN` (required for Global Threat Map Globe view)
- `REACT_APP_MAP_STYLE` (optional, defaults to `mapbox://styles/mapbox/dark-v11`)
- `REACT_APP_WORLDMONITOR_URL` (**legacy/unused**; safe to omit, World Monitor is now served as a standalone app under `/worldmonitor/` and uses full-page navigation instead)

---

## Global Threat Map & World Monitor

The Global Threat Map is an integrated feature inside the Member Hub.
It provides a 3D Globe view (Mapbox) with intelligence overlays powered by [Valyu](https://www.valyu.ai) and community event data.

The **World Monitor** is a **standalone application** powered by [World Monitor \[Black Swan Edition\]](https://github.com/swatfa/worldmonitor-bayesian), a real-time global intelligence dashboard that aggregates news, markets, geopolitical data, military infrastructure, and more.

> **Important:** World Monitor is NOT a React route. It is a separate Vite/TypeScript app served by Nginx at `/worldmonitor/`. Switching between the Global Threat Map and World Monitor triggers a **full page navigation** (`window.location.href`), not React Router navigation.

The full World Monitor source code lives in the `worldmonitor/` directory (copied 1-to-1 from the upstream repo).

### Architecture

| Component | Type | Route / URL | Description |
|---|---|---|---|
| Global Threat Map | React feature (internal) | `/hub/threat-map` | 3D Globe with threat events, military bases, intel layers, timeline |
| World Monitor | Standalone Vite/TS app | `/worldmonitor/` | Real-time intelligence dashboard (GDELT, USGS, markets, geopolitical) |

Clicking "World Monitor" in the Threat Map header performs `window.location.href = '/worldmonitor/'`, which causes the browser to leave the React SPA entirely and load the standalone World Monitor app. This is intentional — React Router must **not** handle `/worldmonitor/` because it is served by Nginx from a separate build artifact.

### End-user flow

1. From the Hub, click **Global Threat Map** in the sidebar
2. The default view is the **Global Threat Map** (3D Globe) at `/hub/threat-map`
3. Use the **World Monitor** button in the header to navigate to the standalone World Monitor app at `/worldmonitor/`
4. To return to the Global Threat Map, use your browser's Back button or navigate directly to `/hub/threat-map`
5. The two apps serve different purposes:
   - **Global Threat Map**: Interactive 3D globe with threat events, military bases, intel layers, and timeline scrubbing
   - **World Monitor**: Real-time intelligence dashboard aggregating GDELT, USGS, financial markets, and geopolitical data

### Developer / hosting flow

| Route | View | Served By |
|---|---|---|
| `/hub/threat-map` | Global Threat Map (3D Globe) | React SPA (React Router) |
| `/partner/threat-map` | Partner Globe view | React SPA (React Router) |
| `/worldmonitor/` | World Monitor dashboard | Nginx (static files from `worldmonitor/dist/`) |

### Setting up World Monitor

```bash
# 1. Install World Monitor dependencies
cd worldmonitor
npm install

# 2. Start the dev server (default port 3000)
npm run dev
```

In development, the World Monitor dev server runs independently. In production, it is built as static files and served by Nginx.

### Relevant env/config values

| Variable | Location | Purpose |
|---|---|---|
| `REACT_APP_MAPBOX_TOKEN` | `frontend/.env` | Mapbox token for the Globe view |
| `REACT_APP_BACKEND_URL` | `frontend/.env` | Backend API URL (powers threat events) |

### Nginx / frontend / backend pieces

- **Frontend**: React SPA served from `frontend/build/`; Nginx `try_files` sends all non-API routes to `index.html`
- **World Monitor**: Separate Vite/TS app built to `worldmonitor/dist/`; Nginx serves it at `/worldmonitor/` with its own `try_files` fallback — this prevents the React SPA from intercepting `/worldmonitor/` requests
- **Backend**: FastAPI at `/api/*`; provides threat events, military bases, and worldmonitor data pipelines at `/api/worldmonitor/*`
- **Docker**: World Monitor is built in a separate Dockerfile stage (`worldmonitor-build`) and copied to `/usr/share/nginx/html/worldmonitor`

### How to verify after deploy

1. Navigate to `/hub/threat-map` → Global Threat Map (3D Globe) loads
2. Click **World Monitor** button → browser performs full navigation to `/worldmonitor/`, World Monitor dashboard loads
3. No blank screen or "No routes matched" error occurs
4. From World Monitor, use your browser's Back button or open `/hub/threat-map` in a new tab → Global Threat Map still loads correctly
5. Refresh browser on `/worldmonitor/` → World Monitor loads correctly (Nginx serves it)

### World Monitor API Keys (Optional)

World Monitor can connect to several external data sources. Add these to a `worldmonitor/.env` file:

| Variable | Service | Required? |
|---|---|---|
| `FINNHUB_API_KEY` | Finnhub stock/market data | Optional |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Radar outage data | Optional |
| `FRED_API_KEY` | Federal Reserve economic data | Optional |
| `ACLED_EMAIL` / `ACLED_PASSWORD` | ACLED conflict/protest data | Optional |

All data sources gracefully degrade when API keys are not configured — the dashboard still works with its free/public data feeds (GDELT, USGS earthquakes, RSS news, etc.).

See `worldmonitor/API_CONFIGURATION.md` for the full list of supported data sources.

### Production Deployment

For production, build World Monitor and serve it as static files:

```bash
cd worldmonitor
npm run build          # outputs to worldmonitor/dist/
```

Then serve the `dist/` directory at `/worldmonitor/` via Nginx. For example:

```nginx
location /worldmonitor/ {
    alias /opt/25th-id/worldmonitor/dist/;
    try_files $uri $uri/ /worldmonitor/index.html;
}
```

Nginx must serve `/worldmonitor/` **before** the React SPA catch-all, so that the browser loads the standalone World Monitor app instead of the React app's `index.html`.

---

After first deployment:

```bash
cd /opt/25th-id
source backend/venv/bin/activate
python3 scripts/create_admin.py
```

---

## Notes for Hosting Parties

- Treat `DEPLOYMENT.md` as source-of-truth.
- Keep `backend/.env` and `frontend/.env` out of source control.
- Verify post-deploy checks after every update.
- Keep regular backups of MongoDB and `/backend/uploads`.

---

## Workshop System (Arma Reforger Mod Management)

The Workshop is an integrated mod-management system inside the Server Management portal. It allows S4 (Logistics) staff to browse, search, download, organize, and manage Arma Reforger Workshop mods for game servers.

### Architecture Overview

The Arma Reforger Workshop (`reforger.armaplatform.com/workshop`) **does not expose a stable documented public API**. The panel uses a **backend proxy/parsing strategy** to retrieve live workshop data:

```
Frontend → Backend Proxy → reforger.armaplatform.com → Parse HTML → Return JSON
```

- **Backend proxy** (`backend/services/workshop_proxy.py`) sends browser-like HTTP requests to the Workshop site, parses returned HTML using BeautifulSoup/lxml, and normalizes results into structured JSON.
- **Rate limiting**: Token-bucket limiter (3 requests burst, sustained 1 request per 2 seconds) prevents abuse.
- **Short-lived caching**: Results are cached in MongoDB for 5 minutes (collection: `workshop_proxy_cache`). Caching improves performance and resilience but is **not** the only source of records — live browsing is the primary experience.
- **Graceful degradation**: If the Workshop is unreachable, the system returns partial data and allows manual mod entry.

### Workshop Browsing

- **Category browsing**: Popular, Newest, Recently Updated, Alphabetical — maps to the Workshop site's `sort` parameter.
- **Search**: By mod name or mod ID, with 400ms debounce on the frontend.
- **Pagination**: 16 results per page, matching the Workshop site's native pagination.
- **Tag extraction**: Tags are parsed from HTML where available and stored with each mod.

### Three-Tab Structure

The Workshop page is organized into three operational tabs:

| Tab | Purpose |
|---|---|
| **Workshop** | Live browsing, searching, downloading mods from the Arma Reforger Workshop |
| **Reorder** | Drag-and-drop mod load-order management with position numbers |
| **Batch** | Spreadsheet-like bulk editing of mod list (select, move, remove, inline edit) |

### Download Flow

When downloading a mod to a server:

1. The mod is added to the server's mod JSON configuration
2. All available metadata (name, author, tags, scenario IDs) is populated
3. The user is prompted: **"Include version?"**
   - If version is included → the server locks to that specific version
   - If left blank → the server will always use the latest version
4. If scenario IDs are detected, they are surfaced in the configuration

### JSON Import / Export

- **Import JSON**: Paste or upload a JSON mod list from another server. The import replaces the current mod list and records download history.
- **Export JSON**: Export the current server mod list as copyable JSON for reuse on another server.

### Scenario / Map Handling

If a mod contains scenario IDs (format: `{MODID}Missions/SomeScenario.conf`), they are detected and stored. When downloaded, scenario IDs are surfaced in the server configuration area.

### Error Flagging

Mods with active issues (tracked by the Mod Issue Engine) display a warning icon in the Workshop, Reorder, and Batch tabs. Clicking the icon shows:
- Error pattern text
- Occurrence count and confidence score
- Log excerpt evidence (if available)

### Download History

The system tracks who downloaded mods and when, providing operator context for previously used mods. This helps S4 staff understand whether a mod has been used before and who to ask about it.

### Known Limitations

- Workshop HTML parsing depends on the site's DOM structure — changes to the Workshop site may require parser updates.
- Tag extraction accuracy depends on the Workshop site exposing tags in a parseable format.
- Scenario ID detection from live browsing is limited; scenario IDs may need to be enriched from individual mod detail pages.
- The rate limiter is process-wide; multiple backend instances would need shared state for distributed rate limiting.
