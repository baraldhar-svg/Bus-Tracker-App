---
name: Passenger status enum completeness
description: The generated PassengerStatus type must include all values the API actually writes — "absent" was missing, causing TS2367 typecheck failures.
---

The OpenAPI spec at `lib/api-spec/openapi.yaml` defines the passenger `status` field enum.
When a new status value is introduced in route handlers (e.g. `status: "absent"` in `/absent`), it must also be added to the spec enum or codegen will produce a narrow type that breaks frontend comparisons.

**Why:** Orval generates a literal union from the enum array. Any frontend `p.status === "absent"` check will fail TS2367 if "absent" is not in the array.

**How to apply:** After adding a new status value in any route handler, update `lib/api-spec/openapi.yaml` enum for `Passenger.status` and re-run `pnpm --filter @workspace/api-spec run codegen`.

Current correct enum: `[pending, boarded, absent, leave]`
