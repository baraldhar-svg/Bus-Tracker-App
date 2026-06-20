import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateDriverBody, SwapFleetBody } from "@workspace/api-zod";

const router = Router();
const DEFAULT_TENANT_ID = 1;

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.tenantId, DEFAULT_TENANT_ID));
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
  res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { name, phone, photoUrl, vehicleNumber } = parsed.data;
  const [row] = await db
    .insert(driversTable)
    .values({ tenantId: DEFAULT_TENANT_ID, name, phone, photoUrl: photoUrl ?? null, vehicleNumber, isActive: false })
    .returning();
  res.status(201).json(row);
});

export default router;
