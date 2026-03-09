# 🎖️ AZIMUTH OPERATIONS GROUP - ADMIN CONTROL SYSTEM

## Overview

Your website now has a **complete admin control system** that allows you to manage all aspects of the site after deployment without touching code.

---

## 🔐 Admin Access

**Admin Portal URL:** `https://your-site.com/admin`

**Admin Login Credentials:**
- Email: `bishop@azimuth.ops`
- Password: `AzimuthOps2025!`

**Important:** Change this password immediately after first login!

---

## 📊 Admin Dashboard Features

### **1. Dashboard Overview**
- View real-time statistics
- Total operations, announcements, discussions, gallery images, members
- Quick action buttons for common tasks

### **2. Site Content Management** (`/admin/site-content`)
Manage all static website content:
- **Hero Section**: Background image, tagline text
- **About Section**: Company description, founder quote, images
- **Operational Superiority**: Description and 3 tactical images
- **Lethality Section**: Logistics & Training descriptions and images
- **Gallery**: Showcase images for homepage
- **Footer**: Contact information, Discord, Email

**How to use:**
1. Click "Site Content" in sidebar
2. Edit any section
3. Upload new image URLs or change text
4. Click "Save Changes"
5. View live site to see updates

---

### **3. Operations Management** (`/admin/operations`)

**Create New Operation:**
1. Click "New Operation" button
2. Fill in details:
   - Title (e.g., "Operation Night Storm")
   - Description
   - Type: Combat, Training, Recon, or Support
   - Date and Time
   - Max Participants (optional)
3. Click "Create Operation"

**Edit Operation:**
- Click edit icon (pencil) on any operation
- Modify fields
- Click "Update Operation"

**Delete Operation:**
- Click delete icon (trash)
- Confirm deletion

**RSVP Tracking:**
- View participant count
- See who signed up

---

### **4. Announcements Management** (`/admin/announcements`)

**Create Announcement:**
1. Click "New Announcement"
2. Add title and content
3. Set priority:
   - **Urgent**: Red highlight
   - **High**: Orange highlight
   - **Normal**: Blue highlight
   - **Low**: Gray highlight
4. Post announcement

**Edit/Delete:**
- Same workflow as operations
- Announcements appear on homepage automatically

---

### **5. Discussions/Forum Management** (`/admin/discussions`)

**Manage Discussion Threads:**
- View all member discussions
- Create official threads
- Delete inappropriate content
- Reply to discussions as admin

**Categories:**
- General
- Operations
- Training
- Feedback

---

### **6. Gallery Management** (`/admin/gallery`)

**Upload Images:**
1. Click "Add Image"
2. Provide:
   - Image URL (from Imgur, Cloudinary, etc.)
   - Title
   - Category: Operation, Training, Team, Equipment
3. Upload

**Manage Gallery:**
- View all images
- Delete outdated photos
- Re-categorize images
- Images appear in homepage gallery automatically

---

### **7. Training Programs** (`/admin/training`)

**Create Training Program:**
1. Click "New Training"
2. Enter:
   - Program title
   - Description
   - Instructor name
   - Schedule (dates/times)
   - Duration
3. Save

**Management:**
- Edit existing programs
- Archive completed training
- Track attendance (if RSVPs enabled)

---

### **8. Member Management** (`/admin/users`)

**View All Members:**
- See complete member roster
- View ranks, specializations, join dates

**Edit Member:**
1. Click on member
2. Update:
   - Role: Member or Admin
   - Rank (Commander, Specialist, Operator, etc.)
   - Specialization (Assault, Recon, Support, etc.)
   - Account status (Active/Inactive)
3. Save changes

**Promote to Admin:**
- Change role from "Member" to "Admin"
- They get full admin panel access

**Remove Member:**
- Delete account (cannot be undone)
- Cannot delete your own admin account

---

## 🛡️ Security Features

### **JWT Authentication**
- Secure token-based login
- 24-hour session expiration
- Automatic logout on expiration

### **Role-Based Access Control**
- **Public**: View website only
- **Member**: Access to member portal (coming soon)
- **Admin**: Full control panel access

### **Protected Routes**
- All admin pages require authentication
- Non-admins cannot access `/admin/*` routes
- Automatic redirect to login if unauthorized

---

## 📱 Using the Admin Panel

### **Navigation**
- **Sidebar**: Access all management sections
- **Top Bar**: View Site button, Logout button
- **Dashboard**: Quick actions for common tasks

### **Typical Workflow**

**Before an Operation:**
1. Go to Operations Manager
2. Create new operation with date/time
3. Post announcement about it
4. Add operation photos to gallery after

**Weekly Maintenance:**
1. Check Dashboard statistics
2. Review new member signups
3. Post weekly announcements
4. Update training schedules

**Monthly Updates:**
1. Update Site Content images
2. Archive old operations
3. Review member roles
4. Update footer contact info

---

## 🎨 Editing Site Appearance

### **Changing Images**

**Option 1: Via Admin Panel**
1. Go to Site Content section
2. Find image field you want to change
3. Paste new image URL
4. Save changes

**Option 2: Direct File Edit** (Advanced)
- Edit `/app/frontend/src/config/siteContent.js`
- Update image URLs
- Restart frontend service

**Recommended Image Sizes:**
- Hero Background: 1920x1080px
- Ops Superiority: 400x600px (vertical)
- Logistics/Training: 800x450px (landscape)
- Gallery: 600x600px (square)

### **Uploading Images**

**Recommended Services:**
- [Imgur](https://imgur.com) - Free, easy
- [Cloudinary](https://cloudinary.com) - Professional
- [ImgBB](https://imgbb.com) - No account needed

**Steps:**
1. Upload image to service
2. Copy direct URL (ends in .jpg, .png, etc.)
3. Use URL in admin panel

---

## 🔧 Troubleshooting

### **Can't Access Admin Panel**
- Verify you're using admin credentials
- Check if account role is set to "admin" in database
- Clear browser cache and retry

### **Changes Not Appearing**
- Hard refresh browser (Ctrl+Shift+R)
- Check if you clicked "Save"
- Wait 3-5 seconds for hot reload

### **Images Not Loading**
- Verify URL is direct link to image
- Check image URL ends in .jpg, .png, .webp, etc.
- Test URL in browser first

### **Session Expired**
- Sessions last 24 hours
- Log in again to continue
- Token stored in localStorage

---

## 📋 Admin Checklist

### **Daily**
- [ ] Check new member registrations
- [ ] Review RSVP counts for upcoming operations
- [ ] Post daily/weekly announcements

### **Weekly**
- [ ] Create next week's operations
- [ ] Update training schedules
- [ ] Review discussion forums
- [ ] Add new gallery photos

### **Monthly**
- [ ] Update homepage content
- [ ] Archive completed operations
- [ ] Review member roles/ranks
- [ ] Update contact information

---

## 🚀 Future Enhancements (Coming Soon)

- Member portal with RSVP tracking
- File upload capability (no URL needed)
- Advanced analytics and reports
- Email notifications for operations
- Calendar export (iCal format)
- Mobile admin app
- Bulk operations management

---

## 🆘 Support & Maintenance

### **Backing Up Data**
All data is stored in MongoDB database `azimuth_operations`:
- Collections: users, operations, announcements, discussions, gallery, training, site_content

### **Creating Additional Admins**
1. Have them register normally on the site
2. Go to Members section in admin panel
3. Find their account
4. Change role to "Admin"
5. They can now access `/admin`

### **Resetting Admin Password**
Via database:
```bash
mongosh azimuth_operations
db.users.updateOne(
  {email: "your@email.com"}, 
  {$set: {password_hash: "<new_hash>"}}
)
```

Or register a new admin account and promote them.

---

## 🎖️ Admin Panel Structure

```
/admin
├── Dashboard              (Overview & stats)
├── Site Content           (Homepage editing)
├── Operations             (CRUD operations)
├── Announcements          (CRUD announcements)
├── Discussions            (Forum management)
├── Gallery                (Image management)
├── Training               (Training programs)
└── Members                (User management)
```

---

## 📞 Quick Reference

**Admin URL:** `/admin`
**Login:** `/login`
**API Base:** `/api`

**Default Admin:**
- Email: `bishop@azimuth.ops`
- Pass: `AzimuthOps2025!`

**Key Features:**
✅ Full content management
✅ Operations & events
✅ Member management
✅ Image gallery
✅ Announcements
✅ Training programs
✅ Forum/discussions
✅ Role-based access
✅ Secure JWT auth
✅ Real-time updates

---

**Your Milsim unit website is now fully manageable without touching code!** 🎖️
