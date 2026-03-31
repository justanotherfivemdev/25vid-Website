# WorldMonitor Integration Guide

Complete documentation for the WorldMonitor overlay system integration with the
25th Infantry Division platform.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Setup Guide](#setup-guide)
3. [Local Development](#local-development)
4. [Data Pipeline Reference](#data-pipeline-reference)
5. [Overlay System Breakdown](#overlay-system-breakdown)
6. [Admin Guide](#admin-guide)
7. [Deployment Guide](#deployment-guide)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Globe View   │  │  Overlay View    │  │  Intel Layer     │  │
│  │  (3D Mapbox)  │  │  (WorldMonitor   │  │  Panel           │  │
│  │              │  │   iframe embed)  │  │  (Layer toggles) │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
│         │                   │                     │             │
│         └───────────────────┴─────────────────────┘             │
│                             │                                   │
│                    Zustand State Store                           │
│              (threatMapStore.js — shared state)                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP / REST
┌─────────────────────────────┴───────────────────────────────────┐
│                       BACKEND (FastAPI)                          │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              WorldMonitor Routes (/api/worldmonitor/*)     │ │
│  │  /gdelt  /earthquakes  /weather  /economic  /predictions   │ │
│  │  /protests  /status                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Existing Routes                                │ │
│  │  /threat-events  /military-bases  /adsb/*  /map/overlays   │ │
│  │  /admin/events/{id}/override  /community-events            │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Background Ingestion Service                   │ │
│  │  Valyu → GDELT → USGS → ACLED → OpenAI (periodic cycle)   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                         DATA LAYER                              │
│                                                                 │
│  MongoDB                    External APIs                       │
│  ├─ external_events         ├─ GDELT (no auth)                  │
│  ├─ community_events        ├─ USGS Earthquakes (no auth)       │
│  ├─ wm_cache                ├─ NWS Weather (no auth)            │
│  ├─ valyu_cache             ├─ Polymarket (no auth)             │
│  └─ map_events              ├─ FRED (API key)                   │
│                             ├─ ACLED (API key + email)          │
│                             ├─ OpenSky Network (OAuth2)         │
│                             ├─ ADSB.lol / Airplanes.live        │
│                             ├─ Valyu (API key)                  │
│                             └─ OpenAI (API key)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
External APIs → Backend Ingestion → MongoDB → Backend Routes → Frontend
     ↓                                                           ↓
  (periodic)                                              Globe / Overlay
  background                                              map rendering
  tasks
```

1. **Background ingestion** runs on a configurable interval (default: every
   `VALYU_EVENT_REFRESH_MINUTES` minutes).
2. Each cycle processes: Valyu, GDELT, USGS, ACLED, and OpenAI sources.
3. Events are deduplicated by `content_hash` and stored in `external_events`.
4. Frontend fetches via `POST /api/threat-events` (hybrid: community + external).
5. WorldMonitor overlay runs as a standalone Vite app embedded via iframe.

---

## Setup Guide

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **MongoDB** ≥ 6.0

### 1. Installing MongoDB

```bash
# macOS (Homebrew)
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0

# Ubuntu/Debian
sudo apt-get install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# Docker
docker run -d -p 27017:27017 --name mongo mongo:7
```

### 2. Obtaining API Keys

| Service | URL | Required? |
|---------|-----|-----------|
| Mapbox | https://account.mapbox.com/ | **Yes** (map rendering) |
| Valyu | https://platform.valyu.ai | Optional (threat intel) |
| OpenAI | https://platform.openai.com/api-keys | Optional (research agent) |
| OpenSky | https://opensky-network.org/ | Optional (military aircraft) |
| FRED | https://fred.stlouisfed.org/docs/api/api_key.html | Optional (economic data) |
| ACLED | https://developer.acleddata.com/ | Optional (protest data) |
| Finnhub | https://finnhub.io/ | Optional (worldmonitor stock data) |

### 3. Configuring Environment Variables

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — set at minimum: MONGO_URL, DB_NAME, JWT_SECRET, JWT_ALGORITHM

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env — set: REACT_APP_BACKEND_URL, REACT_APP_MAPBOX_TOKEN

# WorldMonitor (optional, for standalone development)
cp worldmonitor/.env.example worldmonitor/.env
# Edit worldmonitor/.env — set: FINNHUB_API_KEY, FRED_API_KEY
```

---

## Local Development

### Running the Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start the API server
uvicorn server:app --reload --port 8001
```

The backend starts background ingestion automatically. Check logs for:
```
Background ingestion service started
GDELT ingestion: X new articles stored
Earthquake ingestion: X new events stored
```

### Running the Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm start
```

Opens at http://localhost:3000. The Globe view is the default; toggle to Overlay
view using the MapViewToggle button.

### Running the WorldMonitor Overlay (standalone)

```bash
cd worldmonitor
npm install
npm run dev
```

Opens at http://localhost:5173. Set `REACT_APP_WORLDMONITOR_URL=http://localhost:5173`
in `frontend/.env` to embed it in the Overlay view.

### Running Ingestion Jobs Manually

The backend exposes these endpoints for manual data refresh:

```bash
# Check pipeline status
curl http://localhost:8001/api/worldmonitor/status

# Fetch GDELT intelligence
curl http://localhost:8001/api/worldmonitor/gdelt

# Fetch earthquakes
curl http://localhost:8001/api/worldmonitor/earthquakes

# Fetch weather alerts
curl http://localhost:8001/api/worldmonitor/weather

# Fetch economic data (requires FRED_API_KEY)
curl http://localhost:8001/api/worldmonitor/economic

# Fetch prediction markets
curl http://localhost:8001/api/worldmonitor/predictions

# Fetch protest data (requires ACLED credentials)
curl http://localhost:8001/api/worldmonitor/protests
```

---

## Data Pipeline Reference

### Pipeline Architecture

| Pipeline | Source | Auth | Cache TTL | Ingestion |
|----------|--------|------|-----------|-----------|
| GDELT Intel | GDELT DOC API | None | 5 min | Background + on-demand |
| Earthquakes | USGS GeoJSON | None | 5 min | Background + on-demand |
| Weather | NWS Alerts API | None | 5 min | On-demand only |
| Economic | FRED API | API Key | 60 min | On-demand only |
| Predictions | Polymarket API | None | 5 min | On-demand only |
| Protests | ACLED API | Token + Email | 10 min | Background + on-demand |
| Threat Intel | Valyu API | API Key | Configurable | Background |
| Aircraft | OpenSky + ADSB.lol | OAuth2 / None | 15 sec | On-demand |
| Research | OpenAI API | API Key | Configurable | Background |

### GDELT Intelligence Topics

The GDELT pipeline monitors 6 intelligence areas:
1. **Military Activity** — deployments, airstrikes, troop movements
2. **Cyber Threats** — ransomware, breaches, hacking campaigns
3. **Nuclear** — weapons tests, uranium enrichment, warheads
4. **Sanctions** — embargoes, trade restrictions
5. **Intelligence** — espionage, surveillance, covert operations
6. **Maritime Security** — piracy, naval operations, shipping lanes

### FRED Economic Indicators

| Series | Description |
|--------|-------------|
| WALCL | Federal Reserve Total Assets |
| UNRATE | Unemployment Rate |
| CPIAUCSL | Consumer Price Index |
| DGS10 | 10-Year Treasury Yield |
| DTWEXBGS | Trade-Weighted US Dollar |
| VIXCLS | VIX Volatility Index |
| T10Y2Y | Yield Curve (10Y-2Y spread) |

---

## Overlay System Breakdown

### Layer System

The Intel Layer Panel provides 9 toggleable intelligence layers:

| Layer | Category | Data Source | Color |
|-------|----------|-------------|-------|
| Conflicts & Security | conflict, terrorism, piracy, crime | Valyu, GDELT, Community | Red (#ef4444) |
| Military Activity | military, bases, deployments | Valyu, GDELT, OpenSky | Gold (#FFD700) |
| Infrastructure & Cyber | pipelines, grids, cyber | Valyu, GDELT | Amber (#f59e0b) |
| Economic & Trade | markets, sanctions, commodities | FRED, Polymarket | Green (#22c55e) |
| Diplomatic & Political | summits, treaties, tensions | Valyu, GDELT | Purple (#a78bfa) |
| Environmental & Health | disasters, climate, pandemics | Valyu, GDELT | Teal (#14b8a6) |
| Flights & Aviation | military aircraft, FAA delays | OpenSky, ADSB.lol | Sky Blue (#38bdf8) |
| Seismic Activity | earthquakes, tsunamis | USGS | Orange (#f97316) |
| Weather Alerts | severe weather, storms | NWS | Cyan (#06b6d4) |

### Dual Map System

- **Globe View**: 3D Mapbox with `projection="globe"`, shows threat markers,
  military bases, ADS-B aircraft, operations, and intel.
- **Overlay View**: Embeds the WorldMonitor dashboard via iframe, providing
  D3.js-based intelligence visualization with 20+ data layers.

### Theme

All UI elements follow the 25VID brand palette:
- **Tropic Red**: `#C8102E`
- **Tropic Gold**: `#FFD700`
- **Background**: Dark command-center aesthetic (`#050a14`, `#0a0f0a`)

---

## Admin Guide

### Managing Intelligence

Admins can override any event (community or external):

```bash
PUT /api/admin/events/{event_id}/override
{
  "admin_description": "Updated assessment...",
  "admin_source": "HUMINT verified",
  "credibility": "confirmed"
}
```

The original data is preserved; overrides are stored as `admin_description`,
`admin_source`, etc. End users see the overridden values.

### Injecting Custom Intelligence

Create community events as admin:

```bash
POST /api/community-events
{
  "title": "Custom Intel Report",
  "summary": "Assessment text...",
  "category": "military",
  "threatLevel": "high",
  "location": { "latitude": 33.0, "longitude": 44.0, "placeName": "Baghdad", "country": "Iraq" },
  "event_nature": "real"
}
```

### Controlling Overlays

- Intel briefings with `visibility_scope: "admin_only"` are hidden from members.
- Community events with `visible: false` or `approved: false` are hidden.
- Admins can modify `credibility` values: `unconfirmed`, `possible`,
  `probable`, `confirmed`.

### End-User Restrictions

End users:
- **Cannot** edit, delete, or override intelligence events
- **Cannot** inject custom data
- **Can only** view approved, visible events
- **Can** toggle layer visibility (client-side only, does not affect data)

---

## Deployment Guide

### Production Setup

1. **Docker Compose** (recommended):
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with production values
   docker-compose up -d
   ```

2. **Standalone**:
   ```bash
   # Backend
   cd backend && pip install -r requirements.txt
   uvicorn server:app --host 0.0.0.0 --port 8000

   # Frontend (build static)
   cd frontend && npm run build
   # Serve build/ via Nginx

   # WorldMonitor (build static)
   cd worldmonitor && npm run build
   # Serve dist/ via Nginx or set REACT_APP_WORLDMONITOR_URL
   ```

### Scaling Ingestion Pipelines

- Increase `VALYU_EVENT_REFRESH_MINUTES` to reduce API load.
- Set `MAX_VALYU_QUERIES_PER_CYCLE` to control Valyu queries per cycle.
- GDELT, USGS, and NWS are free APIs with no rate limits.
- FRED has no rate limit but data updates infrequently (hourly cache).
- ACLED has a 10 req/min limit; the 10-min cache respects this.

### Nginx Configuration

See `nginx-production.conf` for the production Nginx config. Key paths:
- `/` → Frontend static files
- `/api/` → Backend proxy pass
- `/worldmonitor/` → WorldMonitor static files (if self-hosted)

---

## Troubleshooting

### WorldMonitor overlay shows "Not Configured"
Set `REACT_APP_WORLDMONITOR_URL` in `frontend/.env` and restart.

### No threat events appearing
1. Check `curl http://localhost:8001/api/worldmonitor/status` for pipeline health.
2. Ensure MongoDB is running and `MONGO_URL` is correct.
3. Check backend logs for ingestion errors.

### ADS-B aircraft not showing
1. Enable the "Show ADS-B" toggle in ThreatMapControls.
2. Check that ADSB.lol / Airplanes.live APIs are reachable.
3. For OpenSky data, set `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET`.

### Economic data empty
Set `FRED_API_KEY` in `backend/.env`. Register at https://fred.stlouisfed.org/.

### Protest data empty
Set both `ACLED_ACCESS_TOKEN` and `ACLED_EMAIL` in `backend/.env`.
