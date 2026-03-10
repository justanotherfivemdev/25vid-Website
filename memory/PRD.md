# Azimuth Operations Group — Product Requirements Document

## Original Problem Statement
Build a professional, immersive website for the Milsim Unit "Azimuth Operations Group" serving as both a public recruitment hub and an internal operational support platform with an admin command center.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB (motor async driver)
- **Auth:** JWT + optional Discord OAuth2

## Status: Production Ready
All features complete. All tests passing (iterations 1-8, 100%).

## Implemented Features
- Public landing page with dynamic CMS content
- JWT email/password authentication
- Discord OAuth2 (optional, conditional on backend config)
- Admin Command Center (live homepage editing)
- Operations management with advanced RSVP (attending/tentative/waitlist/capacity)
- Discussion forum with pinning, search, replies
- Member Hub with search, My Schedule, reminders
- Unit Roster (searchable, filterable)
- Full member profiles (rank, specialization, history, awards, Discord status)
- Admin member editor with CRUD for history/awards
- File uploads served via API
- Gallery and Training management
- Set-password flow for Discord-only users
- Production deployment guide

## Environment Variables
### Required (backend/.env)
- MONGO_URL, DB_NAME, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS

### Optional (backend/.env)
- DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI

### Required (frontend/.env)
- REACT_APP_BACKEND_URL

## Admin Bootstrap
```bash
python3 scripts/create_admin.py
```
Interactive, runtime password input, upsert support. No hardcoded credentials.
