# 25th Infantry Division — PRD

## Status: Production Ready
All features complete. Security hardened. Auth centralized via context provider.
Phase 1 patches and Phase 2 features (March 2026) completed and verified.

## Core Features
- Public landing page with 25th ID branding, hero images, unit history timeline
- HttpOnly cookie-based authentication with centralized AuthProvider context
- Member Hub with discussions, operations, RSVP, roster, schedule, Member of the Week
- Admin Command Center with CMS, MOTW management, unit history, member management
- Discord OAuth2 (cookie-based, no token in URL params)
- `/api/auth/status` endpoint for frontend feature detection (Discord availability)

## Unit Hierarchy System (Phase 2 - March 2026)
- **Roster Hierarchy View**: Toggle between grid and organizational hierarchy view
- **Structure**: Command Staff > Companies > Platoons > Squads > Members
- **User fields**: `company`, `platoon`, `billet` assigned per member
- **Endpoints**: `/api/roster/hierarchy` returns full organizational structure
- **Admin**: Members assigned via Unit Assignment section in member detail page

## Operation RSVP Roster (Phase 2 - March 2026)
- **Enhanced RSVP Details**: Operation detail shows full member info for RSVPs
- **Expandable Rows**: Click to see rank, company, platoon, billet, specialization
- **Endpoint**: `/api/operations/{id}/roster` returns enriched attendee data
- **Counts**: Total, Attending, Tentative, Waitlisted with member breakdown

## Unit Tags Management (Phase 2 - March 2026)
- **Admin Page**: `/admin/unit-config` for managing organizational options
- **Categories**: Ranks, Companies, Platoons, Squads, Billets, Specializations
- **Custom Tags**: Admins can add custom options (amber color, removable)
- **Defaults**: Built-in options (gray color, cannot be removed)
- **Usage**: Tags appear in dropdown menus when editing member profiles

## Auth Architecture (March 2026)
- `AuthContext.jsx` checks `/auth/me` once on mount, shares user state via React context
- `ProtectedRoute` reads context (no per-route API calls — instant navigation)
- Login/register/Discord callback set HttpOnly cookie; frontend never touches token
- 401 interceptor clears stale session and redirects to login
- `/api/auth/status` endpoint returns `{discord_enabled, email_enabled}` for clean feature detection

## Member of the Week
- Admin sets MOTW from Dashboard (search members → add optional citation)
- Displayed prominently at top of Member Hub with gold accent card
- Backend: `member_of_the_week` collection, single doc `{id: "current"}`

## Content Formatting
- All announcement/description/admin-posted text uses `whitespace-pre-wrap`
- Preserves paragraph breaks without requiring HTML input from admins
- Applied to: MemberHub announcements, OperationDetail descriptions, landing page announcements, history timeline

## Admin Navigation
- AdminLayout.jsx header has "Member Hub" and "Main Site" buttons
- Sidebar includes: Dashboard, Command Center, Operations, Announcements, Gallery, Unit History, Training, Members, Unit Config

## Completed Tasks
- Phases 1-10: Full-stack MilSim app + rebrand + unit history
- Phase 11: Security hardening (cookie auth, CORS, password validation, search sanitization)
- Phase 12: UX fixes (auth persistence, paragraph formatting, logo consistency, admin nav, join section CTA) + Member of the Week feature
- **Phase 13 (March 2026)**: Phase 1 Patches
  - ✓ Fixed paragraph formatting (whitespace-pre-wrap across all content areas)
  - ✓ Added /api/auth/status endpoint for clean Discord detection
  - ✓ Verified auth/session persistence with HttpOnly cookies
  - ✓ Confirmed admin navigation links present in AdminLayout
- **Phase 14 (March 2026)**: Phase 2 Features
  - ✓ Roster Hierarchy View with Company > Platoon > Squad structure
  - ✓ Enhanced Operation RSVP Roster with expandable member details
  - ✓ Unit Tags Management admin page for custom ranks/billets/companies
  - ✓ Admin Member Detail Unit Assignment section
  - ✓ Fixed branding: Removed all Azimuth references, updated to 25th Infantry Division

## Upcoming Tasks (Phase 3: Feature Layer)
- **P1: Recruitment Pipeline** - Public vacancy page + admin applicant management dashboard
- **P1: Event Creation Enhancements** - Attendance tracking, slot assignments, role requirements

## Future/Backlog
- **P2: Intel/Briefing System** - Searchable, taggable content for Orders, AARs, Intel Updates
- **P2: Campaign/Theater Map** - Visual dashboard for operational area, objectives, and campaign progress
