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

export default router;
