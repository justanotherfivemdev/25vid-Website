# 25th Infantry Division — Tropic Lightning

A full-stack tactical operations platform for the 25th Infantry Division MilSim unit, featuring a public recruitment site, member operations hub, Conflict Map workflows, and admin command center with live content editing.

## Features

- Public Landing Page with admin-editable content
- Conflict Map for operations/objectives visualization
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
cp .env.example .env
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd ../frontend
yarn install
yarn start
```

For local HTTP development, set `COOKIE_SECURE=false` in `backend/.env`.

---

## Required Environment Variables

### Backend (`backend/.env`)

- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_ALGORITHM` (typically `HS256`)
- `JWT_EXPIRATION_HOURS`

Common production recommendation:

- `COOKIE_SECURE=true`
- `FRONTEND_URL=https://yourdomain.com`

### Frontend (`frontend/.env`)

- `REACT_APP_BACKEND_URL=https://yourdomain.com`

Optional map tuning:

- `REACT_APP_MAP_TILE_URL`
- `REACT_APP_MAP_ATTRIBUTION`
- `REACT_APP_DEFAULT_MAP_CENTER_LAT`
- `REACT_APP_DEFAULT_MAP_CENTER_LNG`
- `REACT_APP_DEFAULT_MAP_ZOOM`

---

## Admin Bootstrap

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
