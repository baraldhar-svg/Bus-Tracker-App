import { Router } from "express";
import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ActivateSubscriptionBody } from "@workspace/api-zod";

const router = Router();
const DEFAULT_TENANT_ID = 1;

router.get("/me", async (req, res) => {
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, DEFAULT_TENANT_ID))
    .limit(1);

  if (!sub) {
    // Default: trial, first day
    return res.json({
      id: 0,
      userRole: "admin",
      tier: "trial",
      isActive: true,
      trialDaysRemaining: 30,
      paywallActive: false,
      expiresAt: null,
    });
  }

  const now = new Date();
  const createdDaysAgo = Math.floor((now.getTime() - sub.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const trialDaysRemaining = Math.max(0, 30 - createdDaysAgo);
  const paywallActive = sub.tier === "trial" && trialDaysRemaining === 0;

  res.json({
    id: sub.id,
    userRole: sub.userRole,
    tier: sub.tier,
    isActive: sub.isActive,
    trialDaysRemaining,
    paywallActive,
    expiresAt: sub.expiresAt?.toISOString() ?? null,
  });
});

router.post("/activate", async (req, res) => {
  const parsed = ActivateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { tier } = parsed.data;

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, DEFAULT_TENANT_ID))
    .limit(1);

  let sub;
  if (existing) {
    [sub] = await db
      .update(subscriptionsTable)
      .set({ tier, isActive: true, expiresAt })
      .where(eq(subscriptionsTable.id, existing.id))
      .returning();
  } else {
    [sub] = await db
      .insert(subscriptionsTable)
      .values({ tenantId: DEFAULT_TENANT_ID, userRole: "admin", tier, isActive: true, expiresAt })
      .returning();
  }

  res.json({
    id: sub.id,
    userRole: sub.userRole,
    tier: sub.tier,
    isActive: sub.isActive,
    trialDaysRemaining: 0,
    paywallActive: false,
    expiresAt: sub.expiresAt?.toISOString() ?? null,
  });
});

export default router;
