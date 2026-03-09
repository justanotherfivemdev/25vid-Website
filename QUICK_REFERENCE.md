# 🎖️ QUICK REFERENCE CARD

## 🔐 Access Information

**Website:** https://tactical-hub-21.preview.emergentagent.com  
**Admin Panel:** https://tactical-hub-21.preview.emergentagent.com/admin  
**Login Page:** https://tactical-hub-21.preview.emergentagent.com/login  

**Admin Credentials:**
- Email: `bishop@azimuth.ops`
- Password: `AzimuthOps2025!`

---

## 📁 Essential Files

| File | Purpose |
|------|---------|
| `FINAL_CHECKLIST.md` | ✅ Pre-deployment verification |
| `DEPLOY_README.md` | 🚀 5-step quick deployment |
| `DEPLOYMENT_GUIDE.md` | 📖 Complete deployment guide |
| `ADMIN_GUIDE.md` | 🎛️ Admin panel documentation |
| `CUSTOMIZATION_GUIDE.md` | 🎨 Content editing guide |
| `README.md` | 📋 Project overview |

---

## 🚀 Quick Deploy (Railway)

```bash
# 1. Push to GitHub
git remote add origin https://github.com/USERNAME/azimuth-ops.git
git push -u origin main

# 2. Deploy on railway.app
# - New Project → GitHub repo
# - Add MongoDB database
# - Set environment variables

# 3. Connect domain (Cloudflare)
# - Railway: Custom domain
# - Cloudflare: CNAME record
```

**Time:** ~10 minutes  
**Cost:** ~$5-10/month

---

## 🎨 Customize Content

**Edit Site Content:**
- File: `/app/frontend/src/config/siteContent.js`
- Or use Admin Panel → Site Content

**Upload Images:**
- Imgur.com (free)
- Paste URL in config file

**Manage Operations:**
- Admin Panel → Operations
- Create/Edit/Delete

---

## 🔧 Service Commands

```bash
# Check status
sudo supervisorctl status

# Restart services
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
sudo supervisorctl restart all

# View logs
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/frontend.out.log
```

---

## 🗄️ Database Access

```bash
# Connect to MongoDB
mongosh azimuth_operations

# View collections
show collections

# View users
db.users.find()

# Make user admin
db.users.updateOne(
  {email: "user@email.com"}, 
  {$set: {role: "admin"}}
)
```

---

## 🔐 Security First

**Before Production:**
1. Generate new JWT_SECRET:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. Update CORS_ORIGINS:
   ```
   CORS_ORIGINS=https://ops.yourdomain.com
   ```

3. Change admin password immediately after first login

---

## 📊 Health Check URLs

- Homepage: `/`
- API Root: `/api/`
- Operations: `/api/operations`
- Admin Panel: `/admin`
- Login: `/login`

---

## 🆘 Quick Troubleshooting

**Site not loading?**
- Check `sudo supervisorctl status`
- Verify DNS propagation: `nslookup ops.yourdomain.com`

**API errors?**
- Check backend logs: `tail -f /var/log/supervisor/backend.err.log`
- Verify REACT_APP_BACKEND_URL

**Can't login to admin?**
- Verify user role: `mongosh azimuth_operations` → `db.users.find()`
- Check JWT_SECRET is set

**Images not loading?**
- Verify URL is direct link (ends in .jpg, .png, etc.)
- Test URL in browser first

---

## 📱 Admin Panel Sections

- **Dashboard** - Statistics & overview
- **Site Content** - Edit homepage
- **Operations** - Manage missions
- **Announcements** - Post updates
- **Discussions** - Forum moderation
- **Gallery** - Image management
- **Training** - Program schedules
- **Members** - User management

---

## 💰 Estimated Costs

| Platform | Monthly Cost |
|----------|-------------|
| Railway (Recommended) | $5-15 |
| Vercel + MongoDB Atlas | Free-$20 |
| DigitalOcean VPS | $12-24 |

---

## 🎯 Next Steps

1. ✅ Review `FINAL_CHECKLIST.md`
2. ✅ Read `DEPLOY_README.md`
3. ✅ Push to GitHub
4. ✅ Deploy on Railway
5. ✅ Connect Cloudflare domain
6. ✅ Change admin password
7. ✅ Customize content
8. ✅ Launch! 🚀

---

**🎖️ Everything you need is documented. You've got this, Commander!**
