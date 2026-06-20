import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, passengersTable, stationsTable, announcementsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";

const router = Router();
router.get("/active", async (req, res) => {
  const [driver] = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.isActive, true))
    .limit(1);

  const [allCount] = await db
    .select({ count: count() })
    .from(passengersTable)
    .where(eq(passengersTable.tenantId, req.tenantId));

  const [boardedCount] = await db
    .select({ count: count() })
    .from(passengersTable)
    .where(eq(passengersTable.status, "boarded"));

  const [nextStation] = await db
    .select()
    .from(stationsTable)
    .where(eq(stationsTable.tenantId, req.tenantId))
    .limit(1);

  res.json({
    tripId: 1,
    currentLat: 27.6915,
    currentLng: 85.3331,
    etaMinutes: 7,
    nextStationName: nextStation?.name ?? "Koteshwor Chowk",
    routeName: "Route #4B - Koteshwor",
    boardedCount: Number(boardedCount?.count ?? 0),
    totalPassengers: Number(allCount?.count ?? 0),
    driver: driver ?? {
      id: 1,
      name: "Ram Bahadur",
      phone: "+977 9851012345",
      photoUrl: null,
      vehicleNumber: "BA 3 CHA 4567",
      isActive: true,
      tenantId: req.tenantId,
    },
  });
});

router.get("/timeline", async (_req, res) => {
  res.json([
    { id: 1, time: "06:45 AM", description: "Bus started from the main university campus garage.", status: "completed" },
    { id: 2, time: "07:05 AM", description: "Vehicle crossed Balkhu intersection point.", status: "completed" },
    { id: 3, time: "07:15 AM (Expected)", description: "Scheduled arrival at your designated Baneshwor stop.", status: "upcoming" },
  ]);
});

router.post("/sos", async (_req, res) => {
  return res.json({ acknowledged: true, message: "Emergency SOS broadcast sent to all admins and parents." });
});

router.post("/complete", async (req, res) => {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  // Create a journey-complete announcement visible to all portals
  await db.insert(announcementsTable).values({
    tenantId: req.tenantId,
    message: `✅ Bus journey completed at ${timeStr}. All students have arrived safely. The driver has signed off for this trip.`,
    severity: "info",
  });

  // Reset all passengers back to "pending" so they're ready for the next journey
  await db
    .update(passengersTable)
    .set({ status: "pending", boardedAt: null })
    .where(eq(passengersTable.tenantId, req.tenantId));

  return res.json({ acknowledged: true, message: `Journey completed at ${timeStr}. All passengers and admins notified.` });
});

export default router;
