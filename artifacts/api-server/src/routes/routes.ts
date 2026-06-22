import { Router } from "express";
import { db } from "@workspace/db";
import { routesTable, routeStationsTable, driversTable, vehiclesTable, stationsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import {
  CreateRouteBody,
  UpdateRouteParams,
  UpdateRouteBody,
  DeleteRouteParams,
  ListRouteStationsParams,
  AddRouteStationParams,
  AddRouteStationBody,
  RemoveRouteStationParams,
  ReorderRouteStationsParams,
  ReorderRouteStationsBody,
} from "@workspace/api-zod";

const router = Router();

const ROUTE_SELECT = {
  id: routesTable.id,
  tenantId: routesTable.tenantId,
  name: routesTable.name,
  driverId: routesTable.driverId,
  vehicleId: routesTable.vehicleId,
  isActive: routesTable.isActive,
  driverName: driversTable.name,
  vehiclePlate: vehiclesTable.plateNumber,
  departureTime: routesTable.departureTime,
  avgSpeedKmh: routesTable.avgSpeedKmh,
};

const ROUTE_STATION_SELECT = {
  id: routeStationsTable.id,
  routeId: routeStationsTable.routeId,
  stationId: routeStationsTable.stationId,
  position: routeStationsTable.position,
  direction: routeStationsTable.direction,
  stopLabel: routeStationsTable.stopLabel,
  stationName: stationsTable.name,
  lat: stationsTable.lat,
  lng: stationsTable.lng,
  radius: stationsTable.radius,
};

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Parse "HH:MM AM/PM" → total minutes from midnight
function parseTimeToMinutes(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 360; // default 06:00
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

// Format total minutes → "HH:MM AM/PM"
function minutesToTimeStr(totalMin: number): string {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.floor(wrapped % 60);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`;
}

// Compute ETA strings for an ordered list of stations
function computeEtas(
  stations: Array<{ lat: number | null; lng: number | null }>,
  departureTime: string,
  avgSpeedKmh: number
): string[] {
  const base = parseTimeToMinutes(departureTime);
  let cumDistKm = 0;
  return stations.map((s, i) => {
    if (i > 0) {
      const prev = stations[i - 1];
      if (prev.lat != null && prev.lng != null && s.lat != null && s.lng != null) {
        cumDistKm += haversineKm(prev.lat, prev.lng, s.lat, s.lng);
      }
    }
    // travel time + 2-min boarding buffer per stop
    const travelMin = avgSpeedKmh > 0 ? (cumDistKm / avgSpeedKmh) * 60 : 0;
    const bufferMin = i * 2;
    return minutesToTimeStr(base + travelMin + bufferMin);
  });
}

// GET /routes — list all routes for tenant
router.get("/", async (req, res) => {
  const rows = await db
    .select(ROUTE_SELECT)
    .from(routesTable)
    .leftJoin(driversTable, eq(routesTable.driverId, driversTable.id))
    .leftJoin(vehiclesTable, eq(routesTable.vehicleId, vehiclesTable.id))
    .where(eq(routesTable.tenantId, req.tenantId));
  res.json(rows);
});

// POST /routes — create a route
router.post("/", async (req, res) => {
  const parsed = CreateRouteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { name, driverId, vehicleId, departureTime, avgSpeedKmh } = parsed.data as {
    name: string; driverId?: number; vehicleId?: number; departureTime?: string; avgSpeedKmh?: number;
  };
  const [row] = await db
    .insert(routesTable)
    .values({
      tenantId: req.tenantId, name,
      driverId: driverId ?? null, vehicleId: vehicleId ?? null,
      departureTime: departureTime ?? "06:00 AM",
      avgSpeedKmh: avgSpeedKmh ?? 25,
    })
    .returning();
  const [enriched] = await db
    .select(ROUTE_SELECT)
    .from(routesTable)
    .leftJoin(driversTable, eq(routesTable.driverId, driversTable.id))
    .leftJoin(vehiclesTable, eq(routesTable.vehicleId, vehiclesTable.id))
    .where(eq(routesTable.id, row.id));
  return res.status(201).json(enriched);
});

// PATCH /routes/:id — update name/driver/vehicle/departure/speed
router.patch("/:id", async (req, res) => {
  const paramsParsed = UpdateRouteParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });
  const bodyParsed = UpdateRouteBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error.message });
  const updates: Record<string, unknown> = {};
  const d = bodyParsed.data as {
    name?: string; driverId?: number | null; vehicleId?: number | null;
    isActive?: boolean; departureTime?: string; avgSpeedKmh?: number;
  };
  if (d.name !== undefined) updates.name = d.name;
  if ("driverId" in d) updates.driverId = d.driverId;
  if ("vehicleId" in d) updates.vehicleId = d.vehicleId;
  if (d.isActive !== undefined) updates.isActive = d.isActive;
  if (d.departureTime !== undefined) updates.departureTime = d.departureTime;
  if (d.avgSpeedKmh !== undefined) updates.avgSpeedKmh = d.avgSpeedKmh;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
  await db.update(routesTable).set(updates).where(eq(routesTable.id, paramsParsed.data.id));
  const [enriched] = await db
    .select(ROUTE_SELECT)
    .from(routesTable)
    .leftJoin(driversTable, eq(routesTable.driverId, driversTable.id))
    .leftJoin(vehiclesTable, eq(routesTable.vehicleId, vehiclesTable.id))
    .where(eq(routesTable.id, paramsParsed.data.id));
  if (!enriched) return res.status(404).json({ error: "Not found" });
  return res.json(enriched);
});

// DELETE /routes/:id
router.delete("/:id", async (req, res) => {
  const parsed = DeleteRouteParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  await db.delete(routesTable).where(eq(routesTable.id, parsed.data.id));
  return res.status(204).send();
});

// ─── Station sub-resources ────────────────────────────────────────────────────

// Shared helper: fetch ordered stations with computed ETAs for a route
async function fetchStationsWithEta(routeId: number, routeRow?: { departureTime: string; avgSpeedKmh: number }) {
  const rows = await db
    .select(ROUTE_STATION_SELECT)
    .from(routeStationsTable)
    .leftJoin(stationsTable, eq(routeStationsTable.stationId, stationsTable.id))
    .where(eq(routeStationsTable.routeId, routeId))
    .orderBy(asc(routeStationsTable.position));

  // Fetch route settings if not provided
  let dep = "06:00 AM";
  let speed = 25;
  if (routeRow) {
    dep = routeRow.departureTime;
    speed = routeRow.avgSpeedKmh;
  } else {
    const [r] = await db.select({ departureTime: routesTable.departureTime, avgSpeedKmh: routesTable.avgSpeedKmh })
      .from(routesTable).where(eq(routesTable.id, routeId));
    if (r) { dep = r.departureTime; speed = r.avgSpeedKmh; }
  }

  const etas = computeEtas(rows, dep, speed);
  return rows.map((r, i) => ({ ...r, eta: etas[i] ?? null }));
}

// POST /routes/:id/stations/reorder — must be registered BEFORE /:id/stations/:routeStationId
router.post("/:id/stations/reorder", async (req, res) => {
  const paramsParsed = ReorderRouteStationsParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });
  const bodyParsed = ReorderRouteStationsBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error.message });
  const { orderedIds } = bodyParsed.data;
  await Promise.all(
    orderedIds.map((rowId: number, idx: number) =>
      db
        .update(routeStationsTable)
        .set({ position: idx })
        .where(and(eq(routeStationsTable.routeId, paramsParsed.data.id), eq(routeStationsTable.id, rowId)))
    )
  );
  const rows = await fetchStationsWithEta(paramsParsed.data.id);
  return res.json(rows);
});

// GET /routes/:id/stations
router.get("/:id/stations", async (req, res) => {
  const parsed = ListRouteStationsParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const rows = await fetchStationsWithEta(parsed.data.id);
  return res.json(rows);
});

// POST /routes/:id/stations — add station to route (supports duplicate station entries)
router.post("/:id/stations", async (req, res) => {
  const paramsParsed = AddRouteStationParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });
  const bodyParsed = AddRouteStationBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error.message });
  const { stationId, position, direction, stopLabel } = bodyParsed.data as {
    stationId: number; position?: number; direction?: string; stopLabel?: string;
  };
  let pos = position ?? 0;
  if (position === undefined || position === null) {
    const existing = await db
      .select({ position: routeStationsTable.position })
      .from(routeStationsTable)
      .where(eq(routeStationsTable.routeId, paramsParsed.data.id))
      .orderBy(asc(routeStationsTable.position));
    pos = existing.length > 0 ? (existing[existing.length - 1].position + 1) : 0;
  }
  const [row] = await db
    .insert(routeStationsTable)
    .values({
      routeId: paramsParsed.data.id, stationId, position: pos,
      direction: direction ?? "forward",
      stopLabel: stopLabel ?? null,
    })
    .returning();
  const rows = await fetchStationsWithEta(paramsParsed.data.id);
  const withEta = rows.find((r) => r.id === row.id) ?? rows[rows.length - 1];
  return res.status(201).json(withEta);
});

// DELETE /routes/:id/stations/:routeStationId — delete by route_station row ID (supports duplicates)
router.delete("/:id/stations/:routeStationId", async (req, res) => {
  const parsed = RemoveRouteStationParams.safeParse({
    id: Number(req.params.id),
    routeStationId: Number(req.params.routeStationId),
  });
  if (!parsed.success) return res.status(400).json({ error: "Invalid params" });
  await db.delete(routeStationsTable).where(
    and(eq(routeStationsTable.routeId, parsed.data.id), eq(routeStationsTable.id, parsed.data.routeStationId))
  );
  return res.status(204).send();
});

export default router;
