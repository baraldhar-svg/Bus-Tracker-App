import { Router } from "express";
import { db } from "@workspace/db";
import { calendarEventsTable, announcementsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router = Router();
// GET /calendar-events?month=YYYY-MM
router.get("/", async (req, res) => {
  const { month } = req.query as { month?: string };
  const rows = month
    ? await db
        .select()
        .from(calendarEventsTable)
        .where(
          and(
            eq(calendarEventsTable.tenantId, req.tenantId),
            sql`${calendarEventsTable.eventDate} LIKE ${month + "-%"}`
          )
        )
        .orderBy(calendarEventsTable.eventDate)
    : await db
        .select()
        .from(calendarEventsTable)
        .where(eq(calendarEventsTable.tenantId, req.tenantId))
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
      tenantId: req.tenantId,
      title,
      description: description ?? null,
      type,
      eventDate,
      autoNotify: autoNotify !== false,
    })
    .returning();
  return res.status(201).json(row);
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
  return res.json(row);
});

// DELETE /calendar-events/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, id));
  return res.status(204).send();
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

// Nepal national holidays for 2025 and 2026
const NEPAL_HOLIDAYS: { title: string; eventDate: string; description: string }[] = [
  // 2025
  { title: "पृथ्वी नारायण शाह जन्म जयन्ती", eventDate: "2025-01-11", description: "Prithvi Narayan Shah Birth Anniversary" },
  { title: "शहीद दिवस", eventDate: "2025-01-30", description: "Martyrs' Day" },
  { title: "राष्ट्रिय प्रजातन्त्र दिवस", eventDate: "2025-02-19", description: "National Democracy Day" },
  { title: "अन्तर्राष्ट्रिय महिला दिवस", eventDate: "2025-03-08", description: "International Women's Day" },
  { title: "फागु पूर्णिमा (होली)", eventDate: "2025-03-14", description: "Holi / Fagu Purnima" },
  { title: "राम नवमी", eventDate: "2025-04-06", description: "Ram Navami" },
  { title: "नयाँ वर्ष २०८२", eventDate: "2025-04-14", description: "Nepali New Year 2082 BS" },
  { title: "बुद्ध जयन्ती", eventDate: "2025-05-12", description: "Buddha Jayanti" },
  { title: "गणतन्त्र दिवस", eventDate: "2025-05-29", description: "Republic Day" },
  { title: "जनै पूर्णिमा / ऋषि पञ्चमी", eventDate: "2025-08-09", description: "Janai Purnima / Raksha Bandhan" },
  { title: "हरितालिका तीज", eventDate: "2025-08-25", description: "Haritalika Teej" },
  { title: "इन्द्रजात्रा", eventDate: "2025-09-18", description: "Indra Jatra" },
  { title: "संविधान दिवस", eventDate: "2025-09-19", description: "Constitution Day" },
  { title: "घटस्थापना (दशैँ)", eventDate: "2025-10-02", description: "Ghatasthapana — Dashain begins" },
  { title: "फूलपाती", eventDate: "2025-10-09", description: "Fulpati — Dashain" },
  { title: "महा अष्टमी", eventDate: "2025-10-10", description: "Maha Ashtami — Dashain" },
  { title: "महा नवमी", eventDate: "2025-10-11", description: "Maha Navami — Dashain" },
  { title: "विजया दशमी (टीका)", eventDate: "2025-10-12", description: "Vijaya Dashami / Dashain Tika" },
  { title: "लक्ष्मी पूजा (दीपावली)", eventDate: "2025-10-20", description: "Laxmi Puja — Tihar / Deepawali" },
  { title: "गोवर्धन पूजा", eventDate: "2025-10-21", description: "Govardhan Puja — Tihar" },
  { title: "भाइटीका", eventDate: "2025-10-22", description: "Bhai Tika — Tihar" },
  // 2026
  { title: "पृथ्वी नारायण शाह जन्म जयन्ती", eventDate: "2026-01-11", description: "Prithvi Narayan Shah Birth Anniversary" },
  { title: "शहीद दिवस", eventDate: "2026-01-30", description: "Martyrs' Day" },
  { title: "राष्ट्रिय प्रजातन्त्र दिवस", eventDate: "2026-02-19", description: "National Democracy Day" },
  { title: "अन्तर्राष्ट्रिय महिला दिवस", eventDate: "2026-03-08", description: "International Women's Day" },
  { title: "फागु पूर्णिमा (होली)", eventDate: "2026-03-03", description: "Holi / Fagu Purnima" },
  { title: "राम नवमी", eventDate: "2026-03-26", description: "Ram Navami" },
  { title: "नयाँ वर्ष २०८३", eventDate: "2026-04-14", description: "Nepali New Year 2083 BS" },
  { title: "गणतन्त्र दिवस", eventDate: "2026-05-28", description: "Republic Day" },
  { title: "बुद्ध जयन्ती", eventDate: "2026-05-31", description: "Buddha Jayanti" },
  { title: "संविधान दिवस", eventDate: "2026-09-20", description: "Constitution Day" },
  { title: "इन्द्रजात्रा", eventDate: "2026-10-01", description: "Indra Jatra" },
  { title: "घटस्थापना (दशैँ)", eventDate: "2026-10-22", description: "Ghatasthapana — Dashain begins" },
  { title: "फूलपाती", eventDate: "2026-10-29", description: "Fulpati — Dashain" },
  { title: "महा अष्टमी", eventDate: "2026-10-30", description: "Maha Ashtami — Dashain" },
  { title: "महा नवमी", eventDate: "2026-10-31", description: "Maha Navami — Dashain" },
  { title: "विजया दशमी (टीका)", eventDate: "2026-11-01", description: "Vijaya Dashami / Dashain Tika" },
  { title: "लक्ष्मी पूजा (दीपावली)", eventDate: "2026-11-08", description: "Laxmi Puja — Tihar / Deepawali" },
  { title: "भाइटीका", eventDate: "2026-11-10", description: "Bhai Tika — Tihar" },
];

export async function seedNepalHolidays() {
  try {
    // Check if already seeded (look for a known marker holiday)
    const existing = await db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.tenantId, 1),
          eq(calendarEventsTable.eventDate, "2025-04-14")
        )
      )
      .limit(1);

    if (existing.length > 0) return; // Already seeded

    const rows = NEPAL_HOLIDAYS.map(h => ({
      tenantId: 1,
      title: h.title,
      description: h.description,
      type: "holiday" as const,
      eventDate: h.eventDate,
      autoNotify: true,
      notified: false,
    }));

    await db.insert(calendarEventsTable).values(rows);
    console.log(`[calendar-seed] Seeded ${rows.length} Nepal national holidays`);
  } catch (err) {
    console.error("[calendar-seed] Failed to seed holidays:", err);
  }
}

export default router;
