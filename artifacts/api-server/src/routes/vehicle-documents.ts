import { Router } from "express";
import { db } from "@workspace/db";
import { vehicleDocumentsTable, vehiclesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const rows = await db
    .select({
      id: vehicleDocumentsTable.id,
      vehicleId: vehicleDocumentsTable.vehicleId,
      vehiclePlate: vehiclesTable.plateNumber,
      vehicleModel: vehiclesTable.model,
      bluebookExpiry: vehicleDocumentsTable.bluebookExpiry,
      insuranceExpiry: vehicleDocumentsTable.insuranceExpiry,
      pollutionExpiry: vehicleDocumentsTable.pollutionExpiry,
      updatedAt: vehicleDocumentsTable.updatedAt,
    })
    .from(vehicleDocumentsTable)
    .leftJoin(vehiclesTable, eq(vehicleDocumentsTable.vehicleId, vehiclesTable.id))
    .where(eq(vehicleDocumentsTable.tenantId, req.tenantId));

  const today = Date.now();
  const enriched = rows.map((r) => {
    function daysUntil(dateStr: string | null | undefined): number | null {
      if (!dateStr) return null;
      return Math.ceil((new Date(dateStr).getTime() - today) / 86400000);
    }
    const bb = daysUntil(r.bluebookExpiry);
    const ins = daysUntil(r.insuranceExpiry);
    const pol = daysUntil(r.pollutionExpiry);
    const isCritical = [bb, ins, pol].some((d) => d !== null && d <= 15);
    return { ...r, daysUntilBluebook: bb, daysUntilInsurance: ins, daysUntilPollution: pol, isCritical };
  });
  return res.json(enriched);
});

router.put("/:vehicleId", async (req, res) => {
  const vehicleId = Number(req.params.vehicleId);
  if (!vehicleId || isNaN(vehicleId)) return res.status(400).json({ error: "Invalid vehicleId" });
  const { bluebookExpiry, insuranceExpiry, pollutionExpiry } = req.body as Record<string, unknown>;

  const existing = await db.select().from(vehicleDocumentsTable)
    .where(eq(vehicleDocumentsTable.vehicleId, vehicleId))
    .limit(1);

  if (existing.length > 0) {
    const prev = existing[0];
    const [row] = await db.update(vehicleDocumentsTable)
      .set({
        bluebookExpiry: bluebookExpiry != null ? String(bluebookExpiry) : prev.bluebookExpiry,
        insuranceExpiry: insuranceExpiry != null ? String(insuranceExpiry) : prev.insuranceExpiry,
        pollutionExpiry: pollutionExpiry != null ? String(pollutionExpiry) : prev.pollutionExpiry,
        updatedAt: new Date(),
      })
      .where(eq(vehicleDocumentsTable.vehicleId, vehicleId))
      .returning();
    return res.json(row);
  } else {
    const [row] = await db.insert(vehicleDocumentsTable)
      .values({
        tenantId: req.tenantId,
        vehicleId,
        bluebookExpiry: bluebookExpiry != null ? String(bluebookExpiry) : null,
        insuranceExpiry: insuranceExpiry != null ? String(insuranceExpiry) : null,
        pollutionExpiry: pollutionExpiry != null ? String(pollutionExpiry) : null,
      })
      .returning();
    return res.status(201).json(row);
  }
});

export default router;
