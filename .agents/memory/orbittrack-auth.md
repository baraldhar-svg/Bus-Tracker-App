---
name: OrbitTrack Auth & Architecture
description: Key decisions for OrbitTrack's auth system, routing, and new tables
---

## Auth System
- OTP flow: POST /api/auth/send-otp → POST /api/auth/verify-otp → POST /api/auth/register
- No JWT/session on server — session stored in localStorage under key `orbittrack_user`
- AuthProvider wraps the whole app via `src/hooks/use-auth.tsx`
- Auth API calls use direct fetch() (not Orval-generated hooks) since routes were added post-codegen

**Why:** Adding OTP auth to OpenAPI + running codegen adds several steps; direct fetch is faster for auth-only routes. If adding more endpoints, update openapi.yaml and re-run codegen.

## DB Tables Added
- `users` — id, phone (unique), name, title, photoUrl, role, schoolCode, tenantId
- `otp_codes` — id, phone, code, expiresAt, used
- `advertisements` — id, title, subtitle, imageUrl, targetUrl, tenantId, sortOrder, active
- `tenants` — added: address, contactPhone, schoolCode (no unique constraint — enforced in app)

## Demo Codes
- School code for tenant 1: "ORBIT2024" — set by auth fallback logic if not in DB
- OTP: always returned as demoCode in JSON response for demo mode

## Frontend Routing
- `/` → Landing (if logged out) or redirect to /dashboard (if logged in)
- `/auth?mode=register|login` → OTP + register flow
- `/dashboard` → AuthGuard → Dashboard with AdCarousel + role portals
- `/school/:id` → SchoolProfile (1 = real tenant; 2-5 = mock profiles)

## Advertisements
- Auto-seeded with 5 Nepal school/college banners on first GET /api/advertisements
- SuperAdmin can manage via POST/PATCH/DELETE /api/advertisements
