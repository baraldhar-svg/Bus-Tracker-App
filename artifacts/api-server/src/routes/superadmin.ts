import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable, vehiclesTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export default router;
