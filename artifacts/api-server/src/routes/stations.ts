import { Router } from "express";
import { db } from "@workspace/db";
import { stationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateStationBody, DeleteStationParams } from "@workspace/api-zod";

const router = Router();
const DEFAULT_TENANT_ID = 1;

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(stationsTable)
    .where(eq(stationsTable.tenantId, DEFAULT_TENANT_ID));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = CreateStationBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { name, lat, lng, radius } = parsed.data as { name: string; lat: number; lng: number; radius?: number };
  const [row] = await db
    .insert(stationsTable)
    .values({ tenantId: DEFAULT_TENANT_ID, name, lat, lng, radius: radius ?? 200 })
    .returning();
  res.status(201).json(row);
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteStationParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid id" });
  }
  await db.delete(stationsTable).where(eq(stationsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
