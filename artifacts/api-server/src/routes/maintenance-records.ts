import { Router } from "express";
import { db } from "@workspace/db";
import { maintenanceRecordsTable, vehiclesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const rows = await db
    .select({
      id: maintenanceRecordsTable.id,
      tenantId: maintenanceRecordsTable.tenantId,
      vehicleId: maintenanceRecordsTable.vehicleId,
      vehiclePlate: vehiclesTable.plateNumber,
      partType: maintenanceRecordsTable.partType,
      description: maintenanceRecordsTable.description,
      costNpr: maintenanceRecordsTable.costNpr,
      odometerKm: maintenanceRecordsTable.odometerKm,
      serviceDate: maintenanceRecordsTable.serviceDate,
      vendor: maintenanceRecordsTable.vendor,
      createdAt: maintenanceRecordsTable.createdAt,
    })
    .from(maintenanceRecordsTable)
    .leftJoin(vehiclesTable, eq(maintenanceRecordsTable.vehicleId, vehiclesTable.id))
    .where(eq(maintenanceRecordsTable.tenantId, req.tenantId))
    .orderBy(desc(maintenanceRecordsTable.createdAt));
  return res.json(rows);
});

router.post("/", async (req, res) => {
  const { vehicleId, partType, description, costNpr, odometerKm, serviceDate, vendor } = req.body as Record<string, unknown>;
  if (!partType || !serviceDate || typeof odometerKm !== "number") {
    return res.status(400).json({ error: "partType, serviceDate, odometerKm are required" });
  }
  const [row] = await db
    .insert(maintenanceRecordsTable)
    .values({
      tenantId: req.tenantId,
      vehicleId: vehicleId != null ? Number(vehicleId) : null,
      partType: String(partType),
      description: description != null ? String(description) : null,
      costNpr: costNpr != null ? Number(costNpr) : 0,
      odometerKm: Number(odometerKm),
      serviceDate: String(serviceDate),
      vendor: vendor != null ? String(vendor) : null,
    })
    .returning();
  return res.status(201).json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(maintenanceRecordsTable).where(eq(maintenanceRecordsTable.id, id));
  return res.status(204).end();
});

export default router;
