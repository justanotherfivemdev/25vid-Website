# 25th Infantry Division — PRD

## Status: Production Ready
All features complete. Security hardening complete. All tests passing.
Rebranded from "Azimuth Operations Group" to "25th Infantry Division".

## Core Features
- Public landing page with 25th ID branding, hero images, unit history timeline
- HttpOnly cookie-based authentication (JWT never in localStorage or URL)
- Member Hub with discussions, operations, RSVP, roster, schedule
- Admin Command Center with full CMS (site content, operations, announcements, training, gallery, unit history, users)
- Discord OAuth2 (cookie-based, no token in URL params)

## Security Measures (March 2026)
- Auth tokens stored in HttpOnly Secure SameSite=Lax cookies
- Discord callback sets cookie on redirect — no JWT in URL query params
- CORS requires explicit origins from CORS_ORIGINS env var (no wildcard with credentials)
- Password validation: minimum 8 characters on registration and set-password
- Search input regex-escaped before MongoDB query
- 22 automated pytest tests covering auth, admin auth, RSVP, upload, search, CORS

## Documentation
- `README.md` — Project overview, quick start, env vars, bootstrap
- `DEPLOYMENT.md` — Full self-hosted Linux deployment guide (25th ID paths)
- `nginx-production.conf` — Production nginx config (25th ID paths)
- `backend/.env.example` — Backend env var template

## Admin Bootstrap
```bash
python3 /app/backend/create_admin.py
```

## Env Vars
- `CORS_ORIGINS` — Comma-separated allowed origins (required, no wildcard)
- `COOKIE_SECURE` — Set to "false" for HTTP-only dev environments (default: true)

## Completed Tasks
- Phase 1-5: Full-stack MilSim app
- Phase 6: Discord OAuth2
- Phase 7: My Schedule, set-password, reminders
- Phase 8: Production cleanup
- Phase 9: Full rebrand to 25th Infantry Division
- Phase 10: Unit History timeline
- Phase 11: Security hardening (cookie auth, CORS fix, password validation, search sanitization, regex escape, nginx rebrand, join section CTA, automated tests, branding images)

## Backlog
- None pending
