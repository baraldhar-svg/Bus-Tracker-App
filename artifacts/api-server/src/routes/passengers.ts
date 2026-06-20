import { Router } from "express";
import { db } from "@workspace/db";
import { passengersTable, stationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreatePassengerBody,
  GetPassengerParams,
  UpdatePassengerParams,
  UpdatePassengerBody,
  BoardPassengerParams,
  MarkPassengerLeaveParams,
} from "@workspace/api-zod";

const router = Router();
const PASSENGER_SELECT = {
  id: passengersTable.id,
  name: passengersTable.name,
  phone: passengersTable.phone,
  photoUrl: passengersTable.photoUrl,
  role: passengersTable.role,
  status: passengersTable.status,
  stationId: passengersTable.stationId,
  routeId: passengersTable.routeId,
  stationName: stationsTable.name,
  boardedAt: passengersTable.boardedAt,
  tenantId: passengersTable.tenantId,
  liveToday: passengersTable.liveToday,
  quickMessage: passengersTable.quickMessage,
};

router.get("/", async (req, res) => {
  const rows = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.tenantId, req.tenantId));
  return res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = CreatePassengerBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { name, phone, photoUrl, role, stationId, routeId } = parsed.data;
  const [row] = await db
    .insert(passengersTable)
    .values({ tenantId: req.tenantId, name, phone: phone ?? null, photoUrl: photoUrl ?? null, role: role ?? "student", stationId, routeId: routeId ?? null, status: "pending" })
    .returning();
  const [withStation] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, row.id));
  return res.status(201).json(withStation);
});

router.get("/:id", async (req, res) => {
  const parsed = GetPassengerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, parsed.data.id));
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.patch("/:id", async (req, res) => {
  const paramsParsed = UpdatePassengerParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) return res.status(400).json({ error: "Invalid id" });
  const bodyParsed = UpdatePassengerBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error.message });
  const updates: Record<string, unknown> = {};
  if (bodyParsed.data.name) updates.name = bodyParsed.data.name;
  if ("phone" in bodyParsed.data) updates.phone = bodyParsed.data.phone;
  if (bodyParsed.data.photoUrl) updates.photoUrl = bodyParsed.data.photoUrl;
  if (bodyParsed.data.stationId) updates.stationId = bodyParsed.data.stationId;
  if ("routeId" in bodyParsed.data) updates.routeId = bodyParsed.data.routeId;
  if (bodyParsed.data.liveToday !== undefined) updates.liveToday = bodyParsed.data.liveToday;
  if (bodyParsed.data.quickMessage !== undefined) updates.quickMessage = bodyParsed.data.quickMessage;
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }
  await db.update(passengersTable).set(updates).where(eq(passengersTable.id, paramsParsed.data.id));
  const [row] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, paramsParsed.data.id));
  return res.json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(passengersTable).where(eq(passengersTable.id, id));
  return res.status(204).end();
});

router.post("/:id/board", async (req, res) => {
  const parsed = BoardPassengerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  await db
    .update(passengersTable)
    .set({ status: "boarded", boardedAt: new Date() })
    .where(eq(passengersTable.id, parsed.data.id));
  const [row] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, parsed.data.id));
  return res.json(row);
});

router.post("/:id/unboard", async (req, res) => {
  const parsed = BoardPassengerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  await db
    .update(passengersTable)
    .set({ status: "pending", boardedAt: null })
    .where(eq(passengersTable.id, parsed.data.id));
  const [row] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, parsed.data.id));
  return res.json(row);
});

router.post("/:id/leave", async (req, res) => {
  const parsed = MarkPassengerLeaveParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  await db
    .update(passengersTable)
    .set({ status: "leave", boardedAt: null })
    .where(eq(passengersTable.id, parsed.data.id));
  const [row] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, parsed.data.id));
  return res.json(row);
});

export default router;
