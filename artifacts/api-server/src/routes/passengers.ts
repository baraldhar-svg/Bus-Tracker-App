import { Router } from "express";
import { db } from "@workspace/db";
import { passengersTable, stationsTable, usersTable, tenantsTable, boardingLogsTable, driversTable, driverNotificationsTable } from "@workspace/db";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { broadcast } from "../lib/sse";
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
  routeSubscribedAt: passengersTable.routeSubscribedAt,
};

const SUBSCRIPTION_DAYS = 30;
const EXPIRY_WARN_DAYS = 5;

function computeSubStatus(row: { routeId: number | null; routeSubscribedAt: Date | null }) {
  const hasRoute = row.routeId != null;
  if (!hasRoute || !row.routeSubscribedAt) {
    return { isPaying: false, isExpired: false, daysLeft: null, showExpiryBanner: false };
  }
  const daysElapsed = Math.floor((Date.now() - new Date(row.routeSubscribedAt).getTime()) / 86400000);
  const isExpired = daysElapsed >= SUBSCRIPTION_DAYS;
  const isPaying = !isExpired;
  const daysLeft = Math.max(0, SUBSCRIPTION_DAYS - daysElapsed);
  const showExpiryBanner = isPaying && daysLeft <= EXPIRY_WARN_DAYS;
  return { isPaying, isExpired, daysLeft, showExpiryBanner };
}

router.get("/", async (req, res) => {
  const rows = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.tenantId, req.tenantId));
  const enriched = rows.map((r) => ({ ...r, ...computeSubStatus(r) }));
  return res.json(enriched);
});

// GET /passengers/boarding-logs — real-time boarding audit log for admin
router.get("/boarding-logs", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 200);
  const rows = await db
    .select()
    .from(boardingLogsTable)
    .where(eq(boardingLogsTable.tenantId, req.tenantId))
    .orderBy(desc(boardingLogsTable.actionAt))
    .limit(limit);
  return res.json(rows);
});

// GET /passengers/communications — merged communications log for admin
// (boarding events + driver notifications + student messages)
router.get("/communications", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 200);

  const [boardingLogs, driverNotifs, studentMsgs] = await Promise.all([
    db.select().from(boardingLogsTable)
      .where(eq(boardingLogsTable.tenantId, req.tenantId))
      .orderBy(desc(boardingLogsTable.actionAt))
      .limit(limit),
    db.select().from(driverNotificationsTable)
      .where(eq(driverNotificationsTable.tenantId, req.tenantId))
      .orderBy(desc(driverNotificationsTable.sentAt))
      .limit(limit),
    db.select({
      id: passengersTable.id,
      name: passengersTable.name,
      stationName: stationsTable.name,
      quickMessage: passengersTable.quickMessage,
    })
      .from(passengersTable)
      .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
      .where(and(
        eq(passengersTable.tenantId, req.tenantId),
        isNotNull(passengersTable.quickMessage),
      )),
  ]);

  const merged = [
    ...boardingLogs.map((l) => ({
      id: `boarding-${l.id}`,
      type: "boarding" as const,
      passengerName: l.passengerName,
      stationName: l.stationName,
      content: l.action,
      timestamp: l.actionAt,
      driverName: l.driverName,
    })),
    ...driverNotifs.map((n) => ({
      id: `notify-${n.id}`,
      type: "driver_notification" as const,
      passengerName: n.passengerName,
      stationName: n.stationName,
      content: n.message,
      timestamp: n.sentAt,
      driverName: n.driverName,
    })),
    ...studentMsgs.filter((p) => p.quickMessage).map((p) => ({
      id: `msg-${p.id}`,
      type: "student_message" as const,
      passengerName: p.name,
      stationName: p.stationName ?? null,
      content: p.quickMessage!,
      timestamp: null as Date | null,
      driverName: null as string | null,
    })),
  ].sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  }).slice(0, limit);

  return res.json(merged);
});

router.post("/", async (req, res) => {
  const parsed = CreatePassengerBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { name, phone, photoUrl, role, stationId, routeId, className, section, rollNumber, faculty } = parsed.data;
  const [row] = await db
    .insert(passengersTable)
    .values({
      tenantId: req.tenantId,
      name,
      phone: phone ?? null,
      photoUrl: photoUrl ?? null,
      role: role ?? "student",
      stationId,
      routeId: routeId ?? null,
      status: "pending",
      className: className ?? null,
      section: section ?? null,
      rollNumber: rollNumber ?? null,
      faculty: faculty ?? null,
    })
    .returning();

  // Auto-create a users record so this person can log in with their phone number.
  // If the phone already exists in usersTable, skip (never create duplicates).
  if (phone) {
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (!existingUser) {
      // Fetch the tenant's school code so OTP login can verify it
      let schoolCode: string | null = null;
      const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.tenantId)).limit(1);
      if (tenant) schoolCode = tenant.schoolCode ?? null;

      await db.insert(usersTable).values({
        phone,
        name,
        role: role ?? "student",
        tenantId: req.tenantId,
        schoolCode,
        photoUrl: photoUrl ?? null,
      });
    }
  }

  const [withStation] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, row.id));
  const result = { ...withStation, ...computeSubStatus(withStation) };
  return res.status(201).json(result);
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
  return res.json({ ...row, ...computeSubStatus(row) });
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
  if ("routeId" in bodyParsed.data) {
    updates.routeId = bodyParsed.data.routeId;
    // Stamp routeSubscribedAt when a route is first assigned
    if (bodyParsed.data.routeId != null) {
      const [existing] = await db
        .select({ routeSubscribedAt: passengersTable.routeSubscribedAt })
        .from(passengersTable)
        .where(eq(passengersTable.id, paramsParsed.data.id))
        .limit(1);
      if (!existing?.routeSubscribedAt) {
        updates.routeSubscribedAt = new Date();
      }
    }
  }
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
  return res.json({ ...row, ...computeSubStatus(row) });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(passengersTable).where(eq(passengersTable.id, id));
  return res.status(204).end();
});

// POST /api/passengers/:id/renew — reset subscription window to now (manual renewal / payment success)
router.post("/:id/renew", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const renewedAt = new Date();
  await db.update(passengersTable)
    .set({ routeSubscribedAt: renewedAt })
    .where(eq(passengersTable.id, id));
  return res.json({ ok: true, renewedAt: renewedAt.toISOString() });
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
  // Write boarding audit log
  if (row) {
    const [activeDriver] = await db.select().from(driversTable)
      .where(eq(driversTable.tenantId, req.tenantId)).limit(1);
    await db.insert(boardingLogsTable).values({
      tenantId: req.tenantId,
      passengerId: row.id,
      passengerName: row.name,
      stationId: row.stationId ?? 0,
      stationName: row.stationName ?? "Unknown",
      driverId: activeDriver?.id ?? null,
      driverName: activeDriver?.name ?? null,
      action: "boarded",
    });
  }
  broadcast("passengers_updated", { tenantId: req.tenantId, passengerId: parsed.data.id, action: "boarded" });
  return res.json({ ...row, ...computeSubStatus(row ?? { routeId: null, routeSubscribedAt: null }) });
});

router.post("/:id/absent", async (req, res) => {
  const parsed = BoardPassengerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  await db
    .update(passengersTable)
    .set({ status: "absent", boardedAt: null })
    .where(eq(passengersTable.id, parsed.data.id));
  const [row] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, parsed.data.id));
  // Write absent audit log
  if (row) {
    const [activeDriver] = await db.select().from(driversTable)
      .where(eq(driversTable.tenantId, req.tenantId)).limit(1);
    await db.insert(boardingLogsTable).values({
      tenantId: req.tenantId,
      passengerId: row.id,
      passengerName: row.name,
      stationId: row.stationId ?? 0,
      stationName: row.stationName ?? "Unknown",
      driverId: activeDriver?.id ?? null,
      driverName: activeDriver?.name ?? null,
      action: "absent",
    });
  }
  broadcast("passengers_updated", { tenantId: req.tenantId, passengerId: parsed.data.id, action: "absent" });
  return res.json({ ...row, ...computeSubStatus(row ?? { routeId: null, routeSubscribedAt: null }) });
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
  broadcast("passengers_updated", { tenantId: req.tenantId, passengerId: parsed.data.id, action: "unboarded" });
  return res.json({ ...row, ...computeSubStatus(row ?? { routeId: null, routeSubscribedAt: null }) });
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
  broadcast("passengers_updated", { tenantId: req.tenantId, passengerId: parsed.data.id, action: "leave" });
  return res.json({ ...row, ...computeSubStatus(row ?? { routeId: null, routeSubscribedAt: null }) });
});

// POST /api/passengers/:id/driver-notify — driver sends "waiting" ping to a student
// Deduplicated: one notification per passenger per station per calendar day
router.post("/:id/driver-notify", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [passenger] = await db
    .select(PASSENGER_SELECT)
    .from(passengersTable)
    .leftJoin(stationsTable, eq(passengersTable.stationId, stationsTable.id))
    .where(eq(passengersTable.id, id));
  if (!passenger) return res.status(404).json({ error: "Not found" });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const [existing] = await db
    .select()
    .from(driverNotificationsTable)
    .where(and(
      eq(driverNotificationsTable.passengerId, id),
      eq(driverNotificationsTable.stationId, passenger.stationId ?? 0),
      eq(driverNotificationsTable.tripDate, today),
    ))
    .limit(1);

  if (existing) {
    return res.json({ ok: false, alreadySent: true, sentAt: existing.sentAt });
  }

  const [activeDriver] = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.tenantId, req.tenantId))
    .limit(1);

  const [notification] = await db
    .insert(driverNotificationsTable)
    .values({
      tenantId: req.tenantId,
      passengerId: id,
      passengerName: passenger.name,
      stationId: passenger.stationId ?? 0,
      stationName: passenger.stationName ?? "Unknown",
      driverId: activeDriver?.id ?? null,
      driverName: activeDriver?.name ?? null,
      message: "Driver is waiting for you. Please come to the station.",
      tripDate: today,
    })
    .returning();

  broadcast("driver_notification", { tenantId: req.tenantId, passengerId: id, message: notification.message });
  return res.json({ ok: true, alreadySent: false, notification });
});

export default router;
