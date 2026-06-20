---
name: Orval codegen types conflict fix
description: How to fix TS2308 "already exported member" when orval generates both Zod schemas and TypeScript interfaces with the same name
---

## The Problem
When component schemas in `openapi.yaml` are named with patterns like `CreateXBody` / `UpdateXBody`, orval generates:
1. Zod schema (`api.ts`): `export const CreateXBody = zod.object({...})`
2. TS interface (`types/createXBody.ts`): `export interface CreateXBody {...}`

Both are re-exported from `lib/api-zod/src/index.ts` causing TS2308 ambiguity.

## The Fix (already applied)
1. Removed `schemas: { path: "generated/types", type: "typescript" }` from `lib/api-spec/orval.config.ts` → stops generating `types/` directory.
2. Added `lib/api-spec/fix-zod-index.cjs` — a post-codegen script that strips the stale `export * from './generated/types'` line orval still injects into `index.ts`.
3. Changed codegen script in `lib/api-spec/package.json` to: `orval && node fix-zod-index.cjs && pnpm -w run typecheck:libs`

**Why:** Orval always regenerates `lib/api-zod/src/index.ts` (it owns that barrel file), so the fix cannot be done by editing the barrel — it must be done via a post-codegen script.

## BS Calendar function signatures (easy to misremember)
- `adToBs(adYear: number, adMonth: number, adDay: number): BsDate` — takes numbers, NOT a Date object
- `bsToAd(bsYear, bsMonth, bsDay): { year, month, day }` — returns plain object, NOT a JS Date; use `.year`/`.month`/`.day`
- `formatBsDate(bs: BsDate): string` — takes a BsDate object, NOT (year, month, day) separately
- `bsDateToAd(bsYear, bsMonth, bsDay): string` — returns YYYY-MM-DD ISO string
