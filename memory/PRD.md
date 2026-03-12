# 25th Infantry Division — PRD

## Status: Production Ready
All features complete. Security hardened. Auth centralized via context provider.
Phase 1 patches (March 2026) completed and verified.

## Core Features
- Public landing page with 25th ID branding, hero images, unit history timeline
- HttpOnly cookie-based authentication with centralized AuthProvider context
- Member Hub with discussions, operations, RSVP, roster, schedule, Member of the Week
- Admin Command Center with CMS, MOTW management, unit history, member management
- Discord OAuth2 (cookie-based, no token in URL params)
- `/api/auth/status` endpoint for frontend feature detection (Discord availability)

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
- Consistent navigation back from command center to member area and public site

## Completed Tasks
- Phases 1-10: Full-stack MilSim app + rebrand + unit history
- Phase 11: Security hardening (cookie auth, CORS, password validation, search sanitization)
- Phase 12: UX fixes (auth persistence, paragraph formatting, logo consistency, admin nav, join section CTA) + Member of the Week feature
- **Phase 13 (March 2026)**: Phase 1 Patches
  - ✓ Fixed paragraph formatting (whitespace-pre-wrap across all content areas)
  - ✓ Added /api/auth/status endpoint for clean Discord detection
  - ✓ Verified auth/session persistence with HttpOnly cookies
  - ✓ Confirmed admin navigation links present in AdminLayout

## Upcoming Tasks (Phase 2: Feature Layer)
- **P0: Roster Hierarchy View** - Upgrade roster to hierarchical structure (company, platoon, squad, command staff, open billets)
- **P1: Recruitment Pipeline** - Public vacancy page + admin applicant management dashboard
- **P1: Expand Command Center** - Event creation, attendance tracking, member management tools

## Future/Backlog
- **P2: Intel/Briefing System** - Searchable content for Orders, AARs, Intel Updates with tagging
- **P2: Campaign/Theater Map** - Visual dashboard for operational area and objectives
