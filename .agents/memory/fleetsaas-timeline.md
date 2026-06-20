---
name: FleetSaaS timeline event time field
description: The trip timeline endpoint returns plain time strings, not ISO timestamps — do not parse with new Date()
---

The `/api/trips/timeline` endpoint returns `TimelineEvent` objects where the `time` field is a plain human-readable string like `"06:45 AM"` or `"07:15 AM (Expected)"`.

**Why:** The timeline is a static display of the day's route events, not precise timestamps. Returning plain strings avoids timezone complexity and matches the Nepali transport context where times are communicated in 12-hour format.

**How to apply:** In any frontend component rendering timeline events, display `event.time` directly — never pass it to `new Date()` or any date formatting function. This will produce "Invalid Date" errors.
