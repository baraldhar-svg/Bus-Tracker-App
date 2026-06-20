import { Router } from "express";
import { db } from "@workspace/db";
import { advertisementsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

const DEFAULT_ADS = [
  {
    title: "Tribhuvan University",
    subtitle: "Nepal's Leading University — Admissions Open 2081",
    imageUrl: "https://images.unsplash.com/photo-1562774053-701939374585?w=800&auto=format&fit=crop&q=80",
    targetUrl: "/school/1",
    tenantId: 1,
    sortOrder: 1,
    active: 1,
  },
  {
    title: "Kathmandu University",
    subtitle: "Excellence in Science & Technology",
    imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&auto=format&fit=crop&q=80",
    targetUrl: "/school/2",
    tenantId: null,
    sortOrder: 2,
    active: 1,
  },
  {
    title: "Rato Bangala School",
    subtitle: "Inspiring Young Minds Since 1992 — Lalitpur",
    imageUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&auto=format&fit=crop&q=80",
    targetUrl: "/school/3",
    tenantId: null,
    sortOrder: 3,
    active: 1,
  },
  {
    title: "St. Xavier's College",
    subtitle: "Jesuit Education for Life — Maitighar, Kathmandu",
    imageUrl: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80",
    targetUrl: "/school/4",
    tenantId: null,
    sortOrder: 4,
    active: 1,
  },
  {
    title: "Little Angels' School",
    subtitle: "Nurturing Future Leaders — Lalitpur",
    imageUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&auto=format&fit=crop&q=80",
    targetUrl: "/school/5",
    tenantId: null,
    sortOrder: 5,
    active: 1,
  },
];

router.get("/", async (req, res) => {
  let rows = await db.select().from(advertisementsTable).where(eq(advertisementsTable.active, 1)).orderBy(asc(advertisementsTable.sortOrder));
  if (rows.length === 0) {
    await db.insert(advertisementsTable).values(DEFAULT_ADS);
    rows = await db.select().from(advertisementsTable).where(eq(advertisementsTable.active, 1)).orderBy(asc(advertisementsTable.sortOrder));
  }
  return res.json(rows);
});

router.post("/", async (req, res) => {
  const { title, subtitle, imageUrl, targetUrl, tenantId, sortOrder } = req.body as {
    title?: string; subtitle?: string; imageUrl?: string; targetUrl?: string; tenantId?: number; sortOrder?: number;
  };
  if (!title || !imageUrl) return res.status(400).json({ error: "title and imageUrl required" });
  const [row] = await db.insert(advertisementsTable).values({
    title, subtitle: subtitle ?? null, imageUrl, targetUrl: targetUrl ?? null,
    tenantId: tenantId ?? null, sortOrder: sortOrder ?? 0, active: 1,
  }).returning();
  return res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const updates: Partial<typeof advertisementsTable.$inferInsert> = {};
  const body = req.body as Record<string, unknown>;
  if (body.title !== undefined) updates.title = body.title as string;
  if (body.subtitle !== undefined) updates.subtitle = body.subtitle as string;
  if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl as string;
  if (body.targetUrl !== undefined) updates.targetUrl = body.targetUrl as string;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder as number;
  if (body.active !== undefined) updates.active = body.active as number;
  await db.update(advertisementsTable).set(updates).where(eq(advertisementsTable.id, id));
  const [row] = await db.select().from(advertisementsTable).where(eq(advertisementsTable.id, id));
  return res.json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(advertisementsTable).where(eq(advertisementsTable.id, id));
  return res.json({ success: true });
});

export default router;
