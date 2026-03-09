# 🎖️ Azimuth Operations Group Website

## Quick Start - Customizing Your Content

### 🖼️ **The Easiest Way: Edit One File**

**All your images and text are in ONE place:**

```
/app/frontend/src/config/siteContent.js
```

Open this file and you'll see everything organized by section:
- Hero background image
- About section text and images
- Operational Superiority photos
- Training/Logistics images
- Gallery showcase images
- Footer contact info

**Just replace the URLs with your own images and save!** The site auto-reloads in ~3 seconds.

---

## 📸 Three Ways to Add Your Images

### **Option 1: Direct Image URLs (Easiest)**

1. Upload your images to:
   - [Imgur](https://imgur.com) - Free, no account
   - [ImgBB](https://imgbb.com) - Free
   - [Cloudinary](https://cloudinary.com) - Professional
   - Your own hosting

2. Copy the direct URL (must end in .jpg, .png, .webp)

3. Paste into `/app/frontend/src/config/siteContent.js`:
```javascript
hero: {
  backgroundImage: 'https://i.imgur.com/YourImage.jpg'
}
```

### **Option 2: Local Images**

1. Create folder: `/app/frontend/public/images/`
2. Place your images there
3. Reference them: `backgroundImage: '/images/my-photo.jpg'`

### **Option 3: Upload via API (for gallery)**

After logging in, upload to the database:
```bash
curl -X POST "https://mission-central-8.preview.emergentagent.com/api/gallery" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Operation Name","image_url":"URL","category":"operation"}'
```

---

## 🎨 Quick Image Size Guide

| Section | Best Size | Orientation |
|---------|-----------|-------------|
| Hero Background | 1920x1080px+ | Landscape |
| About Quote BG | 1200x600px | Landscape |
| Ops Superiority | 400x600px | Vertical/Portrait (3) |
| Logistics/Training | 800x450px | Landscape (16:9) |
| Gallery Showcase | 600x600px | Square (6) |

---

## 🛠️ **Quick Content Manager Script**

Run this helper script:
```bash
/app/scripts/manage-content.sh
```

It provides menu options to:
- Open config file for editing
- Create images directory
- View current configuration
- Get help

---

## 📝 Updating Text Content

Everything is in `/app/frontend/src/config/siteContent.js`:

```javascript
about: {
  paragraph1: 'Your custom text here...',
  quote: {
    text: '"Your quote"',
    author: '- Your Name'
  }
}
```

---

## 🔧 Advanced: Adding Dynamic Content

### Add Operation:
```bash
curl -X POST "https://mission-central-8.preview.emergentagent.com/api/operations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Operation Night Storm",
    "description": "Urban combat simulation",
    "operation_type": "combat",
    "date": "2026-03-25",
    "time": "20:00 UTC",
    "max_participants": 20
  }'
```

### Add Announcement:
```bash
curl -X POST "https://mission-central-8.preview.emergentagent.com/api/announcements" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Training This Weekend",
    "content": "All members report for CQB training.",
    "priority": "high"
  }'
```

---

## 📚 Documentation Files

- **Quick Guide**: `/app/CUSTOMIZATION_GUIDE.md` (detailed walkthrough)
- **Config File**: `/app/frontend/src/config/siteContent.js` (edit your content)
- **This README**: `/app/README.md`

---

## 🚀 Your Live Website

**URL**: https://mission-central-8.preview.emergentagent.com

**Test Account**:
- Email: `bishop@azimuth.ops`
- Password: `AzimuthOps2025!`

---

## 🎯 What's Built

✅ Professional landing page matching your WordPress design
✅ JWT authentication system
✅ Operations calendar with RSVP
✅ Announcements system
✅ Discussion forum APIs
✅ Photo gallery
✅ Training programs
✅ Fully responsive design
✅ Dark tactical theme with red accents

---

## 📞 Need Help?

1. Check browser console (F12 → Console) for errors
2. Verify image URLs are direct links
3. Try hard refresh (Ctrl+Shift+R)
4. Read the detailed guide: `/app/CUSTOMIZATION_GUIDE.md`

---

## 🎖️ File Structure

```
/app/
├── frontend/
│   ├── src/
│   │   ├── config/
│   │   │   └── siteContent.js    ← EDIT THIS!
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.css
│   └── public/
│       └── images/               ← Put local images here
├── backend/
│   └── server.py                 ← API backend
├── scripts/
│   └── manage-content.sh         ← Helper script
├── CUSTOMIZATION_GUIDE.md        ← Detailed guide
└── README.md                     ← This file
```

---

**Remember**: After editing `/app/frontend/src/config/siteContent.js`, just save and wait ~3 seconds for auto-reload!

🎖️ **Azimuth Operations Group - Mission Ready**
