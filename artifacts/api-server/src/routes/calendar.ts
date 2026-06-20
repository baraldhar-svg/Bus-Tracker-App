import { Router } from "express";
import { db } from "@workspace/db";
import { calendarEventsTable, announcementsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router = Router();
const DEFAULT_TENANT_ID = 1;

// GET /calendar-events?month=YYYY-MM
router.get("/", async (req, res) => {
  const { month } = req.query as { month?: string };
  const rows = month
    ? await db
        .select()
        .from(calendarEventsTable)
        .where(
          and(
            eq(calendarEventsTable.tenantId, DEFAULT_TENANT_ID),
            sql`${calendarEventsTable.eventDate} LIKE ${month + "-%"}`
          )
        )
        .orderBy(calendarEventsTable.eventDate)
    : await db
        .select()
        .from(calendarEventsTable)
        .where(eq(calendarEventsTable.tenantId, DEFAULT_TENANT_ID))
        .orderBy(calendarEventsTable.eventDate);
  res.json(rows);
});

// POST /calendar-events
router.post("/", async (req, res) => {
  const { title, description, type, eventDate, autoNotify } = req.body as {
    title: string;
    description?: string;
    type: "event" | "holiday";
    eventDate: string;
    autoNotify?: boolean;
  };
  if (!title || !type || !eventDate) {
    return res.status(400).json({ error: "title, type, and eventDate are required" });
  }
  const [row] = await db
    .insert(calendarEventsTable)
    .values({
      tenantId: DEFAULT_TENANT_ID,
      title,
      description: description ?? null,
      type,
      eventDate,
      autoNotify: autoNotify !== false,
    })
    .returning();
  res.status(201).json(row);
});

// PATCH /calendar-events/:id
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const { title, description, type, eventDate, autoNotify } = req.body as {
    title?: string;
    description?: string;
    type?: string;
    eventDate?: string;
    autoNotify?: boolean;
  };
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (type !== undefined) updates.type = type;
  if (eventDate !== undefined) updates.eventDate = eventDate;
  if (autoNotify !== undefined) updates.autoNotify = autoNotify;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
  const [row] = await db.update(calendarEventsTable).set(updates).where(eq(calendarEventsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// DELETE /calendar-events/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, id));
  res.status(204).send();
});

// ── T-1 Notify Cron ──────────────────────────────────────────────────────────
// Runs every 5 minutes. Finds events happening tomorrow (in AD) that haven't
// been notified yet, creates an announcement, marks them notified.
export function startCalendarNotifyCron(log: (msg: string) => void) {
  async function check() {
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

      const pending = await db
        .select()
        .from(calendarEventsTable)
        .where(
          and(
            eq(calendarEventsTable.notified, false),
            eq(calendarEventsTable.autoNotify, true),
            eq(calendarEventsTable.eventDate, tomorrowStr)
          )
        );

      for (const event of pending) {
        const prefix = event.type === "holiday" ? "HOLIDAY TOMORROW" : "EVENT TOMORROW";
        const message = `${prefix}: ${event.title}${event.description ? ` — ${event.description}` : ""}`;
        await db.insert(announcementsTable).values({
          tenantId: event.tenantId,
          message,
          severity: event.type === "holiday" ? "warning" : "info",
        });
        await db
          .update(calendarEventsTable)
          .set({ notified: true })
          .where(eq(calendarEventsTable.id, event.id));
        log(`[calendar-cron] Notified event "${event.title}" (${event.eventDate})`);
      }
    } catch (err) {
      log(`[calendar-cron] Error: ${String(err)}`);
    }
  }

  // Run immediately, then every 5 minutes
  check();
  setInterval(check, 5 * 60 * 1000);
}

export default router;
