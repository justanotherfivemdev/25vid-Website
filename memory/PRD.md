# 25th Infantry Division — PRD

## Status: Production Ready (Rebranded)
All features complete. All tests passing (iterations 1-9, 100%).
Fully rebranded from "Azimuth Operations Group" to "25th Infantry Division" as of March 2026.

## Core Features
- Public landing page with 25th ID branding (Tropic Lightning)
- Member authentication (JWT email/password + Discord OAuth)
- Member Hub with discussions, operations, RSVP, roster, schedule
- Admin Command Center with full CMS (site content, operations, announcements, training, gallery, users)
- Dynamic site content editable via Admin panel

## Documentation
- `README.md` — Project overview, quick start, env vars, bootstrap
- `DEPLOYMENT.md` — Full self-hosted Linux deployment guide
- `backend/.env.example` — Backend env var template

## Admin Bootstrap
```bash
python3 /app/backend/create_admin.py
```
Interactive runtime input. No hardcoded credentials.

## Content Management
All homepage content editable via Admin > Command Center.
Fallback defaults in `frontend/src/config/siteContent.js`.

## Completed Tasks
- Phase 1-5: Full-stack MilSim app (auth, admin, operations, announcements, training, gallery, discussions, roster, profiles)
- Phase 6: Discord OAuth2 integration
- Phase 7: My Schedule, set-password for Discord users, reminders
- Phase 8: Production cleanup (docs, .env.example, .gitignore)
- Phase 9: Full rebrand to 25th Infantry Division (colors, text, logo, DB content, footer disclaimer)

## Backlog
- P2: Email Notification System for announcements/operations
