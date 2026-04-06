# Docker Deployment Guide

Deploy the 25th Infantry Division platform using Docker Compose.

---

## Prerequisites

| Requirement       | Minimum  |
|-------------------|----------|
| Docker Engine     | 24+      |
| Docker Compose    | v2       |
| RAM               | 2 GB     |
| Disk              | 10 GB    |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/justanotherfivemdev/25vid-Website.git
cd 25vid-Website

# 2. Create your .env file
cp backend/.env.example .env

# 3. Edit .env — at minimum set JWT_SECRET and FRONTEND_URL
#    Generate a strong JWT secret:
#    python3 -c "import secrets; print(secrets.token_hex(32))"
nano .env

# 4. Build and start all services
docker compose up -d --build

# 5. Verify everything is running
docker compose ps
docker compose logs backend --tail 20
```

The application will be available at **[http://localhost](http://localhost)** (or your configured `FRONTEND_URL`).

---

## Environment Variables

Copy `backend/.env.example` to `.env` in the project root and configure:

### Required

| Variable        | Description                          | Example                          |
|-----------------|--------------------------------------|----------------------------------|
| `JWT_SECRET`    | Secret key for signing JWT tokens    | `a3f8c1...` (64-char hex)        |
| `FRONTEND_URL`  | Public URL of your frontend          | `https://yourdomain.com`         |

### Optional

| Variable                 | Description                              | Default                        |
|--------------------------|------------------------------------------|--------------------------------|
| `DB_NAME`                | MongoDB database name                    | `25th_infantry_division`       |
| `JWT_ALGORITHM`          | JWT signing algorithm                    | `HS256`                        |
| `JWT_EXPIRATION_HOURS`   | Token lifetime in hours                  | `24`                           |
| `COOKIE_SECURE`          | Set `true` for HTTPS, `false` for HTTP   | `true`                         |
| `CORS_ORIGINS`           | Extra allowed origins (comma-separated)  | *(empty)*                      |
| `DISCORD_CLIENT_ID`      | Discord OAuth2 client ID                 | *(empty = disabled)*           |
| `DISCORD_CLIENT_SECRET`  | Discord OAuth2 client secret             | *(empty = disabled)*           |
| `DISCORD_REDIRECT_URI`   | Discord OAuth2 callback URL              | *(empty = disabled)*           |
| `VALYU_API_KEY`          | Valyu API key for threat intelligence    | *(empty = disabled)*           |
| `OPENAI_API_KEY`         | OpenAI API key for research agent        | *(empty = disabled)*           |
| `REACT_APP_BACKEND_URL`  | Backend URL for frontend build           | *(empty = same origin)*        |
| `REACT_APP_MAPBOX_TOKEN` | Mapbox GL token for maps                 | *(empty = maps disabled)*      |
| `HOST_PORT`              | Host port to expose frontend on          | `80`                           |

---

## Architecture

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│   MongoDB    │
│  (Nginx:80)  │     │ (Uvicorn:8k) │     │   (:27017)   │
└──────────────┘     └──────────────┘     └──────────────┘
     port 80            internal             internal
```

- **Frontend**: Nginx serves the React build and proxies `/api/*` requests to the backend
- **Backend**: FastAPI application with Uvicorn
- **MongoDB**: Data persistence with a Docker volume

---

## Common Operations

### View logs

```bash
docker compose logs -f              # All services
docker compose logs -f backend      # Backend only
docker compose logs -f frontend     # Frontend only
docker compose logs -f mongo        # MongoDB only
```

### Restart a service

```bash
docker compose restart backend
```

### Rebuild after code changes

```bash
docker compose up -d --build
```

### Rebuild Required For Live Console / RCON Protocol Changes

The live Arma Reforger console and RCON WebSocket protocol depends on both:

- backend image flags (Uvicorn `--ws-ping-interval` / `--ws-ping-timeout`)
- frontend Nginx proxy settings (`proxy_send_timeout`, `proxy_buffering off`)

After pulling changes that touch `backend/Dockerfile`, `frontend/nginx.conf`,
or `nginx-production.conf`, always rebuild both services:

```bash
docker compose up -d --build backend frontend
docker compose ps
docker compose logs backend --tail 80
docker compose logs frontend --tail 80
```

If you skip the rebuild, old containers continue running old protocol behavior.

### Stop everything

```bash
docker compose down
```

### Stop and remove data volumes (⚠️ destroys all data)

```bash
docker compose down -v
```

---

## Creating the First Admin User

After the first deployment, register a user through the web UI, then promote them to admin:

```bash
docker compose exec mongo mongosh 25th_infantry_division --eval '
  db.users.updateOne(
    { email: "your-email@example.com" },
    { $set: { role: "admin", status: "active" } }
  )
'
```

---

## Production Considerations

### HTTPS / TLS

The included Docker setup runs on plain HTTP (port 80). For production HTTPS:

- **Option A: Reverse proxy** — Put Nginx, Caddy, or Traefik in front.

```bash
# Example with Caddy (auto-TLS)
caddy reverse-proxy --from yourdomain.com --to localhost:80
```

- **Option B: Modify `docker-compose.yml`** — Add a Caddy/Traefik service with automatic certificates.

When using HTTPS, set these in `.env`:

```env
COOKIE_SECURE=true
FRONTEND_URL=https://yourdomain.com
```

### Backups

Back up the MongoDB data volume regularly:

```bash
# Dump to host
docker compose exec mongo mongodump --db 25th_infantry_division --out /tmp/backup
docker compose cp mongo:/tmp/backup ./backups/$(date +%Y%m%d)

# Or use mongodump directly
docker compose exec mongo mongodump --db 25th_infantry_division --archive=/tmp/backup.gz --gzip
docker compose cp mongo:/tmp/backup.gz ./backups/
```

### Scaling

For higher traffic, consider:

- Running multiple backend replicas behind a load balancer
- Using MongoDB Atlas or a dedicated MongoDB cluster
- Adding Redis for session caching

---

## Troubleshooting

- Backend won't start: Check `docker compose logs backend` and ensure `.env` is set.
- Frontend shows blank page: Check browser console and verify `REACT_APP_BACKEND_URL`.
- MongoDB connection refused: Wait for healthcheck and run `docker compose ps`.
- CORS errors in browser: Set `FRONTEND_URL` and/or `CORS_ORIGINS` in `.env`.
- File uploads not persisting: Ensure `backend_uploads` volume is not removed.
- Console reconnects (Close 1006): Rebuild `backend` and `frontend`, then confirm frontend Nginx has `proxy_send_timeout 86400` and `proxy_buffering off`.
