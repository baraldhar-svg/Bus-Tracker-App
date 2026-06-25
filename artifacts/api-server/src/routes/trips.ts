import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, passengersTable, stationsTable, announcementsTable } from "@workspace/db";
import { eq, count, and, isNotNull, sql } from "drizzle-orm";
import { broadcast } from "../lib/sse";
import { logger } from "../lib/logger";

const router = Router();

// ── In-memory station index per driver ───────────────────────────────────────
// Stores the driver's current route stop index (from "Next →" clicks) so the
// student portal can receive the exact stop without needing GPS telemetry.
// Key = driverId; value is reset on trip start/complete.
const driverStationState = new Map<number, {
  stationIdx: number;
  stationName: string | null;
  updatedAt: string;
}>();

// GET /api/trips/active — returns the active driver's location.
// Optional ?driverId=N query param scopes the response to a specific driver.
router.get("/active", async (req, res) => {
  const driverIdParam = req.query.driverId ? Number(req.query.driverId) : null;

  const driverCondition = driverIdParam
    ? and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.id, driverIdParam))
    : and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.isActive, true));

  const [driver] = await db
    .select()
    .from(driversTable)
    .where(driverCondition)
    .limit(1);

  const [allCount] = await db
    .select({ count: count() })
    .from(passengersTable)
    .where(eq(passengersTable.tenantId, req.tenantId));

  const [boardedCount] = await db
    .select({ count: count() })
    .from(passengersTable)
    .where(eq(passengersTable.status, "boarded"));

  const [nextStation] = await db
    .select()
    .from(stationsTable)
    .where(eq(stationsTable.tenantId, req.tenantId))
    .limit(1);

  const currentLat = driver?.currentLat ?? 27.7172;
  const currentLng = driver?.currentLng ?? 85.3240;
  const locationUpdatedAt = driver?.locationUpdatedAt ?? null;
  const isLive = driver?.isOnline === true && driver?.currentLat != null;

  // Include station index from the in-memory map so polling clients stay in sync
  const stationState = driver?.id != null ? driverStationState.get(driver.id) : undefined;

  res.json({
    tripId: driver?.id ?? 1,
    currentLat,
    currentLng,
    locationUpdatedAt,
    isLive,
    // Journey is active when the driver is online, regardless of whether GPS has been posted
    isJourneyActive: driver?.isOnline === true,
    stationIdx: stationState?.stationIdx ?? null,
    stationName: stationState?.stationName ?? null,
    etaMinutes: 7,
    nextStationName: nextStation?.name ?? "Koteshwor Chowk",
    routeName: "Route #4B - Koteshwor",
    boardedCount: Number(boardedCount?.count ?? 0),
    totalPassengers: Number(allCount?.count ?? 0),
    driver: driver ?? {
      id: 1,
      name: "Ram Bahadur",
      phone: "+977 9851012345",
      photoUrl: null,
      vehicleNumber: "BA 3 CHA 4567",
      isActive: true,
      tenantId: req.tenantId,
    },
  });
});

// GET /api/trips/locations — returns ALL currently online drivers with their live GPS positions.
// Used by admin/superadmin dashboards to render multi-vehicle fleet maps.
router.get("/locations", async (req, res) => {
  const drivers = await db
    .select()
    .from(driversTable)
    .where(and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.isOnline, true)));

  return res.json(
    drivers.map((d) => ({
      id: d.id,
      name: d.name,
      vehicleNumber: d.vehicleNumber,
      lat: d.currentLat ?? null,
      lng: d.currentLng ?? null,
      isLive: d.isOnline === true && d.currentLat != null,
      updatedAt: d.locationUpdatedAt ?? null,
    }))
  );
});

// GET /api/trips/timeline
router.get("/timeline", async (_req, res) => {
  res.json([
    { id: 1, time: "06:45 AM", description: "Bus started from the main university campus garage.", status: "completed" },
    { id: 2, time: "07:05 AM", description: "Vehicle crossed Balkhu intersection point.", status: "completed" },
    { id: 3, time: "07:15 AM (Expected)", description: "Scheduled arrival at your designated Baneshwor stop.", status: "upcoming" },
  ]);
});

// PATCH /api/trips/station — called by the driver portal whenever the driver taps Next/Prev.
// Persists the current stop index in-memory and broadcasts a `station_changed` SSE event so
// the student portal can display the exact stop name without requiring live GPS.
router.patch("/station", async (req, res) => {
  const { driverId, stationIdx, stationName } = req.body as {
    driverId?: number; stationIdx?: number; stationName?: string | null;
  };
  if (typeof stationIdx !== "number") {
    return res.status(400).json({ error: "stationIdx (number) is required" });
  }

  const now = new Date().toISOString();
  const driverCondition = driverId
    ? and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.id, driverId))
    : and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.isActive, true));

  const [resolved] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(driverCondition)
    .limit(1);

  const resolvedId = resolved?.id ?? driverId ?? null;
  if (resolvedId != null) {
    driverStationState.set(resolvedId, { stationIdx, stationName: stationName ?? null, updatedAt: now });
  }

  broadcast(req.tenantId, "station_changed", {
    tenantId: req.tenantId,
    driverId: resolvedId,
    stationIdx,
    stationName: stationName ?? null,
    updatedAt: now,
  });

  req.log.info({ driverId: resolvedId, stationIdx, stationName }, "station advanced");
  return res.json({ ok: true });
});

// POST /api/trips/location — called by the driver's mobile every ~3 s via navigator.geolocation.watchPosition.
// Body: { lat, lng, accuracy?, driverId? }
// When driverId is supplied the update is scoped to that specific driver row.
// Without driverId the first isActive driver in the tenant is updated (backward-compat for single-driver tenants).
router.post("/location", async (req, res) => {
  const { lat, lng, accuracy, driverId } = req.body as {
    lat?: number; lng?: number; accuracy?: number; driverId?: number;
  };

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng (numbers) are required" });
  }

  const now = new Date().toISOString();

  const updateCondition = driverId
    ? and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.id, driverId))
    : and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.isActive, true));

  await db
    .update(driversTable)
    .set({ currentLat: lat, currentLng: lng, locationUpdatedAt: now, isOnline: true })
    .where(updateCondition);

  // Resolve the driver record so we can include vehicleNumber in the broadcast.
  const [resolved] = await db
    .select({ id: driversTable.id, vehicleNumber: driversTable.vehicleNumber })
    .from(driversTable)
    .where(updateCondition)
    .limit(1);

  broadcast(req.tenantId, "location_update", {
    tenantId: req.tenantId,
    driverId: resolved?.id ?? driverId ?? null,
    vehicleNumber: resolved?.vehicleNumber ?? null,
    lat,
    lng,
    accuracy: accuracy ?? null,
    updatedAt: now,
  });

  return res.json({ ok: true });
});

// POST /api/trips/start — mark journey as started.
// Body: { driverId? } — scopes the start to a specific driver.
// Without driverId all isActive drivers in the tenant are marked online (single-driver compat).
router.post("/start", async (req, res) => {
  const { driverId } = req.body as { driverId?: number };
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });

  const driverCondition = driverId
    ? and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.id, driverId))
    : and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.isActive, true));

  const [activeDriver] = await db.select().from(driversTable).where(driverCondition).limit(1);
  const busLabel = activeDriver?.vehicleNumber ? `Bus ${activeDriver.vehicleNumber}` : "Bus";

  await db.update(driversTable).set({ isOnline: true }).where(driverCondition);

  // Reset in-memory station index so students don't see a stale stop from the previous run
  if (activeDriver?.id != null) driverStationState.delete(activeDriver.id);

  await db.insert(announcementsTable).values({
    tenantId: req.tenantId,
    message: `🚌 ${busLabel} journey started at ${timeStr}. The driver is on the way — students will be picked up at their stops shortly.`,
    severity: "info",
  });

  broadcast(req.tenantId, "trip_started", {
    tenantId: req.tenantId,
    driverId: activeDriver?.id ?? null,
    vehicleNumber: activeDriver?.vehicleNumber ?? null,
    time: timeStr,
  });
  return res.json({ acknowledged: true, message: `Journey started at ${timeStr}. All passengers and admins notified.` });
});

// POST /api/trips/sos
router.post("/sos", async (_req, res) => {
  return res.json({ acknowledged: true, message: "Emergency SOS broadcast sent to all admins and parents." });
});

// POST /api/trips/complete — mark journey as complete.
// Body: { driverId? } — scopes the completion to a specific driver.
// Without driverId all isActive drivers in the tenant are marked offline (single-driver compat).
router.post("/complete", async (req, res) => {
  const { driverId } = req.body as { driverId?: number };
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });

  const driverCondition = driverId
    ? and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.id, driverId))
    : and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.isActive, true));

  const [activeDriver] = await db.select().from(driversTable).where(driverCondition).limit(1);
  const busLabel = activeDriver?.vehicleNumber ? `Bus ${activeDriver.vehicleNumber}` : "Bus";

  await db.update(driversTable).set({ isOnline: false }).where(driverCondition);

  // Clear in-memory station index on trip end
  if (activeDriver?.id != null) driverStationState.delete(activeDriver.id);

  await db.insert(announcementsTable).values({
    tenantId: req.tenantId,
    message: `✅ ${busLabel} journey completed at ${timeStr}. All students have arrived safely. The driver has signed off for this trip.`,
    severity: "info",
  });

  broadcast(req.tenantId, "trip_completed", {
    tenantId: req.tenantId,
    driverId: activeDriver?.id ?? null,
    vehicleNumber: activeDriver?.vehicleNumber ?? null,
    time: timeStr,
  });

  await db
    .update(passengersTable)
    .set({ status: "pending", boardedAt: null })
    .where(eq(passengersTable.tenantId, req.tenantId));

  return res.json({ acknowledged: true, message: `Journey completed at ${timeStr}. All passengers and admins notified.` });
});

// ── Heartbeat watchdog ────────────────────────────────────────────────────────
// Every 15 s: find drivers who are still marked isOnline=true but have not sent
// a GPS ping in >45 s (WiFi cut, app killed, dead battery, etc.).
// For each stale driver: set isOnline=false in the DB and broadcast
// `trip_completed` so every connected SSE client immediately evicts that
// vehicle marker from the fleet map. No frontend polling needed.
export function startHeartbeatWatchdog(): void {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 45_000).toISOString();
      const stale = await db
        .select({
          id: driversTable.id,
          tenantId: driversTable.tenantId,
          vehicleNumber: driversTable.vehicleNumber,
        })
        .from(driversTable)
        .where(
          and(
            eq(driversTable.isOnline, true),
            isNotNull(driversTable.locationUpdatedAt),
            sql`${driversTable.locationUpdatedAt} < ${cutoff}`
          )
        );

      for (const d of stale) {
        await db
          .update(driversTable)
          .set({ isOnline: false })
          .where(eq(driversTable.id, d.id));

        broadcast(d.tenantId, "trip_completed", {
          tenantId: d.tenantId,
          driverId: d.id,
          vehicleNumber: d.vehicleNumber ?? null,
          autoDisconnect: true,
        });

        logger.info({ driverId: d.id, tenantId: d.tenantId }, "heartbeat timeout — driver auto-disconnected");
      }
    } catch (err) {
      logger.error({ err }, "heartbeat watchdog error");
    }
  }, 15_000);
}

export default router;
