import { Router } from "express";
import { db } from "@workspace/db";
import { announcementsTable, tenantsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateAnnouncementBody,
  DeleteAnnouncementParams,
} from "@workspace/api-zod";
import { broadcast } from "../lib/sse";

const router = Router();

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.tenantId, req.tenantId))
    .orderBy(desc(announcementsTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  const parsed = CreateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.message });
  }
  const { message, messageNe, severity } = parsed.data;
  const [row] = await db
    .insert(announcementsTable)
    .values({ tenantId: req.tenantId, message, messageNe: messageNe ?? null, severity: severity ?? "info" })
    .returning();
  broadcast("announcements_updated", { tenantId: req.tenantId });
  return res.status(201).json(row);
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteAnnouncementParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid id" });
  }
  await db.delete(announcementsTable).where(eq(announcementsTable.id, parsed.data.id));
  broadcast("announcements_updated", { tenantId: req.tenantId });
  return res.status(204).send();
});

export default router;
