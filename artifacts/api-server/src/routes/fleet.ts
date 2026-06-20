import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, vehiclesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SwapFleetBody } from "@workspace/api-zod";

const router = Router();
router.post("/swap", async (req, res) => {
  const parsed = SwapFleetBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { driverId, vehicleId } = parsed.data;

  // Deactivate all current active drivers
  await db
    .update(driversTable)
    .set({ isActive: false })
    .where(eq(driversTable.tenantId, req.tenantId));

  // Activate the new driver
  const [driver] = await db
    .update(driversTable)
    .set({ isActive: true })
    .where(eq(driversTable.id, driverId))
    .returning();

  if (!driver) {
    return res.status(404).json({ error: "Driver not found" });
  }

  // Swap vehicle
  await db
    .update(vehiclesTable)
    .set({ isActive: false })
    .where(eq(vehiclesTable.tenantId, req.tenantId));
  await db
    .update(vehiclesTable)
    .set({ isActive: true })
    .where(eq(vehiclesTable.id, vehicleId));

  return res.json(driver);
});

export default router;
