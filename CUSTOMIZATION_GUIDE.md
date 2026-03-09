# 🎨 Azimuth Operations Group - Customization Guide

## Quick Guide to Customizing Your Website

### 📸 **Method 1: Edit the Content Configuration File (Easiest)**

All images and text content are centralized in one file for easy editing:

**File Location:** `/app/frontend/src/config/siteContent.js`

Simply open this file and replace the image URLs with your own! No need to touch component code.

```javascript
// Example: Change the hero background
hero: {
  backgroundImage: 'YOUR_IMAGE_URL_HERE'
}
```

---

## 🖼️ **How to Add Your Own Images**

### **Option 1: Use Direct URLs (Recommended)**

1. **Upload your images** to any hosting service:
   - [Imgur](https://imgur.com) (Free, easy)
   - [Cloudinary](https://cloudinary.com) (Professional)
   - [ImgBB](https://imgbb.com) (Free, no account needed)
   - Your own server

2. **Get the direct image URL** (must end in .jpg, .png, .webp, etc.)

3. **Replace URLs in `/app/frontend/src/config/siteContent.js`**

```javascript
// Before
backgroundImage: 'https://images.unsplash.com/photo-123...'

// After (with your image)
backgroundImage: 'https://i.imgur.com/YourImage.jpg'
```

---

### **Option 2: Use Local Images**

1. **Create images folder** (if it doesn't exist):
```bash
mkdir -p /app/frontend/public/images
```

2. **Copy your images** to this folder:
```bash
# Example: if you have images on your computer, upload them to the preview environment
# or use the file upload feature in your code editor
```

3. **Reference them in `siteContent.js`**:
```javascript
hero: {
  backgroundImage: '/images/my-hero-image.jpg'
}
```

---

### **Option 3: Upload Via Gallery API**

For gallery images that you want stored in the database:

```bash
# Login first to get your token
curl -X POST "https://tactical-hub-21.preview.emergentagent.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'

# Upload image to gallery
curl -X POST "https://tactical-hub-21.preview.emergentagent.com/api/gallery" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "title": "Operation Night Raid",
    "image_url": "https://your-image-url.com/image.jpg",
    "category": "operation"
  }'
```

---

## 📝 **Updating Text Content**

All text is also in `/app/frontend/src/config/siteContent.js`:

```javascript
about: {
  paragraph1: 'Your custom about text here...',
  
  quote: {
    text: '"Your custom quote"',
    author: '- Your Name (Title)'
  }
}
```

After editing, save the file and the website will automatically reload!

---

## 🎯 **Quick Image Replacement Guide**

### **Hero Section (Full-screen background)**
```javascript
hero: {
  backgroundImage: 'YOUR_URL'
}
```
**Best size:** 1920x1080px or larger, landscape orientation

### **About Quote Background**
```javascript
about: {
  quote: {
    backgroundImage: 'YOUR_URL'
  }
}
```
**Best size:** 1200x600px, tactical/moody image

### **Operational Superiority (3 vertical photos)**
```javascript
operationalSuperiority: {
  images: [
    'URL_1',  // First vertical image
    'URL_2',  // Second vertical image
    'URL_3'   // Third vertical image
  ]
}
```
**Best size:** 400x600px (3:4 aspect ratio), vertical/portrait

### **Logistics & Training Images**
```javascript
lethality: {
  logistics: {
    image: 'YOUR_URL'
  },
  training: {
    image: 'YOUR_URL'
  }
}
```
**Best size:** 800x450px (16:9 aspect ratio)

### **Gallery Showcase (6 images)**
```javascript
gallery: {
  showcaseImages: [
    'URL_1', 'URL_2', 'URL_3',
    'URL_4', 'URL_5', 'URL_6'
  ]
}
```
**Best size:** 600x600px (square), all same size preferred

---

## 🔧 **Testing Your Changes**

1. Edit `/app/frontend/src/config/siteContent.js`
2. Save the file
3. Wait ~3 seconds for hot reload
4. Refresh your browser at: https://tactical-hub-21.preview.emergentagent.com
5. Your changes should appear immediately!

---

## 🎨 **Changing Colors**

Colors are defined in `/app/frontend/src/index.css`:

```css
:root {
  --primary: 0 82% 35%;        /* Red accent - change this for different red */
  --secondary: 217 91% 60%;     /* Blue accent */
  --background: 0 0% 0%;        /* Black background */
}
```

Example: For a darker red, change to:
```css
--primary: 0 82% 25%;  /* Darker red */
```

---

## 📱 **Updating Your Logo**

The compass logo is created with SVG code. To use your own logo:

1. **Replace the SVG** in `/app/frontend/src/App.js`
2. Find the `HeroSection` component
3. Look for the `<svg>` tag with the compass
4. Replace with your logo image:

```javascript
// Replace the entire SVG block with:
<img 
  src="/images/your-logo.png" 
  alt="Azimuth Operations Group"
  className="w-64 h-64 compass-logo"
/>
```

---

## 🚀 **Adding More Operations/Announcements**

These are managed via the API and database. To add content:

### **Add Operation:**
```bash
curl -X POST "https://tactical-hub-21.preview.emergentagent.com/api/operations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Operation Storm Watch",
    "description": "Desert assault tactics training",
    "operation_type": "training",
    "date": "2026-03-20",
    "time": "18:00 UTC",
    "max_participants": 16
  }'
```

### **Add Announcement:**
```bash
curl -X POST "https://tactical-hub-21.preview.emergentagent.com/api/announcements" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Weekend Training Schedule",
    "content": "All members report for CQB drills this Saturday.",
    "priority": "high"
  }'
```

---

## 🆘 **Need Help?**

If you run into issues:

1. Check the browser console for errors (F12 → Console)
2. Verify image URLs are direct links (end in .jpg, .png, etc.)
3. Make sure you saved `/app/frontend/src/config/siteContent.js`
4. Try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

---

## 📂 **File Structure Reference**

```
/app/frontend/src/
├── config/
│   └── siteContent.js          ← Edit images & text here!
├── App.js                      ← Main component (don't need to edit usually)
├── App.css                     ← Styling
└── index.css                   ← Global styles & colors

/app/frontend/public/
└── images/                     ← Put your local images here
```

---

**Remember:** After making changes, give it a few seconds for hot reload, then refresh your browser!
