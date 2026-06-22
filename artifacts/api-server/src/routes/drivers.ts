import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, usersTable, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateDriverBody } from "@workspace/api-zod";

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
  const { name, phone, photoUrl, vehicleNumber } = parsed.data;
  const [row] = await db
    .insert(driversTable)
    .values({ tenantId: req.tenantId, name, phone, photoUrl: photoUrl ?? null, vehicleNumber, isActive: false })
    .returning();

  // Auto-provision a usersTable login account so the driver can sign in immediately
  const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!existing.length) {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.tenantId)).limit(1);
    await db.insert(usersTable).values({
      phone,
      name,
      role: "driver",
      tenantId: req.tenantId,
      schoolCode: tenant?.schoolCode ?? null,
      photoUrl: photoUrl ?? null,
    });
  }

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

  // When marking active, ensure the driver has a usersTable login account
  if (isActive === true) {
    const driver = updated[0];
    const existing = await db.select().from(usersTable).where(eq(usersTable.phone, driver.phone)).limit(1);
    if (!existing.length) {
      const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.tenantId)).limit(1);
      await db.insert(usersTable).values({
        phone: driver.phone,
        name: driver.name,
        role: "driver",
        tenantId: req.tenantId,
        schoolCode: tenant?.schoolCode ?? null,
        photoUrl: driver.photoUrl ?? null,
      });
    }
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
