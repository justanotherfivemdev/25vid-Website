# 25th Infantry Division — Linux Self-Hosting Deployment Guide

This guide is the **canonical production deployment path** for this project.
It is intentionally Linux-only and focused on a single reliable stack:

- Ubuntu/Debian Linux
- Python + FastAPI backend (systemd)
- React frontend (static build)
- MongoDB
- Nginx reverse proxy
- Cloudflare DNS proxy + SSL/TLS (Full strict)

---

## 1) Prerequisites (Ubuntu/Debian)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential nginx \
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

Create `backend/.env`:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=25th_infantry_division
JWT_SECRET=<GENERATE_A_STRONG_SECRET>
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24
COOKIE_SECURE=true

# Recommended for production links
FRONTEND_URL=https://yourdomain.com

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

# Optional future map feed scaffolding
# MAP_EXTERNAL_FEED_ENABLED=false
# MAP_EXTERNAL_PROVIDER=none
# MAP_INGEST_INTERVAL_SECONDS=300
# MAP_EVENT_RETENTION_DAYS=30
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
```

Build frontend:

```bash
yarn build
# Output: /opt/25th-id/frontend/build
```

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

## 7) Enable HTTPS with Cloudflare Origin Certificates

1) In Cloudflare DNS, point `A`/`AAAA` records to your server and enable **Proxied** mode (orange cloud).

2) In Cloudflare SSL/TLS settings, set mode to **Full (strict)**.

3) Create a Cloudflare Origin Certificate and key:
   - Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate
   - Save as:
     - `/etc/ssl/certs/cloudflare-origin.crt`
     - `/etc/ssl/private/cloudflare-origin.key`

4) Update Nginx site config to force HTTPS and serve on 443 with Cloudflare origin cert:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/certs/cloudflare-origin.crt;
    ssl_certificate_key /etc/ssl/private/cloudflare-origin.key;

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

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

5) Validate and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

6) Keep backend cookies secure:

```env
COOKIE_SECURE=true
FRONTEND_URL=https://yourdomain.com
```

---

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
0 3 * * * tar -czf /opt/backups/uploads/$(date +\%Y\%m\%d).tar.gz /opt/25th-id/backend/uploads/

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

---

## 12) Operations Checklist (Hosting Party)

Use this after every fresh deploy and every update:

1. `sudo systemctl status 25th-id-backend` is healthy
2. `sudo nginx -t` passes
3. `curl -I https://yourdomain.com` returns `200` or `304`
4. `curl -I https://yourdomain.com/api/` returns `200`
5. Login works from `/login`
6. Admin account can access `/admin`
7. Image uploads work and are visible
8. Conflict Map loads tiles and markers
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
| Validate Cloudflare SSL mode | `Cloudflare Dashboard -> SSL/TLS -> Full (strict)` |
