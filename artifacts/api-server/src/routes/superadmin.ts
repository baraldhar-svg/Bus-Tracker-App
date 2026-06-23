import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, vehiclesTable, tenantsTable, adminRegistrationsTable, stationsTable, usersTable, subscriptionsTable, passengersTable } from "@workspace/db";
import { eq, desc, isNotNull } from "drizzle-orm";

const router = Router();

// Kathmandu-area GPS seeds per driver id (consistent, not random each call)
const KTMADU_POINTS = [
  [27.6915, 85.3331], // Koteshwor
  [27.6891, 85.3430], // Baneshwor
  [27.7213, 85.3617], // Boudha
  [27.7152, 85.3122], // Thamel
  [27.6634, 85.3159], // Lalitpur
  [27.6710, 85.4298], // Bhaktapur
  [27.6737, 85.2760], // Kirtipur
  [27.7021, 85.3141], // Swayambhu
  [27.6900, 85.3320], // Thapathali
  [27.7172, 85.3240], // City center
];

function seedGps(driverId: number): [number, number] {
  const [lat, lng] = KTMADU_POINTS[driverId % KTMADU_POINTS.length];
  // small deterministic jitter so dots don't stack
  const jitterLat = ((driverId * 17) % 100) / 10000;
  const jitterLng = ((driverId * 31) % 100) / 10000;
  return [lat + jitterLat, lng + jitterLng];
}

// GET /api/superadmin/live-vehicles
// Returns all tenants with their drivers+vehicles, including simulated GPS for online drivers
router.get("/live-vehicles", async (_req, res) => {
  const tenants = await db.select().from(tenantsTable);
  const drivers = await db.select().from(driversTable);
  const vehicles = await db.select().from(vehiclesTable);

  // Build a plateNumber → vehicle lookup per tenant
  const vehicleByPlate: Record<string, typeof vehicles[number]> = {};
  for (const v of vehicles) {
    vehicleByPlate[`${v.tenantId}:${v.plateNumber}`] = v;
  }

  const result = tenants.map((tenant) => {
    const tenantDrivers = drivers.filter((d) => d.tenantId === tenant.id);
    const tenantVehicles = vehicles.filter((v) => v.tenantId === tenant.id);

    // Merge drivers with vehicle info
    const vehicleRows = tenantVehicles.map((v) => {
      const driver = tenantDrivers.find(
        (d) => d.vehicleNumber === v.plateNumber
      );
      const isOnline = driver?.isOnline ?? false;
      const isActive = driver?.isActive ?? v.isActive;
      const [lat, lng] = isOnline
        ? seedGps(driver?.id ?? v.id)
        : seedGps(v.id); // offline: show a parked position

      return {
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        model: v.model,
        capacity: v.capacity,
        tag: v.tag,
        isActive,
        isOnline,
        driverName: driver?.name ?? null,
        driverPhone: driver?.phone ?? null,
        lat,
        lng,
      };
    });

    // Also include drivers whose vehicleNumber doesn't match any vehicle record
    for (const d of tenantDrivers) {
      const alreadyIncluded = vehicleRows.some(
        (r) => r.plateNumber === d.vehicleNumber
      );
      if (!alreadyIncluded) {
        const [lat, lng] = d.isOnline ? seedGps(d.id) : seedGps(d.id + 500);
        vehicleRows.push({
          vehicleId: d.id + 10000,
          plateNumber: d.vehicleNumber,
          model: "Unknown",
          capacity: 0,
          tag: null,
          isActive: d.isActive,
          isOnline: d.isOnline,
          driverName: d.name,
          driverPhone: d.phone,
          lat,
          lng,
        });
      }
    }

    const onlineCount = vehicleRows.filter((r) => r.isOnline).length;
    const activeCount = vehicleRows.filter((r) => r.isActive && !r.isOnline).length;

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      vehicleCount: vehicleRows.length,
      onlineCount,
      activeCount,
      vehicles: vehicleRows,
    };
  });

  res.json(result);
});

// ── Admin Registration Review ──────────────────────────────────────────────

// GET /api/superadmin/pending-registrations
router.get("/pending-registrations", async (_req, res) => {
  const regs = await db
    .select()
    .from(adminRegistrationsTable)
    .orderBy(desc(adminRegistrationsTable.createdAt));
  res.json(regs);
});

// POST /api/superadmin/pending-registrations/:id/approve
router.post("/pending-registrations/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [reg] = await db.select().from(adminRegistrationsTable).where(eq(adminRegistrationsTable.id, id)).limit(1);
  if (!reg) return res.status(404).json({ error: "Registration not found" });
  if (reg.status !== "pending_super_admin_approval") return res.status(409).json({ error: "Already processed" });

  // Generate unique school code: first 6 alpha chars of school name + year
  const namePart = reg.schoolName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6).padEnd(4, "X");
  const year = new Date().getFullYear();
  const rand = String(Math.floor(10 + Math.random() * 90));
  const schoolCode = `${namePart}${year}${rand}`;

  // Create tenant
  const [tenant] = await db.insert(tenantsTable).values({
    name: reg.schoolName,
    contactPhone: reg.landline,
    schoolCode,
  }).returning();

  // Seed a default bus stop
  await db.insert(stationsTable).values({
    tenantId: tenant.id,
    name: "School Main Stop",
    lat: 27.7172,
    lng: 85.3240,
    radius: 200,
  });

  // Create a trial subscription
  await db.insert(subscriptionsTable).values({
    tenantId: tenant.id,
    userRole: "admin",
    tier: "trial",
    isActive: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  // Mark registration approved
  const [updated] = await db
    .update(adminRegistrationsTable)
    .set({ status: "approved", schoolCode, tenantId: tenant.id })
    .where(eq(adminRegistrationsTable.id, id))
    .returning();

  return res.json({ registration: updated, tenant, schoolCode });
});

// GET /api/superadmin/paying-users — returns passengers with an active route grouped by tenant
router.get("/paying-users", async (_req, res) => {
  const tenants = await db.select().from(tenantsTable);
  const passengers = await db
    .select({
      id: passengersTable.id,
      tenantId: passengersTable.tenantId,
      name: passengersTable.name,
      phone: passengersTable.phone,
      routeId: passengersTable.routeId,
      routeSubscribedAt: passengersTable.routeSubscribedAt,
      status: passengersTable.status,
    })
    .from(passengersTable)
    .where(isNotNull(passengersTable.routeId));

  const SUBSCRIPTION_DAYS = 30;
  const enriched = passengers.map((p) => {
    const sub = p.routeSubscribedAt;
    const daysElapsed = sub ? Math.floor((Date.now() - new Date(sub).getTime()) / 86400000) : 0;
    const isExpired = !!sub && daysElapsed >= SUBSCRIPTION_DAYS;
    const isPaying = !!sub && !isExpired;
    const daysLeft = sub ? Math.max(0, SUBSCRIPTION_DAYS - daysElapsed) : null;
    return { ...p, isPaying, isExpired, daysLeft };
  });

  const grouped = tenants.map((t) => ({
    tenantId: t.id,
    tenantName: t.name,
    passengers: enriched.filter((p) => p.tenantId === t.id),
  })).filter((g) => g.passengers.length > 0);

  return res.json(grouped);
});

// POST /api/superadmin/pending-registrations/:id/reject
router.post("/pending-registrations/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body as { reason?: string };
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [updated] = await db
    .update(adminRegistrationsTable)
    .set({ status: "rejected", rejectionReason: reason ?? null })
    .where(eq(adminRegistrationsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Registration not found" });
  return res.json(updated);
});

export default router;
