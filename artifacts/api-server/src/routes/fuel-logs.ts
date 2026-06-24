import { Router } from "express";
import { db } from "@workspace/db";
import { fuelLogsTable, vehiclesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const rows = await db
    .select({
      id: fuelLogsTable.id,
      tenantId: fuelLogsTable.tenantId,
      vehicleId: fuelLogsTable.vehicleId,
      vehiclePlate: vehiclesTable.plateNumber,
      date: fuelLogsTable.date,
      liters: fuelLogsTable.liters,
      amountNpr: fuelLogsTable.amountNpr,
      odometerKm: fuelLogsTable.odometerKm,
      receiptUrl: fuelLogsTable.receiptUrl,
      notes: fuelLogsTable.notes,
      createdAt: fuelLogsTable.createdAt,
    })
    .from(fuelLogsTable)
    .leftJoin(vehiclesTable, eq(fuelLogsTable.vehicleId, vehiclesTable.id))
    .where(eq(fuelLogsTable.tenantId, req.tenantId))
    .orderBy(desc(fuelLogsTable.createdAt));
  return res.json(rows);
});

router.post("/", async (req, res) => {
  const { vehicleId, date, liters, amountNpr, odometerKm, receiptUrl, notes } = req.body as Record<string, unknown>;
  if (!date || typeof liters !== "number" || typeof amountNpr !== "number" || typeof odometerKm !== "number") {
    return res.status(400).json({ error: "date, liters, amountNpr, odometerKm are required" });
  }
  const [row] = await db
    .insert(fuelLogsTable)
    .values({
      tenantId: req.tenantId,
      vehicleId: vehicleId != null ? Number(vehicleId) : null,
      date: String(date),
      liters: Number(liters),
      amountNpr: Number(amountNpr),
      odometerKm: Number(odometerKm),
      receiptUrl: receiptUrl != null ? String(receiptUrl) : null,
      notes: notes != null ? String(notes) : null,
    })
    .returning();
  return res.status(201).json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(fuelLogsTable).where(eq(fuelLogsTable.id, id));
  return res.status(204).end();
});

export default router;
