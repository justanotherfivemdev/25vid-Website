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
│   ├── server.py
│   ├── uploads/
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── config/siteContent.js
│   │   ├── components/admin/
│   │   │   ├── AdminLayout.jsx
│   │   │   └── ImageUpload.jsx
│   │   └── pages/
│   │       ├── admin/
│   │       │   ├── Dashboard.jsx
│   │       │   ├── SiteContentManager.jsx
│   │       │   ├── OperationsManager.jsx
│   │       │   ├── AnnouncementsManager.jsx
│   │       │   ├── TrainingManager.jsx
│   │       │   ├── GalleryManager.jsx
│   │       │   ├── UsersManager.jsx
│   │       │   └── AdminMemberDetail.jsx
│   │       └── member/
│   │           ├── MemberHub.jsx
│   │           ├── DiscussionForum.jsx
│   │           ├── DiscussionThread.jsx
│   │           ├── OperationDetail.jsx
│   │           ├── UnitRoster.jsx
│   │           ├── MemberProfile.jsx
│   │           └── EditProfile.jsx
│   └── .env
└── test_reports/
    ├── iteration_1.json  # Phase 1 (100%)
    ├── iteration_2.json  # Phase 2 (100%)
    ├── iteration_3.json  # Phase 3 (100%)
    ├── iteration_4.json  # Phase 4 (100%)
    └── iteration_5.json  # Phase 5 (100%)
```

## Implemented Features (All Phases)

### Phase 1 — Foundation
- Public landing page, JWT auth, admin CRUD, file upload

### Phase 2 — Feature Expansion
- Training/Gallery admin, Member Hub, Discussion Forum, role-based routing

### Phase 3 — CMS Command Center + Visual Polish
- 9-section Command Center, dynamic DB content, section headings, polished cards

### Phase 4 — Member Profile & Roster System
- Full member profiles (avatar, rank, specialization, status, bio, awards, mission/training history)
- Profile editing with role separation (member vs admin editable fields)
- Searchable/filterable unit roster at /roster
- Admin member management with history CRUD

### Phase 5 — Advanced RSVP, Pinned Threads, Discord Prep, Search
**Advanced RSVP System:**
- Operation detail page at /hub/operations/:id with full RSVP management
- Attending / Tentative / Not Attending status options with one-click buttons
- Role/slot notes input for each RSVP
- Capacity tracking with automatic waitlisting when max_participants reached
- Auto-promote from waitlist when spots open
- Admin promote-from-waitlist button
- Attendee lists grouped by status (attending, tentative, waitlisted)
- Attendance summary counts displayed prominently
- Hub operation cards link to detail page with VIEW & RSVP button

**Pinned Forum Threads:**
- Pinned discussions appear at top of forum with pin icon, PINNED badge, and yellow left border
- Admin pin/unpin toggle buttons on each discussion thread
- Pin status persists via backend toggle endpoint
- Pinned indicators also shown in MemberHub discussions preview

**Search Integration:**
- Global search bar on MemberHub banner searching operations and discussions
- Dedicated search bar on Discussion Forum page
- Results categorized by type (Operations/Discussions)
- Clear button to dismiss search results
- Minimum 2-character query requirement

**Discord Integration Prep:**
- User model extended with discord_id, discord_username, discord_avatar, discord_linked fields
- Admin member editor shows Discord Integration Prep section
- Discord ID and Username editable by admin
- Discord Avatar URL read-only (future OAuth population)
- Discord Linked badge shows current link status
- Labeled as prep fields, not active OAuth controls
- Future-ready for server-side OAuth2 authorization code flow

### Key Routes
| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public | Landing page |
| `/login` | Public | Login/Register |
| `/admin` | Admin | Dashboard |
| `/admin/site-content` | Admin | Command Center |
| `/admin/operations` | Admin | Operations CRUD |
| `/admin/announcements` | Admin | Announcements CRUD |
| `/admin/training` | Admin | Training CRUD |
| `/admin/gallery` | Admin | Gallery CRUD |
| `/admin/users` | Admin | Member list |
| `/admin/users/:id` | Admin | Member detail editor |
| `/hub` | Auth | Member hub |
| `/hub/profile` | Auth | Edit own profile |
| `/hub/discussions` | Auth | Discussion forum |
| `/hub/discussions/:id` | Auth | Discussion thread |
| `/hub/operations/:id` | Auth | Operation detail + RSVP |
| `/roster` | Auth | Unit roster |
| `/roster/:id` | Auth | Member profile |

### Key API Endpoints
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | /api/operations/:id/rsvp | User | Set RSVP status |
| DELETE | /api/operations/:id/rsvp | User | Cancel RSVP |
| GET | /api/operations/:id/rsvp | User | Get RSVP breakdown |
| PUT | /api/admin/operations/:id/rsvp/:uid/promote | Admin | Promote from waitlist |
| PUT | /api/admin/discussions/:id/pin | Admin | Toggle pin status |
| GET | /api/search?q= | User | Search ops & discussions |

### No new env vars added.
### Admin credentials: bishop@azimuth.ops / Admin123!

## Prioritized Backlog

### P1 — Upcoming
- Full Discord Integration (OAuth2 flow for account linking)
  - Server-side authorization code flow
  - State parameter for CSRF protection
  - identify scope baseline
  - Account linking (not just social login)
  - Duplicate-account conflict handling
  - Compatible with existing JWT auth

### P2 — Future
- Email notifications for operations/announcements
- Event/operation reminders
- Production deployment guide for Cloudflare domain

## Discord OAuth Future Design Notes
When implementing full Discord integration:
- Use server-side authorization code flow (NOT implicit)
- Never expose client_secret in frontend
- Use and validate secure random `state` parameter for CSRF
- Use `identify` scope as baseline
- Redirect URI handling via backend callback route
- Support both: linking existing account AND creating new account via Discord
- Keep Discord optional — existing email/password auth must remain
- Store DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET as backend env vars
- DISCORD_REDIRECT_URI for the callback endpoint
