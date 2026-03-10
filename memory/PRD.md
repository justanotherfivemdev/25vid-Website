# Azimuth Operations Group - Product Requirements Document

## Original Problem Statement
Build a professional, immersive website for the Milsim Unit "Azimuth Operations Group" serving as both a public recruitment hub and an internal operational support platform with an admin command center.

## Tech Stack
- **Frontend:** React.js, Tailwind CSS, Shadcn/UI
- **Backend:** FastAPI (Python)
- **Database:** MongoDB (motor async driver)
- **Auth:** JWT + Discord OAuth2 (dual auth)
- **File Storage:** Backend-served persistent uploads

## Architecture
```
/app/
├── backend/
│   ├── server.py          # All API logic, auth, Discord OAuth
│   ├── uploads/           # Persistent file storage
│   ├── tests/             # pytest test files
│   └── .env               # MONGO_URL, DB_NAME, JWT_*, DISCORD_*
├── frontend/
│   ├── src/
│   │   ├── App.js         # Routing, LoginPage, HomePage, all public pages
│   │   ├── App.css        # Custom CSS
│   │   ├── index.css      # Tailwind + fonts
│   │   ├── config/siteContent.js
│   │   ├── components/
│   │   │   ├── admin/AdminLayout.jsx
│   │   │   └── admin/ImageUpload.jsx
│   │   └── pages/
│   │       ├── admin/
│   │       │   ├── Dashboard.jsx
│   │       │   ├── SiteContentManager.jsx  # Command Center
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
├── scripts/
│   └── create_admin.py    # Production admin bootstrap
└── test_reports/
    ├── iteration_1-4.json # Phase 1-4 (100%)
    ├── iteration_5.json   # Phase 5 (100%)
    └── iteration_6.json   # Phase 6 - Discord + finalization (100%)
```

## Implemented Features (All Phases Complete)

### Phase 1 — Foundation
- Public landing page, JWT auth, admin CRUD, file upload

### Phase 2 — Feature Expansion
- Training/Gallery admin, Member Hub, Discussion Forum, role-based routing

### Phase 3 — CMS Command Center + Visual Polish
- 9-section Command Center, dynamic DB content, section headings, polished cards

### Phase 4 — Member Profile & Roster System
- Full profiles, searchable/filterable roster, admin member management

### Phase 5 — Advanced RSVP, Pinned Threads, Discord Prep, Search
- Advanced RSVP system with capacity, waitlist, status tracking
- Pinned forum threads with admin controls
- Search integration (operations + discussions)
- Discord user model preparation

### Phase 6 — Discord OAuth + Visual Finalization (CURRENT)
**Discord OAuth2 Integration:**
- "Continue with Discord" button on login page (Discord brand color #5865F2)
- Server-side authorization code flow (client secret never exposed to frontend)
- CSRF protection via signed JWT state parameter (10-min expiry)
- Discord `identify email` scopes
- Three flows:
  1. **Login**: Existing users with linked Discord → auto-login
  2. **Register**: New Discord users → auto-create account (random password set)
  3. **Link**: Logged-in users link Discord from profile page
- Email-based auto-linking: if Discord email matches existing account, auto-link
- Duplicate conflict handling: prevents one Discord from linking to multiple accounts
- Unlink safety: blocks unlink if Discord is the only auth method
- Discord state shown in member profile, edit profile, and admin member detail
- Discord avatar URL auto-populated from Discord CDN
- Placeholder email for Discord-only users: `discord_{id}@azimuth.local`

**Visual Consistency Pass:**
- Audited all ~20 pages for unified styling
- Fixed emoji → Lucide icons in OperationsManager
- Fixed stale rsvp_list field reference in OperationsManager
- Verified consistent: color palette, cards (bg-gray-900/border-gray-800), buttons (bg-red-700), inputs (bg-black/border-gray-700), headings (Rajdhani), borders, hover states, spacing

**Production Bootstrap:**
- Updated `/app/scripts/create_admin.py` with:
  - `getpass` for secure password input (hidden characters)
  - Upsert support (promote existing user to admin)
  - Password confirmation
  - Discord field initialization
  - No hardcoded credentials

### Key Routes
| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public | Landing page |
| `/login` | Public | Login/Register + Discord OAuth |
| `/admin` | Admin | Dashboard |
| `/admin/site-content` | Admin | Command Center CMS |
| `/admin/operations` | Admin | Operations CRUD |
| `/admin/announcements` | Admin | Announcements CRUD |
| `/admin/training` | Admin | Training CRUD |
| `/admin/gallery` | Admin | Gallery CRUD |
| `/admin/users` | Admin | Member list |
| `/admin/users/:id` | Admin | Member detail editor + Discord fields |
| `/hub` | Auth | Member hub + search |
| `/hub/profile` | Auth | Edit own profile + Discord link/unlink |
| `/hub/discussions` | Auth | Discussion forum + search + pinning |
| `/hub/discussions/:id` | Auth | Discussion thread |
| `/hub/operations/:id` | Auth | Operation detail + RSVP |
| `/roster` | Auth | Unit roster |
| `/roster/:id` | Auth | Member profile view |

### Key API Endpoints
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | /api/auth/discord | None | Initiate Discord OAuth login |
| GET | /api/auth/discord/link | User | Initiate Discord account linking |
| GET | /api/auth/discord/callback | None | Discord OAuth callback handler |
| DELETE | /api/auth/discord/unlink | User | Unlink Discord from account |
| POST | /api/operations/:id/rsvp | User | Set RSVP status |
| DELETE | /api/operations/:id/rsvp | User | Cancel RSVP |
| PUT | /api/admin/discussions/:id/pin | Admin | Toggle pin status |
| GET | /api/search?q= | User | Search ops & discussions |

### Environment Variables
**Backend (.env):**
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name
- `JWT_SECRET` - JWT signing secret
- `JWT_ALGORITHM` - JWT algorithm (HS256)
- `JWT_EXPIRATION_HOURS` - Token expiry
- `DISCORD_CLIENT_ID` - Discord OAuth app client ID
- `DISCORD_CLIENT_SECRET` - Discord OAuth app client secret
- `DISCORD_REDIRECT_URI` - Discord OAuth redirect URI

**Frontend (.env):**
- `REACT_APP_BACKEND_URL` - Backend API base URL

### Discord OAuth Flow Explanation
1. User clicks "Continue with Discord" → frontend calls `GET /api/auth/discord`
2. Backend generates signed state JWT, returns Discord OAuth URL
3. Browser redirects to Discord → user authorizes → Discord redirects to `/api/auth/discord/callback?code=xxx&state=xxx`
4. Backend validates state JWT, exchanges code for Discord access token
5. Backend fetches Discord user identity (id, username, avatar, email)
6. Logic branches:
   - Discord ID found → login existing user
   - Discord email matches existing user → auto-link and login
   - No match → create new user
7. Backend redirects to `/login?discord_token=<jwt>` (or `?discord_error=<msg>`)
8. Frontend reads token, calls `/api/auth/me`, stores session, redirects to hub/admin

### Bishop Admin Bootstrap
```bash
cd /app && python3 scripts/create_admin.py
```
- Interactive: accepts email, username, password at runtime
- Uses `getpass` for hidden password input
- Supports upsert: if email exists, promotes to admin + resets password
- No credentials stored in source control
- Compatible with any Linux + MongoDB deployment

## Prioritized Backlog

### P2 — Future
- Email notifications for operations/announcements
- Event/operation reminders
- Production deployment guide for custom domain
- "Set password" flow for Discord-only users who want to add email/password auth

## Notes for Production Deployment
- Change `JWT_SECRET` to a strong random value
- Set `DISCORD_REDIRECT_URI` to match your production domain
- Update Discord Developer Portal redirect URI to match
- Run `create_admin.py` once after first deploy
- Ensure MongoDB is secured with authentication
- Configure reverse proxy (Nginx) to serve frontend + proxy `/api` to backend
