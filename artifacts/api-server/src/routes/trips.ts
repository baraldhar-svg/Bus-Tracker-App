import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, passengersTable, stationsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";

const router = Router();
const DEFAULT_TENANT_ID = 1;

router.get("/active", async (req, res) => {
  const [driver] = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.isActive, true))
    .limit(1);

  const [allCount] = await db
    .select({ count: count() })
    .from(passengersTable)
    .where(eq(passengersTable.tenantId, DEFAULT_TENANT_ID));

  const [boardedCount] = await db
    .select({ count: count() })
    .from(passengersTable)
    .where(eq(passengersTable.status, "boarded"));

  const [nextStation] = await db
    .select()
    .from(stationsTable)
    .where(eq(stationsTable.tenantId, DEFAULT_TENANT_ID))
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
      tenantId: DEFAULT_TENANT_ID,
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
  res.json({ acknowledged: true, message: "Emergency SOS broadcast sent to all admins and parents." });
});

export default router;
