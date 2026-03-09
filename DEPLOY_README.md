# Quick Deployment Guide

## Railway Deployment (Recommended - 10 minutes)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial deployment"
git remote add origin https://github.com/YOUR_USERNAME/azimuth-ops.git
git push -u origin main
```

### 2. Deploy on Railway
1. Go to https://railway.app
2. Sign up/Login
3. New Project → Deploy from GitHub
4. Select your repo
5. Add MongoDB: "+ New" → "Database" → "MongoDB"

### 3. Environment Variables (Railway Dashboard)
```
MONGO_URL=<from Railway MongoDB>
DB_NAME=azimuth_operations
JWT_SECRET=<generate random string>
JWT_ALGORITHM=HS256
CORS_ORIGINS=*
REACT_APP_BACKEND_URL=https://your-app.railway.app
```

Generate JWT_SECRET:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4. Connect Domain (Cloudflare)
**Railway:**
- Settings → Networking → Custom Domain
- Add: ops.yourdomain.com
- Copy CNAME target

**Cloudflare DNS:**
- Type: CNAME
- Name: ops
- Target: <your-app>.up.railway.app
- Proxy: On (orange)

### 5. Test
Visit: https://ops.yourdomain.com

## Admin Access
- URL: /admin
- Email: bishop@azimuth.ops
- Pass: AzimuthOps2025!

**⚠️ Change password immediately after deployment!**

## Files Included
- railway.toml - Railway configuration
- supervisord.conf - Process management
- .gitignore - Git ignore rules

## Documentation
- DEPLOYMENT_GUIDE.md - Full deployment options
- ADMIN_GUIDE.md - Admin panel usage
- CUSTOMIZATION_GUIDE.md - Content customization

## Support
See DEPLOYMENT_GUIDE.md for troubleshooting and detailed instructions.
