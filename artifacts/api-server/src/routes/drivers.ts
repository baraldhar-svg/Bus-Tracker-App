import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, usersTable, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateDriverBody } from "@workspace/api-zod";
import { broadcast } from "../lib/sse";

/** Strip +977 country prefix, spaces, and dashes for consistent phone storage. */
function normalizePhone(raw: string): string {
  const s = raw.replace(/[\s\-()]/g, "");
  if (s.startsWith("+977")) return s.slice(4);
  if (s.startsWith("977") && s.length > 10) return s.slice(3);
  return s;
}

const router = Router();

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.tenantId, req.tenantId));
  res.json(rows);
});

router.get("/active", async (req, res) => {
  const rows = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.isActive, true))
    .limit(1);
  if (!rows.length) {
    const all = await db.select().from(driversTable).limit(1);
    return res.json(all[0] ?? { id: 1, name: "Ram Bahadur", phone: "+977 9851012345", vehicleNumber: "BA 3 CHA 4567", isActive: true });
  }
  return res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { name, photoUrl, vehicleNumber } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);

  // Block duplicate phone before insert (UNIQUE constraint would also catch this)
  const existing = await db.select().from(driversTable).where(eq(driversTable.phone, phone)).limit(1);
  if (existing.length) {
    return res.status(409).json({ error: "A driver with this phone number already exists." });
  }

  const [row] = await db
    .insert(driversTable)
    .values({ tenantId: req.tenantId, name, phone, photoUrl: photoUrl ?? null, vehicleNumber, isActive: false })
    .returning();

  // Auto-provision a usersTable login account so the driver can sign in immediately.
  // Use onConflictDoNothing so a race or existing student account doesn't break the insert.
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.tenantId)).limit(1);
  await db.insert(usersTable).values({
    phone,
    name,
    role: "driver",
    tenantId: req.tenantId,
    schoolCode: tenant?.schoolCode ?? null,
    photoUrl: photoUrl ?? null,
  }).onConflictDoNothing();
  // If a user already exists with that phone, update their role to driver so they can access the driver portal
  await db.update(usersTable).set({ name, role: "driver" }).where(eq(usersTable.phone, phone));

  return res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const { name, phone, vehicleNumber, photoUrl, isActive, isOnline } = req.body as {
    name?: string; phone?: string; vehicleNumber?: string; photoUrl?: string | null; isActive?: boolean; isOnline?: boolean;
  };
  const updates: Partial<{ name: string; phone: string; vehicleNumber: string; photoUrl: string | null; isActive: boolean; isOnline: boolean }> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (vehicleNumber !== undefined) updates.vehicleNumber = vehicleNumber;
  if (photoUrl !== undefined) updates.photoUrl = photoUrl;
  if (isActive !== undefined) updates.isActive = isActive;
  if (isOnline !== undefined) updates.isOnline = isOnline;
  const updated = await db
    .update(driversTable)
    .set(updates)
    .where(and(eq(driversTable.id, id), eq(driversTable.tenantId, req.tenantId)))
    .returning();
  if (!updated[0]) { res.status(404).json({ error: "Driver not found" }); return; }

  broadcast("drivers_updated", { tenantId: req.tenantId, driverId: id });

  // When marking active, ensure the driver has a usersTable login account
  if (isActive === true) {
    const driver = updated[0];
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.tenantId)).limit(1);
    await db.insert(usersTable).values({
      phone: driver.phone,
      name: driver.name,
      role: "driver",
      tenantId: req.tenantId,
      schoolCode: tenant?.schoolCode ?? null,
      photoUrl: driver.photoUrl ?? null,
    }).onConflictDoNothing();
    // Ensure existing user has driver role
    await db.update(usersTable).set({ name: driver.name, role: "driver" }).where(eq(usersTable.phone, driver.phone));
  }

  res.json(updated[0]);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const deleted = await db
    .delete(driversTable)
    .where(and(eq(driversTable.id, id), eq(driversTable.tenantId, req.tenantId)))
    .returning();
  if (!deleted[0]) { res.status(404).json({ error: "Driver not found" }); return; }
  res.status(204).end();
});

export default router;
