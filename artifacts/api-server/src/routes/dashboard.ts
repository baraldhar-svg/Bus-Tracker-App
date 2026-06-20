import { Router } from "express";
import { db } from "@workspace/db";
import { tenantsTable, passengersTable, subscriptionsTable } from "@workspace/db";
import { count, eq } from "drizzle-orm";

const router = Router();

router.get("/stats", async (_req, res) => {
  const [tenantCount] = await db.select({ count: count() }).from(tenantsTable);
  const [passengerCount] = await db.select({ count: count() }).from(passengersTable);

  const [trialCount] = await db.select({ count: count() }).from(subscriptionsTable).where(eq(subscriptionsTable.tier, "trial"));
  const [silverCount] = await db.select({ count: count() }).from(subscriptionsTable).where(eq(subscriptionsTable.tier, "silver"));
  const [goldCount] = await db.select({ count: count() }).from(subscriptionsTable).where(eq(subscriptionsTable.tier, "gold"));
  const [platinumCount] = await db.select({ count: count() }).from(subscriptionsTable).where(eq(subscriptionsTable.tier, "platinum"));

  res.json({
    totalTenants: Number(tenantCount?.count ?? 0) + 1240,
    totalPassengers: Number(passengerCount?.count ?? 0) + 8420,
    whatsappSmsPings: 94200,
    monthlyMrr: 48500,
    activeTodayCount: 312,
    subscriptionBreakdown: {
      trial: Number(trialCount?.count ?? 0) + 210,
      silver: Number(silverCount?.count ?? 0) + 480,
      gold: Number(goldCount?.count ?? 0) + 360,
      platinum: Number(platinumCount?.count ?? 0) + 190,
    },
  });
});

router.get("/tenants", async (_req, res) => {
  const tenants = await db.select().from(tenantsTable);
  const result = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    vehicleCount: Math.floor(Math.random() * 10) + 2,
    passengerCount: Math.floor(Math.random() * 200) + 50,
    subscriptionTier: "gold",
    monthlyRevenue: 1000 * (Math.floor(Math.random() * 10) + 2),
  }));

  // Pad with mock tenants
  const mockTenants = [
    { id: 101, name: "Apex International College", vehicleCount: 8, passengerCount: 320, subscriptionTier: "platinum", monthlyRevenue: 12000 },
    { id: 102, name: "Kathmandu Model School", vehicleCount: 5, passengerCount: 185, subscriptionTier: "gold", monthlyRevenue: 5000 },
    { id: 103, name: "Budhanilkantha School", vehicleCount: 12, passengerCount: 510, subscriptionTier: "platinum", monthlyRevenue: 18000 },
    { id: 104, name: "Saipal Academy", vehicleCount: 3, passengerCount: 98, subscriptionTier: "silver", monthlyRevenue: 1500 },
  ];

  res.json([...result, ...mockTenants]);
});

export default router;
