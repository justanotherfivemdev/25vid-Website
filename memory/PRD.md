# 25th Infantry Division — PRD

## Status: Production Ready
All features complete. Security hardened. Auth centralized via context provider.

## Core Features
- Public landing page with 25th ID branding, hero images, unit history timeline
- HttpOnly cookie-based authentication with centralized AuthProvider context
- Member Hub with discussions, operations, RSVP, roster, schedule, Member of the Week
- Admin Command Center with CMS, MOTW management, unit history, member management
- Discord OAuth2 (cookie-based, no token in URL params)

## Auth Architecture (March 2026)
- `AuthContext.jsx` checks `/auth/me` once on mount, shares user state via React context
- `ProtectedRoute` reads context (no per-route API calls — instant navigation)
- Login/register/Discord callback set HttpOnly cookie; frontend never touches token
- 401 interceptor clears stale session and redirects to login

## Member of the Week
- Admin sets MOTW from Dashboard (search members → add optional citation)
- Displayed prominently at top of Member Hub with gold accent card
- Backend: `member_of_the_week` collection, single doc `{id: "current"}`

## Content Formatting
- All announcement/description/admin-posted text uses `whitespace-pre-wrap`
- Preserves paragraph breaks without requiring HTML input from admins

## Completed Tasks
- Phases 1-10: Full-stack MilSim app + rebrand + unit history
- Phase 11: Security hardening (cookie auth, CORS, password validation, search sanitization)
- Phase 12: UX fixes (auth persistence, paragraph formatting, logo consistency, admin nav, join section CTA) + Member of the Week feature

## Backlog
- None pending
