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
│   ├── server.py              # All API endpoints
│   ├── uploads/               # Persistent file storage (served via StaticFiles)
│   ├── tests/
│   │   ├── test_api.py        # Phase 1 backend tests
│   │   └── test_phase2_api.py # Phase 2 backend tests
│   └── .env                   # MONGO_URL, JWT_SECRET, etc.
├── frontend/
│   ├── src/
│   │   ├── App.js             # Routes + all public page components
│   │   ├── config/siteContent.js  # Static fallback content
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── AdminLayout.jsx
│   │   │   │   └── ImageUpload.jsx    # Reusable file upload component
│   │   │   └── ui/            # Shadcn components
│   │   └── pages/
│   │       ├── admin/
│   │       │   ├── Dashboard.jsx
│   │       │   ├── OperationsManager.jsx
│   │       │   ├── AnnouncementsManager.jsx
│   │       │   ├── UsersManager.jsx
│   │       │   ├── SiteContentManager.jsx
│   │       │   ├── TrainingManager.jsx    # Phase 2
│   │       │   └── GalleryManager.jsx     # Phase 2
│   │       └── member/
│   │           ├── MemberHub.jsx          # Phase 2
│   │           ├── DiscussionForum.jsx    # Phase 2
│   │           └── DiscussionThread.jsx   # Phase 2
│   └── .env
├── scripts/
│   └── create_admin.py
└── test_reports/
    ├── iteration_1.json       # Phase 1 (100% pass)
    └── iteration_2.json       # Phase 2 (100% pass)
```

## What's Been Implemented

### Phase 1 (Complete, Tested 100%)
- Public-facing site with dynamic content from DB (fallback to static defaults)
- JWT auth (register/login) with role-based routing
- Admin Command Center: Dashboard, Operations, Announcements, Users, Site Content
- File upload with both URL paste and direct file upload

### Phase 2 (Complete, Tested 100%)

#### Training Admin Management
- Full CRUD: create, edit, delete training programs
- Fields: title, description, instructor, schedule, duration, image (file upload)
- Route: /admin/training

#### Gallery Admin Management
- Full CRUD: create, edit, delete gallery images
- Category filter: All, Operation, Training, Team, Equipment
- Grid layout with hover overlay for edit/delete
- File upload support for images
- Route: /admin/gallery

#### Member Discussion Forum
- Thread listing with category filters (General, Operations, Training, Feedback)
- Create new discussion threads
- View threads with full post + replies
- Post replies to threads
- Admin moderation: delete threads, delete individual replies
- Routes: /hub/discussions, /hub/discussions/:id

#### Member Hub (Post-Login Experience)
- Welcome banner with operations overview
- Quick navigation: Discussions, Operations, Training, Intel
- Latest Intel section (announcements)
- Upcoming Operations with RSVP buttons
- Training Programs overview
- Recent Discussions preview
- Route: /hub

#### Production-Hardened File Upload
- Uploads stored in /app/backend/uploads/ (persistent, outside frontend)
- Served via FastAPI StaticFiles at /api/uploads/
- Survives frontend rebuilds, git pulls, and Linux redeploys
- Backwards compatible with old /uploads/ paths

#### Role-Based Access & Route Protection
- Admin login -> /admin, Member login -> /hub
- /admin/* routes: admin-only (non-admin redirected to /)
- /hub/* routes: authenticated users only (unauthenticated redirected to /login)
- Member navigation bar with Admin link (only for admin role)

### Key API Endpoints
- Auth: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
- Operations: GET/POST /api/operations, POST /api/operations/:id/rsvp
- Announcements: GET/POST /api/announcements
- Training: GET/POST /api/training
- Gallery: GET/POST /api/gallery
- Discussions: GET/POST /api/discussions, GET /api/discussions/:id, POST /api/discussions/:id/reply
- Upload: POST /api/upload
- Site Content: GET /api/site-content, GET/PUT /api/admin/site-content
- Admin CRUD: PUT/DELETE /api/admin/{operations|announcements|training|gallery|discussions|users}/*

### Test Credentials
- Admin: bishop@azimuth.ops / Admin123!

## Storage & Deployment Notes
- **File uploads** stored at `/app/backend/uploads/` — must be preserved during deploys
- **No new env vars** added in Phase 2
- **Linux redeploy steps:**
  1. Pull latest code
  2. pip install -r backend/requirements.txt
  3. cd frontend && yarn install && yarn build
  4. Ensure /app/backend/uploads/ directory exists and persists
  5. Restart backend (uvicorn) and serve frontend (nginx)
  6. Run bootstrap_admin.py if fresh install

## Prioritized Backlog

### P2 - Future
- Visual polish refinements (spacing, dividers, alternating section treatments)
- Production deployment guide for custom domain with Cloudflare
- Email notifications for new operations/announcements
- Member profiles and bios
- Search across operations and announcements
- Event/operation reminders
