# 25th Infantry Division — Linux Self-Hosting Deployment Guide

This guide is the **canonical production deployment path** for this project.
It is intentionally Linux-only and focused on a single reliable stack:

- Ubuntu/Debian Linux
- Python + FastAPI backend (systemd)
- React frontend (static build)
- MongoDB
- Nginx reverse proxy
- TLS via Let's Encrypt (certbot)

---

## 1) Prerequisites (Ubuntu/Debian)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential nginx certbot python3-certbot-nginx \
  python3 python3-venv python3-pip
```

Install Node.js 18+:

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g yarn
```

Install MongoDB 6+ from the official MongoDB repository for your distro.

---

## 2) Clone Repository

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone <your-repo-url> 25th-id
sudo chown -R $USER:$USER /opt/25th-id
cd /opt/25th-id
```

---

## 3) Backend Setup

```bash
cd /opt/25th-id/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Create a persistent upload directory **outside** the repo so uploads
survive `git pull` / `git reset` / redeployments:

```bash
sudo mkdir -p /opt/data/uploads
sudo chown www-data:www-data /opt/data/uploads
```

Create `backend/.env`:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=25th_infantry_division
JWT_SECRET=<GENERATE_A_STRONG_SECRET>
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24
COOKIE_SECURE=true

# Persistent upload directory (OUTSIDE the git repo).
# This ensures images/maps/voice clips survive git pull and redeployments.
UPLOAD_DIR=/opt/data/uploads

# Required — set to the public URL of your frontend (no trailing slash).
# This controls both CORS allowed origins and OAuth redirect URLs.
FRONTEND_URL=https://yourdomain.com

# Optional — additional CORS origins (comma-separated) when the frontend
# is served from more than one domain.  FRONTEND_URL is always included
# automatically.
# CORS_ORIGINS=https://www.yourdomain.com,https://staging.yourdomain.com

# Optional — Valyu API (powers Global Threat Map intelligence features)
# VALYU_API_KEY=valyu_your_api_key_here
# VALYU_CACHE_TTL_MINUTES=30
# VALYU_EVENT_REFRESH_MINUTES=10
# VALYU_RATE_LIMIT_SECONDS=30
# VALYU_COUNTRY_CACHE_HOURS=24

# Optional email verification settings
# EMAIL_DELIVERY_MODE=smtp
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USERNAME=
# SMTP_PASSWORD=
# SMTP_FROM_EMAIL=
# SMTP_FROM_NAME=
# SMTP_USE_TLS=true
# SMTP_USE_SSL=false
# EMAIL_VERIFICATION_TTL_HOURS=24
```

Generate JWT secret:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

---

## 4) Frontend Setup + Build

```bash
cd /opt/25th-id/frontend
yarn install
```

Create `frontend/.env`:

```env
REACT_APP_BACKEND_URL=https://yourdomain.com
REACT_APP_MAPBOX_TOKEN=pk.your_mapbox_public_token_here
# REACT_APP_MAP_STYLE=mapbox://styles/mapbox/dark-v11

# World Monitor Intelligence Overlay (Overlay view in Global Threat Map)
REACT_APP_WORLDMONITOR_URL=https://yourdomain.com/worldmonitor/
```

For local/staging work, you can start from `frontend/.env.example` and then
replace the values with your production domain and Mapbox token.

Build frontend:

```bash
yarn build
# Output: /opt/25th-id/frontend/build
```

---

## 4b) World Monitor Intelligence Overlay (Optional)

The Global Threat Map's **Overlay** view is powered by [World Monitor](https://github.com/swatfa/worldmonitor-bayesian).
The source lives in the `worldmonitor/` directory.

```bash
cd /opt/25th-id/worldmonitor
npm install
npm run build
# Output: /opt/25th-id/worldmonitor/dist
```

Then add a location block to your Nginx config to serve the built assets (see section 6 below).

Optional API keys for enhanced data feeds — add to `worldmonitor/.env`:

```env
# FINNHUB_API_KEY=your_key
# CLOUDFLARE_API_TOKEN=your_token
# FRED_API_KEY=your_key
# ACLED_EMAIL=your_email
# ACLED_PASSWORD=your_password
```

See `worldmonitor/API_CONFIGURATION.md` for the full list of data sources.

---

## 5) Create systemd Service (Backend)

Create `/etc/systemd/system/25th-id-backend.service`:

```ini
[Unit]
Description=25th Infantry Division Backend
After=network.target mongod.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/25th-id/backend
Environment="PATH=/opt/25th-id/backend/venv/bin"
ExecStart=/opt/25th-id/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Apply service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable 25th-id-backend
sudo systemctl start 25th-id-backend
sudo systemctl status 25th-id-backend
```

---

## 6) Configure Nginx (HTTP first)

Create `/etc/nginx/sites-available/25th-id`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;

    root /opt/25th-id/frontend/build;
    index index.html;

    location /api {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
        client_max_body_size 20M;
    }

    location /static/ {
        alias /opt/25th-id/frontend/build/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # World Monitor Intelligence Overlay (built from worldmonitor/ directory)
    location /worldmonitor/ {
        alias /opt/25th-id/worldmonitor/dist/;
        try_files $uri $uri/ /worldmonitor/index.html;
        expires 1h;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site and reload:

```bash
sudo ln -sf /etc/nginx/sites-available/25th-id /etc/nginx/sites-enabled/25th-id
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7) Enable HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d yourdomain.com
```

Certbot will update the site to add TLS and redirect HTTP traffic to HTTPS.

Validate auto-renew:

```bash
sudo certbot renew --dry-run
```

Then validate and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 8) Bootstrap Admin Account

```bash
cd /opt/25th-id
source backend/venv/bin/activate
python3 scripts/create_admin.py
```

Then log in at:

- `https://yourdomain.com/login`
- Admin panel: `https://yourdomain.com/admin`

---

## 9) MongoDB Hardening (Recommended)

```bash
mongosh
```

```javascript
use admin
db.createUser({
  user: "tropic_admin",
  pwd: "<strong_password>",
  roles: [{ role: "readWrite", db: "25th_infantry_division" }]
})
```

Enable auth in `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

Restart MongoDB:

```bash
sudo systemctl restart mongod
```

Update `MONGO_URL` in `backend/.env`:

```env
MONGO_URL=mongodb://tropic_admin:<password>@localhost:27017/25th_infantry_division?authSource=admin
```

Restart backend:

```bash
sudo systemctl restart 25th-id-backend
```

---

## 10) Backup (Recommended)

Example cron entries:

```bash
# Daily DB backup
0 3 * * * mongodump --db 25th_infantry_division --out /opt/backups/mongo/$(date +\%Y\%m\%d) --gzip

# Daily uploads backup
0 3 * * * tar -czf /opt/backups/uploads/$(date +\%Y\%m\%d).tar.gz /opt/data/uploads/

# Purge backups older than 30 days
0 4 * * * find /opt/backups -mtime +30 -delete
```

---

## 11) Update / Redeploy Procedure

```bash
cd /opt/25th-id
git pull

cd frontend
yarn install
yarn build

cd ../backend
source venv/bin/activate
pip install -r requirements.txt

sudo systemctl restart 25th-id-backend
sudo systemctl reload nginx
```

> **Note:** Because `UPLOAD_DIR` is set to `/opt/data/uploads` (outside the
> repo), `git pull` and `git reset` will **not** affect uploaded files.

---

## 12) Migrate Existing Uploads (one-time)

If you are upgrading from a previous install where uploads lived inside the
repo at `/opt/25th-id/backend/uploads/`, run these steps **once** to move
them to the persistent location:

```bash
# 1. Create persistent directory
sudo mkdir -p /opt/data/uploads/maps /opt/data/uploads/voice

# 2. Copy existing uploads (preserves originals as backup)
sudo cp -rn /opt/25th-id/backend/uploads/* /opt/data/uploads/

# 3. Set ownership so the backend can write
sudo chown -R www-data:www-data /opt/data/uploads

# 4. Add UPLOAD_DIR to backend/.env (if not already present)
grep -q 'UPLOAD_DIR' /opt/25th-id/backend/.env || \
  echo 'UPLOAD_DIR=/opt/data/uploads' >> /opt/25th-id/backend/.env

# 5. Restart backend
sudo systemctl restart 25th-id-backend
```

---

## 13) Operations Checklist (Hosting Party)

Use this after every fresh deploy and every update:

1. `sudo systemctl status 25th-id-backend` is healthy
2. `sudo nginx -t` passes
3. `curl -I https://yourdomain.com` returns `200` or `304`
4. `curl -I https://yourdomain.com/api/` returns `200`
5. Login works from `/login`
6. Admin account can access `/admin`
7. Image uploads work and are visible
8. Campaigns page loads correctly
9. `sudo journalctl -u 25th-id-backend -n 100 --no-pager` has no fatal errors

---

## Quick Reference

| Action | Command |
|---|---|
| Backend status | `sudo systemctl status 25th-id-backend` |
| Backend logs | `sudo journalctl -u 25th-id-backend -f` |
| Restart backend | `sudo systemctl restart 25th-id-backend` |
| Test nginx config | `sudo nginx -t` |
| Reload nginx | `sudo systemctl reload nginx` |
| Renew certs test | `sudo certbot renew --dry-run` |
