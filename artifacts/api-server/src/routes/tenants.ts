import { Router } from "express";
import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const tenants = await db.select().from(tenantsTable);
  res.json(tenants.map((t) => ({
    ...t,
    vehicleCount: 3,
    passengerCount: 12,
    subscriptionTier: "gold",
    monthlyRevenue: 15000,
  })));
});

router.get("/me", async (_req, res) => {
  const tenants = await db.select().from(tenantsTable).limit(1);
  if (!tenants.length) return res.status(404).json({ error: "No tenant found" });
  return res.json(tenants[0]);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  if (!tenant) return res.status(404).json({ error: "Not found" });
  return res.json(tenant);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof tenantsTable.$inferInsert> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.address === "string") updates.address = body.address;
  if (typeof body.contactPhone === "string") updates.contactPhone = body.contactPhone;
  if (typeof body.bannerUrl === "string" || body.bannerUrl === null) updates.bannerUrl = body.bannerUrl as string | null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
  await db.update(tenantsTable).set(updates).where(eq(tenantsTable.id, id));
  const [row] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
  return res.json(row);
});

export default router;
