import { Router } from "express";
import { db } from "@workspace/db";
import { pushTokensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

// POST /api/push-tokens — register or refresh an Expo push token for a passenger.
// Body: { passengerId: number, token: string }
router.post("/", async (req, res) => {
  const { passengerId, token } = req.body as { passengerId?: number; token?: string };

  if (typeof passengerId !== "number" || !token || typeof token !== "string") {
    return res.status(400).json({ error: "passengerId (number) and token (string) are required" });
  }

  if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[")) {
    return res.status(400).json({ error: "token must be a valid Expo push token" });
  }

  // Upsert on (passengerId, token): allows the same device token to be stored
  // for multiple passengers (multi-child families) while deduping re-registers
  // of the same device+passenger pair.
  await db
    .insert(pushTokensTable)
    .values({
      tenantId: req.tenantId,
      passengerId,
      token,
    })
    .onConflictDoUpdate({
      target: [pushTokensTable.passengerId, pushTokensTable.token],
      set: {
        tenantId: req.tenantId,
        updatedAt: new Date(),
      },
    });

  req.log.info({ passengerId, tenantId: req.tenantId }, "push token registered");
  return res.json({ ok: true });
});

// DELETE /api/push-tokens/:token — unregister a push token (e.g. on logout).
router.delete("/:token", async (req, res) => {
  const token = decodeURIComponent(req.params.token ?? "");
  if (!token) return res.status(400).json({ error: "token is required" });

  await db
    .delete(pushTokensTable)
    .where(
      and(
        eq(pushTokensTable.token, token),
        eq(pushTokensTable.tenantId, req.tenantId)
      )
    );

  return res.json({ ok: true });
});

export default router;
