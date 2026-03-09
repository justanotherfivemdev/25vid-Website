# 🚀 DEPLOYMENT GUIDE - Azimuth Operations Group Website

## Overview

This guide covers deploying your Milsim unit website to production with your Cloudflare domain. Multiple hosting options included.

---

## 📋 Pre-Deployment Checklist

### **What You Need:**
- ✅ Cloudflare account with your domain
- ✅ GitHub account (recommended for deployment)
- ✅ Admin credentials for your site
- ✅ This codebase ready to deploy

### **Components to Deploy:**
1. **Frontend** (React app) - Port 3000
2. **Backend** (FastAPI) - Port 8001
3. **Database** (MongoDB) - Needs hosting

---

## 🎯 Recommended Deployment Options

### **Option 1: Railway (Easiest - Recommended) ⭐**

**Pros:**
- Deploy in minutes
- Free tier available ($5/month credit)
- Automatic MongoDB included
- HTTPS/SSL automatic
- GitHub integration
- Easy domain connection

**Cost:** ~$5-15/month

**Steps:**

1. **Prepare Your Code for Railway**
   
   Create `/railway.toml`:
   ```toml
   [build]
   builder = "NIXPACKS"
   
   [deploy]
   startCommand = "supervisord -c /app/supervisord.conf"
   healthcheckPath = "/api/"
   healthcheckTimeout = 100
   restartPolicyType = "ON_FAILURE"
   ```

2. **Push to GitHub**
   ```bash
   cd /app
   git init
   git add .
   git commit -m "Initial commit - Azimuth Operations Group"
   git remote add origin https://github.com/YOUR_USERNAME/azimuth-ops.git
   git push -u origin main
   ```

3. **Deploy on Railway**
   - Go to [railway.app](https://railway.app)
   - Sign up/Login
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Add MongoDB service:
     * Click "+ New"
     * Select "Database" → "MongoDB"
   
4. **Configure Environment Variables**
   
   In Railway project settings, add:
   ```
   MONGO_URL=<MongoDB connection string from Railway>
   DB_NAME=azimuth_operations
   JWT_SECRET=<generate-secure-random-string>
   JWT_ALGORITHM=HS256
   CORS_ORIGINS=*
   REACT_APP_BACKEND_URL=https://your-railway-domain.railway.app
   ```

5. **Connect Your Cloudflare Domain**
   
   **In Railway:**
   - Go to your service → Settings
   - Under "Networking" → "Custom Domain"
   - Add: `ops.yourdomain.com` (or any subdomain)
   - Copy the CNAME target shown
   
   **In Cloudflare:**
   - Go to DNS settings
   - Add CNAME record:
     * Type: CNAME
     * Name: ops (or your chosen subdomain)
     * Target: `<your-app>.up.railway.app`
     * Proxy status: Proxied (orange cloud)
   - Save
   
   Wait 5-10 minutes for DNS propagation.

6. **Test Your Deployment**
   - Visit `https://ops.yourdomain.com`
   - Login at `https://ops.yourdomain.com/login`
   - Access admin panel at `https://ops.yourdomain.com/admin`

---

### **Option 2: Vercel + MongoDB Atlas (Popular)**

**Pros:**
- Excellent for React apps
- Free tier generous
- Great performance
- Auto SSL

**Cons:**
- Backend needs separate hosting (use Vercel functions or Railway for backend)

**Cost:** Free - $20/month

**Steps:**

1. **Deploy Frontend to Vercel**
   - Install Vercel CLI: `npm i -g vercel`
   - In `/app/frontend`:
     ```bash
     vercel
     ```
   - Follow prompts
   - Connect domain in Vercel dashboard

2. **Deploy Backend to Railway** (follow Option 1 for backend only)

3. **MongoDB Atlas** (Free tier)
   - Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   - Create free cluster
   - Get connection string
   - Update backend MONGO_URL

---

### **Option 3: DigitalOcean/Linode VPS (Most Control)**

**Pros:**
- Full server control
- Best for scaling
- Predictable pricing

**Cons:**
- Requires server management
- More setup time

**Cost:** $12-24/month

**Steps:**

1. **Create Droplet/VPS**
   - Ubuntu 22.04 LTS
   - Minimum: 2GB RAM, 1 CPU
   - Recommended: 4GB RAM, 2 CPU

2. **Initial Server Setup**
   ```bash
   # SSH into server
   ssh root@your-server-ip
   
   # Update system
   apt update && apt upgrade -y
   
   # Install dependencies
   apt install -y python3-pip python3-venv nodejs npm mongodb supervisor nginx
   
   # Install yarn
   npm install -g yarn
   ```

3. **Deploy Application**
   ```bash
   # Clone your repo
   cd /var/www
   git clone https://github.com/YOUR_USERNAME/azimuth-ops.git
   cd azimuth-ops
   
   # Backend setup
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   
   # Frontend setup
   cd ../frontend
   yarn install
   yarn build
   
   # Copy supervisor config
   cp /app/supervisord.conf /etc/supervisor/conf.d/azimuth.conf
   supervisorctl reread
   supervisorctl update
   ```

4. **Configure Nginx**
   ```nginx
   # /etc/nginx/sites-available/azimuth
   server {
       listen 80;
       server_name ops.yourdomain.com;
       
       # Frontend
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
       
       # Backend API
       location /api {
           proxy_pass http://localhost:8001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
   
   Enable site:
   ```bash
   ln -s /etc/nginx/sites-available/azimuth /etc/nginx/sites-enabled/
   nginx -t
   systemctl restart nginx
   ```

5. **Setup SSL with Certbot**
   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d ops.yourdomain.com
   ```

6. **Connect Cloudflare Domain**
   - In Cloudflare DNS:
     * Type: A
     * Name: ops
     * IPv4: `<your-server-ip>`
     * Proxy: On (orange cloud)

---

## 🔒 Security Hardening

### **1. Change Default Credentials**
```bash
# After deployment, immediately:
# 1. Login to admin panel
# 2. Go to Members section
# 3. Change bishop@azimuth.ops password
# Or create new admin and delete default
```

### **2. Update JWT Secret**
Generate secure secret:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Update in environment variables.

### **3. Configure CORS**
Update `CORS_ORIGINS` to your actual domain:
```
CORS_ORIGINS=https://ops.yourdomain.com,https://yourdomain.com
```

### **4. Firewall Rules** (VPS only)
```bash
ufw allow 22/tcp  # SSH
ufw allow 80/tcp  # HTTP
ufw allow 443/tcp # HTTPS
ufw enable
```

---

## 🌐 Cloudflare Configuration

### **DNS Settings**

**For Railway/Vercel:**
```
Type: CNAME
Name: ops (or www, or @)
Target: <your-deployment-url>
Proxy: Proxied (orange cloud)
TTL: Auto
```

**For VPS:**
```
Type: A
Name: ops (or www, or @)
IPv4: <your-server-ip>
Proxy: Proxied (orange cloud)
TTL: Auto
```

### **Cloudflare SSL/TLS Settings**
1. Go to SSL/TLS tab
2. Set to "Full" or "Full (strict)"
3. Enable "Always Use HTTPS"
4. Enable "Automatic HTTPS Rewrites"

### **Performance Optimization**
1. **Caching:**
   - Go to Caching → Configuration
   - Set Browser Cache TTL: 4 hours
   - Enable "Cache Level: Standard"

2. **Speed:**
   - Go to Speed → Optimization
   - Enable Auto Minify (JS, CSS, HTML)
   - Enable Brotli

3. **Page Rules** (optional):
   ```
   ops.yourdomain.com/api/*
   - Cache Level: Bypass
   
   ops.yourdomain.com/*
   - Cache Level: Standard
   - Browser Cache TTL: 4 hours
   ```

---

## 📊 Environment Variables Reference

**Required for all deployments:**

```bash
# Database
MONGO_URL=mongodb://localhost:27017  # or Atlas connection string
DB_NAME=azimuth_operations

# JWT Authentication
JWT_SECRET=your-super-secret-key-change-this
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# CORS
CORS_ORIGINS=https://ops.yourdomain.com

# Frontend (React)
REACT_APP_BACKEND_URL=https://ops.yourdomain.com
```

---

## 🔄 Continuous Deployment

### **Setup Auto-Deploy from GitHub**

**Railway:**
- Automatic on git push

**Vercel:**
- Automatic on git push

**VPS:**
Create webhook script:
```bash
#!/bin/bash
cd /var/www/azimuth-ops
git pull origin main
cd frontend && yarn install && yarn build
cd ../backend && source venv/bin/activate && pip install -r requirements.txt
supervisorctl restart all
```

---

## 🐛 Troubleshooting

### **Issue: Site not loading**
- Check DNS propagation: `nslookup ops.yourdomain.com`
- Verify services running: `supervisorctl status`
- Check logs: `tail -f /var/log/supervisor/*.log`

### **Issue: API 404 errors**
- Verify REACT_APP_BACKEND_URL is correct
- Check backend is running on port 8001
- Verify Nginx proxy rules (VPS)

### **Issue: Database connection failed**
- Test MongoDB connection
- Check MONGO_URL format
- Verify database is running

### **Issue: SSL certificate errors**
- Verify Cloudflare SSL mode (Full or Full Strict)
- Check certificate installation (VPS)

---

## 📈 Monitoring & Maintenance

### **Health Checks**
- Homepage: `https://ops.yourdomain.com`
- API: `https://ops.yourdomain.com/api/`
- Admin: `https://ops.yourdomain.com/admin`

### **Backup Strategy**
```bash
# MongoDB backup (run weekly)
mongodump --uri="$MONGO_URL" --out=/backups/$(date +%Y%m%d)

# Code backup (automatic with git)
git push origin main
```

### **Update Process**
```bash
# Pull latest changes
git pull origin main

# Update dependencies
cd backend && pip install -r requirements.txt
cd ../frontend && yarn install

# Rebuild frontend
yarn build

# Restart services
supervisorctl restart all
```

---

## 💰 Cost Comparison

| Option | Monthly Cost | Setup Time | Difficulty |
|--------|-------------|------------|------------|
| **Railway** | $5-15 | 15 mins | Easy ⭐ |
| **Vercel + Atlas** | Free-$20 | 30 mins | Medium |
| **DigitalOcean VPS** | $12-24 | 2 hours | Advanced |
| **Linode VPS** | $12-24 | 2 hours | Advanced |

---

## ✅ Post-Deployment Checklist

- [ ] Site loads at your domain
- [ ] Login page works
- [ ] Admin panel accessible
- [ ] Change default admin password
- [ ] SSL certificate valid (https://)
- [ ] All images loading
- [ ] Operations CRUD working
- [ ] Announcements posting
- [ ] Gallery uploads working
- [ ] Mobile responsive
- [ ] Cloudflare proxy enabled
- [ ] Backup system configured

---

## 🆘 Need Help?

**Railway Support:** [docs.railway.app](https://docs.railway.app)
**Cloudflare Docs:** [developers.cloudflare.com](https://developers.cloudflare.com)
**MongoDB Atlas:** [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)

---

## 🎯 Quick Start - Railway Deployment (5 Steps)

1. **Push to GitHub** → `git push`
2. **Create Railway project** → Link GitHub repo
3. **Add MongoDB** → Click "+ Database"
4. **Set env variables** → Copy from `.env` files
5. **Add Cloudflare DNS** → CNAME to Railway URL

**Your site will be live in ~10 minutes!** 🎖️

---

**Recommendation:** Start with Railway for fastest deployment, then migrate to VPS later if you need more control.
