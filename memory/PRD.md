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
│   ├── uploads/                     # Persistent file storage
│   ├── tests/
│   │   ├── test_api.py
│   │   ├── test_phase2_api.py
│   │   └── test_phase3_api.py
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js                   # Routes + polished public components
│   │   ├── App.css                  # Tactical styles, section dividers, card styles
│   │   ├── config/siteContent.js    # Static fallbacks (nav, sectionHeadings, images)
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   ├── AdminLayout.jsx  # Sidebar with Command Center link
│   │   │   │   └── ImageUpload.jsx  # File upload + URL paste component
│   │   │   └── ui/
│   │   └── pages/
│   │       ├── admin/
│   │       │   ├── Dashboard.jsx
│   │       │   ├── SiteContentManager.jsx  # 9-section Command Center
│   │       │   ├── OperationsManager.jsx
│   │       │   ├── AnnouncementsManager.jsx
│   │       │   ├── TrainingManager.jsx
│   │       │   ├── GalleryManager.jsx
│   │       │   └── UsersManager.jsx
│   │       └── member/
│   │           ├── MemberHub.jsx
│   │           ├── DiscussionForum.jsx
│   │           └── DiscussionThread.jsx
│   └── .env
├── scripts/
│   └── create_admin.py
└── test_reports/
    ├── iteration_1.json    # Phase 1 (100%)
    ├── iteration_2.json    # Phase 2 (100%)
    └── iteration_3.json    # Phase 3 (100%)
```

## Implemented Features

### Phase 1 — Foundation (Complete)
- Public landing page with tactical design
- JWT auth (register/login)
- Admin dashboard with CRUD for operations, announcements, users
- Basic site content management
- File upload (URL paste + direct upload)

### Phase 2 — Feature Expansion (Complete)
- Training CRUD admin page
- Gallery CRUD admin page with category filters
- Member Hub post-login dashboard
- Discussion Forum with threads, replies, admin moderation
- File uploads moved to persistent backend storage at /api/uploads/
- Role-based routing: admin→/admin, member→/hub

### Phase 3 — CMS Command Center + Visual Polish (Complete)
**Command Center (Admin > Site Content):**
- 9 numbered sections with icons and clear labeling:
  01. Navigation Bar (brand name, CTA button text)
  02. Hero Banner (background image, tagline lines 1 & 2)
  03. About Section (emblem, paragraphs, quote block with bg image/text/author)
  04. Operational Superiority (description, 3 portrait images)
  05. Lethality on Demand (logistics block, training block — each with desc + image)
  06. Section Headings & Subtexts (operations, intel, gallery, enlist, lethality, ops superiority)
  07. Mission Gallery Showcase (6 featured images)
  08. Login Page Background (background image)
  09. Footer (tagline, discord, email)
- Every field labeled with "Appears on:", "Purpose:", "Recommended:"
- Image upload + URL paste for all image fields with preview

**Dynamic Content System:**
- Public site fetches content from GET /api/site-content
- Deep-merges DB content over static fallbacks (siteContent.js)
- All section headings, subtexts, nav text, images, body text are live-editable
- Changes take effect on next page load — no rebuild needed

**Visual Polish:**
- Operation cards: type-based colors (combat=red, training=blue, recon=green, support=amber), logo badges, operator counts, hover elevation with glow
- Intel cards: priority-based left borders (urgent/high/normal/low), badge_url in bottom-right, colored priority dots
- Section dividers: gradient lines between all homepage sections
- Section headings: centered with red underline decoration
- Alternating dark backgrounds for depth
- Consistent spacing (py-28), better typography hierarchy
- Nav bar: added INTEL link, lighter text, wider tracking

**What can be edited live through admin (no rebuild needed):**
- All homepage images (hero, about, quote, operational superiority, lethality, gallery)
- All homepage text (taglines, paragraphs, quote, descriptions)
- All section headings and subtexts
- Navigation brand name and CTA button text
- Login page background
- Footer description and contact info
- Per-operation logo badges
- Per-announcement badges
- Training images
- Gallery images with categories

**What still requires a frontend rebuild:**
- Component layout/structure changes
- New page routes
- CSS class modifications
- Adding new sections to the homepage

### No new env vars added in Phase 3.

### Test Credentials
- Admin: bishop@azimuth.ops / Admin123!

## Prioritized Backlog

### P2 — Future
- Email notifications for operations/announcements
- Member profiles and bios
- Search across content
- Event/operation reminders
- Advanced RSVP management
- Forum pinned threads
- Production deployment guide for Cloudflare domain
