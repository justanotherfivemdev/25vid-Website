# Azimuth Operations Group — PRD

## Status: Production Ready
All features complete. All tests passing (iterations 1-8, 100%).

## Documentation
- `README.md` — Project overview, quick start, env vars, bootstrap
- `DEPLOYMENT.md` — Full self-hosted Linux deployment guide
- `backend/.env.example` — Backend env var template

## Admin Bootstrap
```bash
python3 scripts/create_admin.py
```
Interactive runtime input. No hardcoded credentials.

## Content Management
All homepage content editable via Admin > Command Center.
Fallback defaults in `frontend/src/config/siteContent.js`.
