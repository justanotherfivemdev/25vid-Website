# Azimuth Operations Group - Product Requirements Document

## Original Problem Statement
Build a professional, immersive website for the Milsim Unit "Azimuth Operations Group" serving as both a public recruitment hub and an internal operational support platform with an admin command center.

## Tech Stack
- **Frontend:** React.js, Tailwind CSS, Shadcn/UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB (motor async driver)
- **Auth:** JWT with bcrypt password hashing

## Architecture
```
/app/
├── backend/
│   ├── server.py          # All API endpoints
│   └── .env               # MONGO_URL, JWT_SECRET, etc.
├── frontend/
│   ├── src/
│   │   ├── App.js         # Routes + all public page components
│   │   ├── config/siteContent.js  # Static fallback content
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── AdminLayout.jsx
│   │   │   │   └── ImageUpload.jsx  # Reusable file upload component
│   │   │   └── ui/        # Shadcn components
│   │   └── pages/admin/
│   │       ├── Dashboard.jsx
│   │       ├── OperationsManager.jsx
│   │       ├── AnnouncementsManager.jsx
│   │       ├── UsersManager.jsx
│   │       └── SiteContentManager.jsx
│   └── public/uploads/    # Uploaded images stored here
└── scripts/
    └── create_admin.py
```

## What's Been Implemented

### Public Site (Complete)
- Hero section with dynamic background image + tagline
- About section with unit description, quote, logo
- Operational Superiority section (3-image showcase)
- Lethality on Demand section (Logistics + Training)
- Upcoming Operations (fetched from DB)
- Latest Intel / Announcements (fetched from DB)
- Mission Gallery (6-image showcase)
- Join/Enlist form
- Footer with links and contact info
- Mobile-responsive navigation with hamburger menu
- Dynamic content: public site fetches from `/api/site-content` and merges over static defaults

### Authentication (Complete)
- JWT-based registration and login
- Login page with register toggle
- Admin role support
- Protected routes for admin panel

### Admin Command Center (Complete)
- **Dashboard:** Stats overview + quick action links
- **Operations Manager:** Full CRUD with logo/badge file upload
- **Announcements Manager:** Full CRUD with badge file upload
- **Users Manager:** List, search, edit roles/rank, delete members
- **Site Content Manager:** Edit all visual branding across the site:
  - Hero background image + tagline
  - About section (logo, paragraphs, quote background, quote text)
  - Operational Superiority (description + 3 images)
  - Lethality on Demand (logistics/training descriptions + images)
  - Mission Gallery (6 images)
  - Login page background
  - Footer (description, Discord, email)
- **File Upload:** All image fields support both URL paste AND file upload (stored in /public/uploads/)

### Key API Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Current user info
- `GET/POST /api/operations` - Operations CRUD
- `GET/POST /api/announcements` - Announcements CRUD
- `GET/POST /api/discussions` - Discussions
- `GET/POST /api/gallery` - Gallery images
- `GET/POST /api/training` - Training
- `POST /api/upload` - File upload (auth required)
- `GET /api/site-content` - Public site content
- `GET/PUT /api/admin/site-content` - Admin site content management
- `GET/PUT/DELETE /api/admin/operations/*` - Admin operations CRUD
- `GET/PUT/DELETE /api/admin/announcements/*` - Admin announcements CRUD
- `GET/PUT/DELETE /api/admin/users/*` - Admin user management

### Test Credentials
- Admin: bishop@azimuth.ops / Admin123!
- Test URL: configured via REACT_APP_BACKEND_URL

## Prioritized Backlog

### P1 - Next Up
- Member Discussion Forum (pseudo-forum for internal ops)
- Training calendar/schedule management (admin page exists in sidebar but no route)
- Gallery management (admin page exists in sidebar but no route)

### P2 - Future
- Visual polish refinements (spacing, dividers, alternating sections)
- Production deployment guidance for custom domain
- Login page background customization from admin (already supported in Site Content Manager)
- Member-only internal hub pages (post-login experience for non-admin members)
- RSVP functionality connected to user auth

### P3 - Nice to Have
- Email notifications for new operations/announcements
- Event/operation reminders
- Member profiles/bios
- Search across operations and announcements
