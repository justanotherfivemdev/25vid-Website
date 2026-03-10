# Azimuth Operations Group — Production Deployment Guide

## Prerequisites

| Component | Minimum Version | Purpose |
|-----------|----------------|---------|
| Ubuntu/Debian | 22.04+ | Host OS |
| Node.js | 18+ | Frontend build |
| Python | 3.10+ | Backend runtime |
| MongoDB | 6.0+ | Database |
| Nginx | 1.18+ | Reverse proxy |
| Cloudflare | — | DNS + SSL + CDN |

---

## 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3.10+ and pip
sudo apt install -y python3 python3-pip python3-venv

# Install MongoDB
# Follow https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/

# Install Nginx
sudo apt install -y nginx

# Install Yarn
npm install -g yarn
```

---

## 2. Clone & Configure

```bash
# Clone repository
cd /opt
git clone <your-repo-url> azimuth
cd azimuth

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Backend Environment Variables (`/opt/azimuth/backend/.env`)

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=azimuth_operations
JWT_SECRET=<GENERATE_A_STRONG_RANDOM_SECRET>
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24
DISCORD_CLIENT_ID=<YOUR_DISCORD_APP_CLIENT_ID>
DISCORD_CLIENT_SECRET=<YOUR_DISCORD_APP_CLIENT_SECRET>
DISCORD_REDIRECT_URI=https://yourdomain.com/api/auth/discord/callback
```

**Generate a strong JWT secret:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

### Frontend Environment Variables (`/opt/azimuth/frontend/.env`)

```env
REACT_APP_BACKEND_URL=https://yourdomain.com
```

---

## 3. Build Frontend

```bash
cd /opt/azimuth/frontend
yarn install
yarn build
# Output: /opt/azimuth/frontend/build/
```

---

## 4. Backend Service (systemd)

Create `/etc/systemd/system/azimuth-backend.service`:

```ini
[Unit]
Description=Azimuth Operations Backend
After=network.target mongod.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/azimuth/backend
Environment="PATH=/opt/azimuth/backend/venv/bin"
ExecStart=/opt/azimuth/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable azimuth-backend
sudo systemctl start azimuth-backend
sudo systemctl status azimuth-backend
```

---

## 5. Nginx Configuration

Create `/etc/nginx/sites-available/azimuth`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend — serve static build
    root /opt/azimuth/frontend/build;
    index index.html;

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }

    # Uploaded files
    location /api/uploads/ {
        proxy_pass http://127.0.0.1:8001/api/uploads/;
    }

    # SPA fallback — all non-API routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/azimuth /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Cloudflare Configuration

Since you already have Cloudflare set up:

1. **DNS**: Point your domain's A record to your server's public IP. Set proxy status to **Proxied** (orange cloud).
2. **SSL/TLS**: Go to SSL/TLS > Overview > Set mode to **Full (Strict)**.
   - Cloudflare handles the browser-to-Cloudflare TLS.
   - For Cloudflare-to-origin, either:
     - Use a Cloudflare Origin Certificate (free, 15-year validity)
     - Or use Let's Encrypt with certbot
3. **Caching**: Under Caching > Configuration, set to "Standard".
   - Add a Page Rule for `/api/*` → Cache Level: Bypass (ensures API calls are never cached).
4. **Firewall**: Enable Bot Fight Mode and rate limiting on `/api/auth/*` endpoints to prevent brute force.

### Cloudflare Origin Certificate (recommended)

```bash
# Download origin cert and key from Cloudflare dashboard
# SSL/TLS > Origin Server > Create Certificate
# Save as:
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/origin.pem      # paste certificate
sudo nano /etc/ssl/cloudflare/origin-key.pem   # paste private key
```

Update Nginx to listen on 443:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin-key.pem;

    # ... same location blocks as above ...
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}
```

---

## 7. Discord OAuth — Production Redirect

1. Go to https://discord.com/developers/applications
2. Select your application > OAuth2
3. Add redirect URI: `https://yourdomain.com/api/auth/discord/callback`
4. Update `DISCORD_REDIRECT_URI` in backend `.env` to match
5. Restart backend: `sudo systemctl restart azimuth-backend`

---

## 8. Bootstrap Admin (Bishop)

```bash
cd /opt/azimuth
source backend/venv/bin/activate
python3 scripts/create_admin.py
```

- Enter email, username, password interactively
- Password is hidden during input (uses `getpass`)
- If the email already exists, the user is promoted to admin
- Admin can log in immediately at `https://yourdomain.com/login`
- Admin panel is at `https://yourdomain.com/admin`

---

## 9. MongoDB Security

```bash
# Enable MongoDB authentication
mongosh
> use admin
> db.createUser({ user: "azimuth_admin", pwd: "<strong_password>", roles: [{ role: "readWrite", db: "azimuth_operations" }] })
> exit

# Enable auth in /etc/mongod.conf:
# security:
#   authorization: enabled

sudo systemctl restart mongod
```

Update `MONGO_URL` in backend `.env`:
```
MONGO_URL=mongodb://azimuth_admin:<password>@localhost:27017/azimuth_operations?authSource=admin
```

---

## 10. Backup Strategy

```bash
# Daily MongoDB backup (add to crontab)
0 3 * * * mongodump --db azimuth_operations --out /opt/backups/mongo/$(date +\%Y\%m\%d) --gzip

# Backup uploads directory
0 3 * * * tar -czf /opt/backups/uploads/$(date +\%Y\%m\%d).tar.gz /opt/azimuth/backend/uploads/

# Keep 30 days of backups
0 4 * * * find /opt/backups -mtime +30 -delete
```

---

## 11. Update / Redeploy

```bash
cd /opt/azimuth
git pull

# Rebuild frontend
cd frontend && yarn install && yarn build

# Update backend deps
cd ../backend
source venv/bin/activate
pip install -r requirements.txt

# Restart backend
sudo systemctl restart azimuth-backend

# Nginx only needs reload if config changed
sudo systemctl reload nginx
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start backend | `sudo systemctl start azimuth-backend` |
| Stop backend | `sudo systemctl stop azimuth-backend` |
| View backend logs | `sudo journalctl -u azimuth-backend -f` |
| Restart Nginx | `sudo systemctl reload nginx` |
| Create admin | `python3 scripts/create_admin.py` |
| MongoDB backup | `mongodump --db azimuth_operations --gzip` |
| Build frontend | `cd frontend && yarn build` |

---

## Environment Variables Summary

| Variable | Location | Required | Description |
|----------|----------|----------|-------------|
| `MONGO_URL` | backend/.env | Yes | MongoDB connection string |
| `DB_NAME` | backend/.env | Yes | Database name |
| `JWT_SECRET` | backend/.env | Yes | Strong random secret for JWT signing |
| `JWT_ALGORITHM` | backend/.env | Yes | `HS256` |
| `JWT_EXPIRATION_HOURS` | backend/.env | Yes | Token lifetime (24 recommended) |
| `DISCORD_CLIENT_ID` | backend/.env | Yes | Discord OAuth app ID |
| `DISCORD_CLIENT_SECRET` | backend/.env | Yes | Discord OAuth app secret |
| `DISCORD_REDIRECT_URI` | backend/.env | Yes | Must match Discord portal + domain |
| `REACT_APP_BACKEND_URL` | frontend/.env | Yes | Your production domain (https://...) |
