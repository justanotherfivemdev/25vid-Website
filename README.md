# 25th Infantry Division — Tropic Lightning

A full-stack tactical operations platform for the 25th Infantry Division MilSim unit, featuring a public recruitment site, member operations hub, and admin command center with live content editing.

## Features

- **Public Landing Page** — Tactical recruitment site with dynamic, admin-editable content
- **Command Center (CMS)** — Admin panel for live-editing all homepage content, images, and text without code changes
- **Operations Management** — Create, manage, and track tactical operations with advanced RSVP (attending / tentative / waitlist / capacity)
- **Discussion Forum** — Categorized threads with pinning, replies, and full-text search
- **Member Hub** — Personal dashboard with schedule, reminders, search, and quick navigation
- **Unit Roster** — Searchable, filterable member directory with full profiles
- **Member Profiles** — Rank, specialization, bio, mission history, training history, awards, Discord status
- **JWT Authentication** — Email/password login and registration
- **Discord OAuth2** — Optional "Continue with Discord" login, account linking/unlinking
- **Admin Member Editor** — Full profile management with Discord prep fields
- **File Uploads** — Persistent image uploads served via the API
- **Gallery & Training** — Admin-managed media gallery and training program pages

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Tailwind CSS, Shadcn/UI |
| Backend | FastAPI (Python) |
| Database | MongoDB |
| Auth | JWT + optional Discord OAuth2 |
| File Storage | Backend-served uploads |

## Quick Start (Development)

```bash
# Backend
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Edit with your values
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend
yarn install
yarn start
```

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URL` | Yes | MongoDB connection string |
| `DB_NAME` | Yes | Database name (e.g., `azimuth_operations`) |
| `JWT_SECRET` | Yes | Strong random secret for JWT signing |
| `JWT_ALGORITHM` | Yes | `HS256` |
| `JWT_EXPIRATION_HOURS` | Yes | Token lifetime in hours (recommended: `24`) |
| `DISCORD_CLIENT_ID` | No | Discord OAuth app client ID (optional) |
| `DISCORD_CLIENT_SECRET` | No | Discord OAuth app client secret (optional) |
| `DISCORD_REDIRECT_URI` | No | Discord callback URL (optional) |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `REACT_APP_BACKEND_URL` | Yes | Backend base URL (e.g., `https://yourdomain.com`) |

## Admin Bootstrap

Create your admin account after first deploy:

```bash
cd /path/to/project
source backend/venv/bin/activate
python3 scripts/create_admin.py
```

The script accepts email, username, and password at runtime via interactive prompts. Password input is hidden. If the email already exists, the user is promoted to admin. No credentials are stored in source control.

## Content Management

All homepage content is editable live through the **Admin > Command Center** panel:
- Hero section (background image, tagline)
- About section (logo, paragraphs, quote)
- Operations section heading and descriptions
- Gallery showcase images
- Training/logistics images and text
- Section headings and footer

Default fallback values are in `frontend/src/config/siteContent.js` and are only used when no database content exists yet.

## Discord Integration (Optional)

Discord OAuth2 is fully implemented but optional. To enable:

1. Create a Discord application at https://discord.com/developers/applications
2. Under OAuth2, add your redirect URI: `https://yourdomain.com/api/auth/discord/callback`
3. Set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI` in `backend/.env`
4. Restart the backend

When enabled, users see a "Continue with Discord" button on the login page and can link/unlink Discord from their profile. Discord is never required — email/password auth always works.

## Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete self-hosting instructions covering:
- Server setup (Ubuntu, Python, Node, MongoDB, Nginx)
- Environment configuration
- Frontend build and backend service
- Nginx reverse proxy with Cloudflare SSL
- MongoDB security and backup strategy

## Project Structure

```
├── backend/
│   ├── server.py              # All API logic
│   ├── uploads/               # Persistent file storage
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # Backend configuration
├── frontend/
│   ├── src/
│   │   ├── App.js             # Routing, pages, layouts
│   │   ├── config/siteContent.js  # Default fallback content
│   │   ├── components/        # Shared components
│   │   └── pages/             # Admin + Member pages
│   ├── package.json
│   └── .env                   # Frontend configuration
├── scripts/
│   └── create_admin.py        # Production admin bootstrap
├── DEPLOYMENT.md              # Self-hosting guide
└── README.md
```
