import { Router } from "express";
import { db } from "@workspace/db";
import { vehiclesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();
const DEFAULT_TENANT_ID = 1;

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.tenantId, DEFAULT_TENANT_ID));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { plateNumber, model, capacity, tag } = req.body as { plateNumber: string; model: string; capacity?: number; tag?: string | null };
  if (!plateNumber?.trim() || !model?.trim()) {
    res.status(400).json({ error: "plateNumber and model are required" });
    return;
  }
  const [created] = await db
    .insert(vehiclesTable)
    .values({ tenantId: DEFAULT_TENANT_ID, plateNumber: plateNumber.trim(), model: model.trim(), capacity: capacity ?? 40, isActive: false, tag: tag ?? null })
    .returning();
  res.status(201).json(created);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const { tag } = req.body as { tag?: string | null };
  const updated = await db
    .update(vehiclesTable)
    .set({ tag: tag ?? null })
    .where(and(eq(vehiclesTable.id, id), eq(vehiclesTable.tenantId, DEFAULT_TENANT_ID)))
    .returning();
  if (!updated[0]) { res.status(404).json({ error: "Vehicle not found" }); return; }
  res.json(updated[0]);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const deleted = await db
    .delete(vehiclesTable)
    .where(and(eq(vehiclesTable.id, id), eq(vehiclesTable.tenantId, DEFAULT_TENANT_ID)))
    .returning();
  if (!deleted[0]) { res.status(404).json({ error: "Vehicle not found" }); return; }
  res.status(204).end();
});

export default router;
