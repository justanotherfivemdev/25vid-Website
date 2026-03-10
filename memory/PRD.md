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
│   │       │   └── AdminMemberDetail.jsx    # Phase 4
│   │       └── member/
│   │           ├── MemberHub.jsx
│   │           ├── DiscussionForum.jsx
│   │           ├── DiscussionThread.jsx
│   │           ├── UnitRoster.jsx            # Phase 4
│   │           ├── MemberProfile.jsx         # Phase 4
│   │           └── EditProfile.jsx           # Phase 4
│   └── .env
└── test_reports/
    ├── iteration_1.json  # Phase 1 (100%)
    ├── iteration_2.json  # Phase 2 (100%)
    ├── iteration_3.json  # Phase 3 (100%)
    └── iteration_4.json  # Phase 4 (100%)
```

## Implemented Features (All Phases)

### Phase 1 — Foundation
- Public landing page, JWT auth, admin CRUD, file upload

### Phase 2 — Feature Expansion
- Training/Gallery admin, Member Hub, Discussion Forum, role-based routing

### Phase 3 — CMS Command Center + Visual Polish
- 9-section Command Center, dynamic DB content, section headings, polished cards

### Phase 4 — Member Profile & Roster System
**Member Profiles:**
- Full profile with: avatar, rank, specialization/MOS, status (recruit/active/reserve/staff/command/inactive), timezone, squad/team, bio, favorite role/loadout, awards/qualifications, mission history, training history
- Profile page at `/roster/{id}` with gradient header, info grid, bio, and history sections

**Profile Editing — Role Separation:**
- **Members can edit (at /hub/profile):** avatar, bio, timezone, favorite_role
- **Only admins can edit (at /admin/users/{id}):** username, role, rank, specialization, status, squad, plus all member-editable fields
- Read-only fields clearly labeled with note to contact admin

**Unit Roster:**
- Searchable/filterable directory at `/roster`
- Filter by: rank, specialization, status, squad
- Grid layout with clickable member cards showing avatar, rank, status badge, squad
- Links to full profile pages

**Mission & Training History:**
- Stored as embedded arrays in user documents
- Mission history: operation_name, date, role_performed, notes
- Training history: course_name, completion_date, instructor, notes
- Awards: name, date, description
- Admin-managed via `/admin/users/{id}` with add/remove dialogs
- Displayed on member profile pages when entries exist

**Admin Member Management:**
- Roster-style admin user list (click to edit)
- Full profile editor with all fields
- Mission history CRUD (add/remove entries)
- Training history CRUD (add/remove entries)
- Awards CRUD (add/remove entries)

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
| `/roster` | Auth | Unit roster |
| `/roster/:id` | Auth | Member profile |

### No new env vars added.
### Admin credentials: bishop@azimuth.ops / Admin123!

## Prioritized Backlog

### P2 — Future
- Email notifications for operations/announcements
- Search across content
- Event/operation reminders
- Advanced RSVP management
- Forum pinned threads
- Production deployment guide for Cloudflare domain
- Discord integration prep
