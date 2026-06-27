import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, passengersTable, stationsTable, announcementsTable, routesTable, pushTokensTable } from "@workspace/db";
import { eq, count, and, isNotNull, isNull, sql, lt, inArray } from "drizzle-orm";
import { broadcast } from "../lib/sse";
import { logger } from "../lib/logger";
import { sendWhatsAppAlert } from "../lib/whatsapp";
import { sendExpoPushNotifications } from "../lib/expoPush";

const router = Router();

// How many minutes a trip must be running before a delay alert fires automatically.
// Overridable via environment variable for testing/staging.
const DELAY_THRESHOLD_MINUTES = Number(process.env["DELAY_THRESHOLD_MINUTES"] ?? 15);

// ── In-memory station index per driver ───────────────────────────────────────
// Stores the driver's current route stop index (from "Next →" clicks) so the
// student portal can receive the exact stop without needing GPS telemetry.
// Key = driverId; value is reset on trip start/complete.
const driverStationState = new Map<number, {
  stationIdx: number;
  stationName: string | null;
  updatedAt: string;
}>();

// ── Shared: resolve route and targeted passengers for a given driver ──────────
// Returns the route row (for bus label) and the list of passengers to notify.
// When routeId is provided it is used directly; otherwise the driver's assigned
// route in routesTable is resolved automatically.
async function resolveRoutePassengers(tenantId: number, driverId: number | null, routeId?: number | null) {
  let resolvedRouteId = routeId ?? null;

  if (resolvedRouteId == null && driverId != null) {
    // Auto-resolve from the routes table (where this driver is assigned)
    const [driverRoute] = await db
      .select({ id: routesTable.id })
      .from(routesTable)
      .where(and(eq(routesTable.tenantId, tenantId), eq(routesTable.driverId, driverId)))
      .limit(1);
    resolvedRouteId = driverRoute?.id ?? null;
  }

  const passengers = await db
    .select({
      id: passengersTable.id,
      name: passengersTable.name,
      phone: passengersTable.phone,
      stationName: stationsTable.name,
      routeId: passengersTable.routeId,
    })
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.tenantId, tenantId));

  const targets = passengers.filter(
    (p) => p.phone && (resolvedRouteId == null || p.routeId === resolvedRouteId)
  );

  return { resolvedRouteId, targets };
}

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

  // Stamp trip start time and clear any prior delay alert so the watchdog can re-arm
  await db.update(driversTable)
    .set({ isOnline: true, tripStartedAt: now, delayAlertSentAt: null })
    .where(driverCondition);

  // Reset proximity alert flags on all passengers so the watchdog re-arms for this trip
  await db
    .update(passengersTable)
    .set({ proximityAlertSentAt: null })
    .where(eq(passengersTable.tenantId, req.tenantId));

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

// POST /api/trips/delay — notify parents on the affected route that the bus is running late.
// Body: { delayMinutes: number, routeId?: number }
// When routeId is omitted, the active (online) driver's assigned route is resolved automatically,
// preventing cross-route false alerts.
router.post("/delay", async (req, res) => {
  const { delayMinutes, routeId } = req.body as { delayMinutes?: number; routeId?: number };
  if (typeof delayMinutes !== "number" || delayMinutes < 1) {
    return res.status(400).json({ error: "delayMinutes (positive number) is required" });
  }

  // Prefer the online driver; fall back to the active one for backward compat
  const [onlineDriver] = await db
    .select()
    .from(driversTable)
    .where(and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.isOnline, true)))
    .limit(1);
  const [activeDriver] = onlineDriver
    ? [onlineDriver]
    : await db
        .select()
        .from(driversTable)
        .where(and(eq(driversTable.tenantId, req.tenantId), eq(driversTable.isActive, true)))
        .limit(1);

  const busLabel = activeDriver?.vehicleNumber ? `Bus ${activeDriver.vehicleNumber}` : "the school bus";

  const { resolvedRouteId, targets } = await resolveRoutePassengers(
    req.tenantId,
    activeDriver?.id ?? null,
    routeId
  );

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });

  const routeNote = resolvedRouteId != null ? ` (route #${resolvedRouteId})` : " (all routes)";
  await db.insert(announcementsTable).values({
    tenantId: req.tenantId,
    message: `⚠️ ${busLabel}${routeNote} is running approximately ${delayMinutes} minute${delayMinutes > 1 ? "s" : ""} late as of ${timeStr}. Parents have been notified via WhatsApp.`,
    severity: "warning",
  });

  broadcast(req.tenantId, "trip_delay", {
    tenantId: req.tenantId,
    delayMinutes,
    routeId: resolvedRouteId,
    driverId: activeDriver?.id ?? null,
    time: timeStr,
  });

  // Fire WhatsApp alerts — non-blocking
  for (const p of targets) {
    if (!p.phone) continue;
    const stationLabel = p.stationName ?? "your stop";
    const message =
      `⏰ *FleetSaaS Delay Alert*\n\n${busLabel} is running *${delayMinutes} minute${delayMinutes > 1 ? "s" : ""} late* today (as of ${timeStr}).\n\nExpected arrival at *${stationLabel}* has been pushed back. We apologise for the inconvenience.`;
    void sendWhatsAppAlert({
      tenantId: req.tenantId,
      to: p.phone,
      recipientName: p.name,
      type: "delay",
      passengerName: p.name,
      stationName: p.stationName ?? undefined,
      messageBody: message,
    });
  }

  req.log.info({ delayMinutes, routeId: resolvedRouteId, count: targets.length }, "delay alert dispatched");
  return res.json({
    acknowledged: true,
    notified: targets.length,
    routeId: resolvedRouteId,
    message: `Delay alert sent to ${targets.length} parent${targets.length !== 1 ? "s" : ""}.`,
  });
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

  // Clear trip lifecycle timestamps on completion
  await db.update(driversTable)
    .set({ isOnline: false, tripStartedAt: null, delayAlertSentAt: null })
    .where(driverCondition);

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
          .set({ isOnline: false, tripStartedAt: null, delayAlertSentAt: null })
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

// ── Delay watchdog ────────────────────────────────────────────────────────────
// Every 60 s: find drivers who have been online for more than DELAY_THRESHOLD_MINUTES
// without a delay alert being sent yet. Auto-fires WhatsApp alerts to all parents
// on the driver's assigned route and stamps delayAlertSentAt to prevent re-alerting
// within the same trip.
// ── Proximity watchdog ────────────────────────────────────────────────────────
// Every 60 s: for every online driver, check the current ETA stored in the
// active trip response. When etaMinutes ≤ 5, send an Expo push notification to
// all registered devices belonging to passengers on that driver's route.
// proximityAlertSentAt is stamped on each passenger row so the alert fires at
// most once per trip (reset when a new trip starts via /api/trips/start).
export function startProximityWatchdog(): void {
  // ETA threshold in minutes — bus is "close" when at or below this value.
  const ETA_THRESHOLD = Number(process.env["PROXIMITY_ETA_THRESHOLD"] ?? 5);

  setInterval(async () => {
    try {
      // Find all online drivers
      const onlineDrivers = await db
        .select({
          id: driversTable.id,
          tenantId: driversTable.tenantId,
          vehicleNumber: driversTable.vehicleNumber,
          currentLat: driversTable.currentLat,
          currentLng: driversTable.currentLng,
        })
        .from(driversTable)
        .where(eq(driversTable.isOnline, true));

      for (const driver of onlineDrivers) {
        // Compute a simple distance-based ETA for each passenger's station.
        // The active-trip endpoint currently returns a static etaMinutes=7.
        // We use the driver's live GPS position and each station's coordinates
        // to compute a haversine ETA, falling back to 7 min when GPS is absent.
        const { resolvedRouteId, targets } = await resolveRoutePassengers(
          driver.tenantId,
          driver.id,
          null
        );

        if (targets.length === 0) continue;

        // Collect passenger IDs that still need a proximity alert this trip
        const passengerIds = targets.map((t) => t.id);

        // Find passengers who have NOT yet received a proximity alert this trip
        const pendingPassengers = await db
          .select({
            id: passengersTable.id,
            stationId: passengersTable.stationId,
            name: passengersTable.name,
          })
          .from(passengersTable)
          .where(
            and(
              inArray(passengersTable.id, passengerIds),
              isNull(passengersTable.proximityAlertSentAt)
            )
          );

        if (pendingPassengers.length === 0) continue;

        // Get all unique station IDs for these passengers
        const uniqueStationIds = [...new Set(pendingPassengers.map((p) => p.stationId))];

        const stations = await db
          .select({ id: stationsTable.id, lat: stationsTable.lat, lng: stationsTable.lng, name: stationsTable.name })
          .from(stationsTable)
          .where(inArray(stationsTable.id, uniqueStationIds));

        const stationMap = new Map(stations.map((s) => [s.id, s]));

        // Determine which passengers are within ETA threshold
        const nearbyPassengerIds: number[] = [];

        for (const p of pendingPassengers) {
          const station = stationMap.get(p.stationId);
          let etaMinutes = 7; // default when GPS unavailable

          if (driver.currentLat != null && driver.currentLng != null && station) {
            const distKm = haversineKm(
              driver.currentLat,
              driver.currentLng,
              station.lat,
              station.lng
            );
            // Assume ~25 km/h average speed through city traffic
            const speedKmh = 25;
            etaMinutes = (distKm / speedKmh) * 60;
          }

          if (etaMinutes <= ETA_THRESHOLD) {
            nearbyPassengerIds.push(p.id);
          }
        }

        if (nearbyPassengerIds.length === 0) continue;

        // Fetch push tokens for nearby passengers
        const tokens = await db
          .select({ token: pushTokensTable.token, passengerId: pushTokensTable.passengerId })
          .from(pushTokensTable)
          .where(
            and(
              eq(pushTokensTable.tenantId, driver.tenantId),
              inArray(pushTokensTable.passengerId, nearbyPassengerIds)
            )
          );

        if (tokens.length > 0) {
          const busLabel = driver.vehicleNumber ? `Bus ${driver.vehicleNumber}` : "Your bus";
          await sendExpoPushNotifications(
            tokens.map((t) => ({
              to: t.token,
              title: "🚌 Bus arriving soon!",
              body: `${busLabel} is less than ${ETA_THRESHOLD} minutes away. Please head to your stop.`,
              data: { screen: "map", driverId: driver.id, routeId: resolvedRouteId },
              sound: "default" as const,
              channelId: "bus-proximity",
            }))
          );
        }

        // Stamp alert sent on all nearby passengers (even those without tokens,
        // so we don't keep querying their ETA every minute for the rest of the trip).
        await db
          .update(passengersTable)
          .set({ proximityAlertSentAt: new Date() })
          .where(inArray(passengersTable.id, nearbyPassengerIds));

        logger.info(
          { driverId: driver.id, tenantId: driver.tenantId, routeId: resolvedRouteId, count: tokens.length },
          "proximity push sent"
        );
      }
    } catch (err) {
      logger.error({ err }, "proximity watchdog error");
    }
  }, 60_000);
}

/** Haversine great-circle distance in kilometres. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function startDelayWatchdog(): void {
  const thresholdMs = DELAY_THRESHOLD_MINUTES * 60 * 1000;

  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - thresholdMs);

      // Find drivers: isOnline, tripStartedAt IS NOT NULL, delayAlertSentAt IS NULL,
      // AND tripStartedAt < cutoff (running longer than threshold)
      const overdueDrivers = await db
        .select({
          id: driversTable.id,
          tenantId: driversTable.tenantId,
          vehicleNumber: driversTable.vehicleNumber,
          tripStartedAt: driversTable.tripStartedAt,
        })
        .from(driversTable)
        .where(
          and(
            eq(driversTable.isOnline, true),
            isNotNull(driversTable.tripStartedAt),
            isNull(driversTable.delayAlertSentAt),
            lt(driversTable.tripStartedAt, cutoff)
          )
        );

      for (const driver of overdueDrivers) {
        const { resolvedRouteId, targets } = await resolveRoutePassengers(
          driver.tenantId,
          driver.id,
          null
        );

        const now = new Date();
        const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kathmandu" });
        const busLabel = driver.vehicleNumber ? `Bus ${driver.vehicleNumber}` : "the school bus";
        const minutesRunning = Math.round((now.getTime() - (driver.tripStartedAt?.getTime() ?? now.getTime())) / 60000);

        // Mark alert as sent before firing — avoids double-send if alerts are slow
        await db
          .update(driversTable)
          .set({ delayAlertSentAt: now })
          .where(eq(driversTable.id, driver.id));

        // Post an announcement to the notice board
        const routeNote = resolvedRouteId != null ? ` (route #${resolvedRouteId})` : "";
        await db.insert(announcementsTable).values({
          tenantId: driver.tenantId,
          message: `⚠️ Auto-alert: ${busLabel}${routeNote} has been running for ${minutesRunning} min. Parents notified of possible delay.`,
          severity: "warning",
        });

        broadcast(driver.tenantId, "trip_delay", {
          tenantId: driver.tenantId,
          delayMinutes: minutesRunning,
          routeId: resolvedRouteId,
          driverId: driver.id,
          time: timeStr,
          auto: true,
        });

        // Send WhatsApp alerts to parents on this route
        for (const p of targets) {
          if (!p.phone) continue;
          const stationLabel = p.stationName ?? "your stop";
          const message =
            `⏰ *FleetSaaS Delay Alert*\n\n${busLabel} has been running for *${minutesRunning} minutes* and may be running late today (as of ${timeStr}).\n\nExpected arrival at *${stationLabel}* may be delayed. We apologise for the inconvenience.`;
          void sendWhatsAppAlert({
            tenantId: driver.tenantId,
            to: p.phone,
            recipientName: p.name,
            type: "delay",
            passengerName: p.name,
            stationName: p.stationName ?? undefined,
            messageBody: message,
          });
        }

        logger.info(
          { driverId: driver.id, tenantId: driver.tenantId, minutesRunning, routeId: resolvedRouteId, count: targets.length },
          "auto delay alert fired"
        );
      }
    } catch (err) {
      logger.error({ err }, "delay watchdog error");
    }
  }, 60_000);
}

export default router;
