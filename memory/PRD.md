# 25th Infantry Division — PRD

## Status: Production Ready
All features complete through Phase 15. Security hardened. Auth centralized via context provider.

## Core Features
- Public landing page with 25th ID branding, hero images, unit history timeline
- HttpOnly cookie-based authentication with centralized AuthProvider context
- Member Hub with discussions, operations, RSVP, roster, schedule, Member of the Week
- Admin Command Center with CMS, MOTW management, unit history, member management
- Discord OAuth2 (cookie-based, no token in URL params)
- `/api/auth/status` endpoint for frontend feature detection (Discord availability)

## Recruit Workflow (Phase 15 - March 2026)
- New users register with `status: "recruit"`, redirected to `/recruit` dashboard
- Recruits blocked from `/hub` until admin promotes to `active`
- RecruitDashboard: application form, status tracking
- Admin Recruitment Manager: review applications, manage open billets

## Unit Hierarchy System (Phase 14 - March 2026)
- **Roster Hierarchy View**: Toggle between grid and organizational hierarchy view
- **Structure**: Command Staff > Companies > Platoons > Squads > Members
- **User fields**: `company`, `platoon`, `billet` assigned per member
- **Admin**: Members assigned via Unit Assignment section in member detail page

## Operation RSVP Roster (Phase 14 - March 2026)
- **Enhanced RSVP Details**: Operation detail shows full member info for RSVPs
- **Expandable Rows**: Click to see rank, company, platoon, billet, specialization
- **Endpoint**: `/api/operations/{id}/roster` returns enriched attendee data

## Admin Operations RSVP View (Phase 16 - March 2026)
- **Expandable Roster Panel**: Per-operation RSVP table in admin Operations Manager
- **Table columns**: Operator, Rank, Company, Platoon, Billet, Role Notes, Status
- **Summary bar**: Attending/Tentative/Waitlisted/Total counts
- **Links**: Each operator links to their admin member detail page

## Intel / Briefing System (Phase 16 - March 2026)
- **Categories**: Intel Update, Commander's Intent, Operational Order, After Action Report, Training Bulletin
- **Classifications**: Routine, Priority, Immediate, Flash (with visual priority badges)
- **Tags**: Taggable content with tag cloud filtering
- **Search**: Full-text search across titles and content
- **Admin**: `/admin/intel` CRUD management page (IntelManager.jsx)
- **Member**: `/hub/intel` Intelligence Board with category filters, tag cloud, detail modal (IntelBoard.jsx)
- **Formatting**: `whitespace-pre-wrap` preserves paragraph formatting
- **Backend**: `intel_briefings` MongoDB collection, GET/POST/PUT/DELETE endpoints
- **Endpoints**: GET /api/intel, GET /api/intel/tags, GET /api/intel/{id}, POST /api/admin/intel, PUT /api/admin/intel/{id}, DELETE /api/admin/intel/{id}

## Unit Tags Management (Phase 14 - March 2026)
- **Admin Page**: `/admin/unit-config` for managing organizational options
- **Categories**: Ranks, Companies, Platoons, Squads, Billets, Specializations
- **Admin-only**: Members cannot self-manage unit assignments (read-only in EditProfile)

## Auth Architecture (March 2026)
- `AuthContext.jsx` checks `/auth/me` once on mount, shares user state via React context
- `ProtectedRoute` reads context (no per-route API calls — instant navigation)
- `RecruitRoute` ensures only recruits can access /recruit page
- Login/register/Discord callback set HttpOnly cookie; frontend never touches token
- 401 interceptor clears stale session and redirects to login

## Branding
- **Color scheme**: tropic-red (#C8102E), tropic-gold (#FFD700), black backgrounds
- **No blue/indigo/cyan/sky classes** anywhere in the application
- Discord button retains brand color #5865F2 (intentional exception)

## Completed Phases
- Phases 1-12: Full-stack MilSim app + rebrand + security hardening
- Phase 13: Phase 1 Patches (formatting, Discord detection, auth persistence)
- Phase 14: Phase 2 Features (roster hierarchy, RSVP roster, unit tags, unit assignment)
- Phase 15: Recruit Workflow + Branding Overhaul
- **Phase 16 (March 2026)**: P1 Command Center Expansion
  - Admin Operations RSVP roster panel with detailed table view
  - Intel/Briefing system (backend + admin + member pages)
  - Admin sidebar updated with Intel & Briefings
  - Member Hub quick nav updated with Intel Board link

## Upcoming Tasks
- **P2: Campaign/Theater Map Page** - Visual dashboard for operational area, objectives, campaign progress

## Future/Backlog
- Event Creation Enhancements: Attendance tracking, slot assignments, role requirements
- Advanced analytics dashboard for admin
