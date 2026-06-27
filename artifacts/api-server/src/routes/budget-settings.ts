import { Router } from "express";
import { db } from "@workspace/db";
import { budgetSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const [row] = await db
    .select()
    .from(budgetSettingsTable)
    .where(eq(budgetSettingsTable.tenantId, req.tenantId))
    .limit(1);

  if (!row) {
    return res.json({ fuelBudgetNpr: 0, maintBudgetNpr: 0 });
  }
  return res.json({ fuelBudgetNpr: row.fuelBudgetNpr, maintBudgetNpr: row.maintBudgetNpr });
});

router.put("/", async (req, res) => {
  const { fuelBudgetNpr, maintBudgetNpr } = req.body as Record<string, unknown>;
  const fuel = Number(fuelBudgetNpr);
  const maint = Number(maintBudgetNpr);
  if (isNaN(fuel) || isNaN(maint) || fuel < 0 || maint < 0) {
    return res.status(400).json({ error: "fuelBudgetNpr and maintBudgetNpr must be non-negative numbers" });
  }

  const [existing] = await db
    .select({ id: budgetSettingsTable.id })
    .from(budgetSettingsTable)
    .where(eq(budgetSettingsTable.tenantId, req.tenantId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(budgetSettingsTable)
      .set({ fuelBudgetNpr: fuel, maintBudgetNpr: maint, updatedAt: new Date() })
      .where(eq(budgetSettingsTable.tenantId, req.tenantId))
      .returning();
    return res.json({ fuelBudgetNpr: updated.fuelBudgetNpr, maintBudgetNpr: updated.maintBudgetNpr });
  } else {
    const [inserted] = await db
      .insert(budgetSettingsTable)
      .values({ tenantId: req.tenantId, fuelBudgetNpr: fuel, maintBudgetNpr: maint })
      .returning();
    return res.status(201).json({ fuelBudgetNpr: inserted.fuelBudgetNpr, maintBudgetNpr: inserted.maintBudgetNpr });
  }
});

export default router;
