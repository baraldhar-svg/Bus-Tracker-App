import { Router } from "express";
import { db } from "@workspace/db";
import { vehiclesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const DEFAULT_TENANT_ID = 1;

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.tenantId, DEFAULT_TENANT_ID));
  res.json(rows);
});

export default router;
