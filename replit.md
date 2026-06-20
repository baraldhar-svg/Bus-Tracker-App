# FleetSaaS — School Bus Tracking Platform

A multi-tenant SaaS school bus tracking system for Nepal with four role portals (Parent, Driver, Admin, SuperAdmin), live GPS tracking, passenger boarding management, OTP auth simulation, and a subscription paywall system.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/fleetsaas run dev` — run the frontend (port 18789)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, wouter, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — Single source of truth for API contracts
- `lib/db/src/schema/` — Drizzle schema: tenants.ts, fleet.ts, passengers.ts, subscriptions.ts
- `artifacts/api-server/src/routes/` — Express route handlers (one file per domain)
- `artifacts/fleetsaas/src/` — React frontend with role-based portals

## Architecture decisions

- Single tenant in DB (id=1) used for all portal data; SaaS multi-tenancy scaffolded in schema
- Subscription paywall: 30-day trial tracked via `created_at`; `paywallActive` computed server-side
- Timeline events return plain time strings (not ISO dates) — render directly without Date parsing
- Fleet swap: deactivates all drivers/vehicles, activates the specified ones
- SuperAdmin stats augmented with mock baseline numbers so dashboard always shows meaningful data

## Product

- **Parent Portal**: Tenant header, photo upload, assigned fleet card with live track map, emergency notice board, OTP auth sandbox, tracking timeline
- **Driver Portal**: Dark-themed command view, station navigator, passenger boarding checklist with photo popups, emergency SOS button
- **Admin Portal**: Fleet swap, geofence station management, announcement board, subscription display
- **SuperAdmin Portal**: Global metrics dashboard, tenant table with revenue data

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Timeline event `.time` field is a plain string like "06:45 AM" — do NOT parse with `new Date()`
- Always re-run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- `pnpm run typecheck:libs` needed after lib changes before artifact typechecks

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
