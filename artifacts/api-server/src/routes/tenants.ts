import { Router } from "express";
import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db";

const router = Router();

router.get("/me", async (req, res) => {
  const tenants = await db.select().from(tenantsTable).limit(1);
  if (!tenants.length) {
    return res.status(404).json({ error: "No tenant found" });
  }
  res.json(tenants[0]);
});

export default router;
