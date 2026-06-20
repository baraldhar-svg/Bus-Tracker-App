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
const DEFAULT_TENANT_ID = 1;

const ROUTE_SELECT = {
  id: routesTable.id,
  tenantId: routesTable.tenantId,
  name: routesTable.name,
  driverId: routesTable.driverId,
  vehicleId: routesTable.vehicleId,
  isActive: routesTable.isActive,
  driverName: driversTable.name,
  vehiclePlate: vehiclesTable.plateNumber,
};

const ROUTE_STATION_SELECT = {
  id: routeStationsTable.id,
  routeId: routeStationsTable.routeId,
  stationId: routeStationsTable.stationId,
  position: routeStationsTable.position,
  stationName: stationsTable.name,
  lat: stationsTable.lat,
  lng: stationsTable.lng,
  radius: stationsTable.radius,
};

// GET /routes — list all routes for tenant
router.get("/", async (req, res) => {
  const rows = await db
    .select(ROUTE_SELECT)
    .from(routesTable)
    .leftJoin(driversTable, eq(routesTable.driverId, driversTable.id))
    .leftJoin(vehiclesTable, eq(routesTable.vehicleId, vehiclesTable.id))
    .where(eq(routesTable.tenantId, DEFAULT_TENANT_ID));
  res.json(rows);
});

// POST /routes — create a route
router.post("/", async (req, res) => {
  const parsed = CreateRouteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { name, driverId, vehicleId } = parsed.data;
  const [row] = await db
    .insert(routesTable)
    .values({ tenantId: DEFAULT_TENANT_ID, name, driverId: driverId ?? null, vehicleId: vehicleId ?? null })
    .returning();
  const [enriched] = await db
    .select(ROUTE_SELECT)
    .from(routesTable)
    .leftJoin(driversTable, eq(routesTable.driverId, driversTable.id))
    .leftJoin(vehiclesTable, eq(routesTable.vehicleId, vehiclesTable.id))
    .where(eq(routesTable.id, row.id));
  res.status(201).json(enriched);
});

// PATCH /routes/:id — update name/driver/vehicle
router.patch("/:id", async (req, res) => {
  const paramsParsed = UpdateRouteParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });
  const bodyParsed = UpdateRouteBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error.message });
  const updates: Record<string, unknown> = {};
  if (bodyParsed.data.name !== undefined) updates.name = bodyParsed.data.name;
  if ("driverId" in bodyParsed.data) updates.driverId = bodyParsed.data.driverId;
  if ("vehicleId" in bodyParsed.data) updates.vehicleId = bodyParsed.data.vehicleId;
  if (bodyParsed.data.isActive !== undefined) updates.isActive = bodyParsed.data.isActive;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
  await db.update(routesTable).set(updates).where(eq(routesTable.id, paramsParsed.data.id));
  const [enriched] = await db
    .select(ROUTE_SELECT)
    .from(routesTable)
    .leftJoin(driversTable, eq(routesTable.driverId, driversTable.id))
    .leftJoin(vehiclesTable, eq(routesTable.vehicleId, vehiclesTable.id))
    .where(eq(routesTable.id, paramsParsed.data.id));
  if (!enriched) return res.status(404).json({ error: "Not found" });
  res.json(enriched);
});

// DELETE /routes/:id
router.delete("/:id", async (req, res) => {
  const parsed = DeleteRouteParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  await db.delete(routesTable).where(eq(routesTable.id, parsed.data.id));
  res.status(204).send();
});

// GET /routes/:id/stations — ordered stations for a route
// Note: /routes/:id/stations/reorder must be registered BEFORE /routes/:id/stations/:stationId
// to avoid Express treating "reorder" as a stationId
router.post("/:id/stations/reorder", async (req, res) => {
  const paramsParsed = ReorderRouteStationsParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });
  const bodyParsed = ReorderRouteStationsBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error.message });
  const { orderedStationIds } = bodyParsed.data;
  await Promise.all(
    orderedStationIds.map((stationId: number, idx: number) =>
      db
        .update(routeStationsTable)
        .set({ position: idx })
        .where(and(eq(routeStationsTable.routeId, paramsParsed.data.id), eq(routeStationsTable.stationId, stationId)))
    )
  );
  const rows = await db
    .select(ROUTE_STATION_SELECT)
    .from(routeStationsTable)
    .leftJoin(stationsTable, eq(routeStationsTable.stationId, stationsTable.id))
    .where(eq(routeStationsTable.routeId, paramsParsed.data.id))
    .orderBy(asc(routeStationsTable.position));
  res.json(rows);
});

router.get("/:id/stations", async (req, res) => {
  const parsed = ListRouteStationsParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const rows = await db
    .select(ROUTE_STATION_SELECT)
    .from(routeStationsTable)
    .leftJoin(stationsTable, eq(routeStationsTable.stationId, stationsTable.id))
    .where(eq(routeStationsTable.routeId, parsed.data.id))
    .orderBy(asc(routeStationsTable.position));
  res.json(rows);
});

// POST /routes/:id/stations — add station to route
router.post("/:id/stations", async (req, res) => {
  const paramsParsed = AddRouteStationParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });
  const bodyParsed = AddRouteStationBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error.message });
  const { stationId, position } = bodyParsed.data;
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
    .values({ routeId: paramsParsed.data.id, stationId, position: pos })
    .returning();
  const [withStation] = await db
    .select(ROUTE_STATION_SELECT)
    .from(routeStationsTable)
    .leftJoin(stationsTable, eq(routeStationsTable.stationId, stationsTable.id))
    .where(eq(routeStationsTable.id, row.id));
  res.status(201).json(withStation);
});

// DELETE /routes/:id/stations/:stationId — remove station from route
router.delete("/:id/stations/:stationId", async (req, res) => {
  const parsed = RemoveRouteStationParams.safeParse({
    id: Number(req.params.id),
    stationId: Number(req.params.stationId),
  });
  if (!parsed.success) return res.status(400).json({ error: "Invalid params" });
  await db.delete(routeStationsTable).where(
    and(eq(routeStationsTable.routeId, parsed.data.id), eq(routeStationsTable.stationId, parsed.data.stationId))
  );
  res.status(204).send();
});

export default router;
