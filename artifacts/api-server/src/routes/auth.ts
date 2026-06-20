import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, otpCodesTable, tenantsTable, stationsTable, passengersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

const router = Router();

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post("/send-otp", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || !/^9[6-9]\d{8}$/.test(phone.replace(/\s/g, ""))) {
    return res.status(400).json({ error: "Enter a valid Nepal mobile number (98xxxxxxxx)" });
  }
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(otpCodesTable).values({ phone, code, expiresAt, used: 0 });
  return res.json({ success: true, demoCode: code });
});

router.post("/verify-otp", async (req, res) => {
  const { phone, code } = req.body as { phone?: string; code?: string };
  if (!phone || !code) return res.status(400).json({ error: "Phone and code required" });
  const [otp] = await db
    .select()
    .from(otpCodesTable)
    .where(and(eq(otpCodesTable.phone, phone), eq(otpCodesTable.code, code), eq(otpCodesTable.used, 0), gt(otpCodesTable.expiresAt, new Date())))
    .limit(1);
  if (!otp) return res.status(401).json({ error: "Invalid or expired code" });
  await db.update(otpCodesTable).set({ used: 1 }).where(eq(otpCodesTable.id, otp.id));
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  let tenant = null;
  if (user?.tenantId) {
    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    tenant = t ?? null;
  }
  return res.json({ verified: true, user: user ? { ...user, tenant } : null, isNewUser: !user });
});

router.post("/register", async (req, res) => {
  const { phone, name, title, role, schoolCode, photoUrl } = req.body as {
    phone?: string; name?: string; title?: string; role?: string; schoolCode?: string; photoUrl?: string;
  };
  if (!phone || !name) return res.status(400).json({ error: "Phone and name are required" });

  let tenantId: number | null = null;
  if (schoolCode) {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.schoolCode, schoolCode)).limit(1);
    if (tenant) {
      tenantId = tenant.id;
    } else if (schoolCode === "ORBIT2024") {
      // Demo fallback: use tenant 1 and set the code
      await db.update(tenantsTable).set({ schoolCode: "ORBIT2024" }).where(eq(tenantsTable.id, 1));
      tenantId = 1;
    }
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing.length > 0) {
    return res.status(409).json({ error: "Phone already registered. Please log in." });
  }

  const [user] = await db.insert(usersTable).values({
    phone, name,
    title: title ?? null,
    photoUrl: photoUrl ?? null,
    role: role ?? "student",
    schoolCode: schoolCode ?? null,
    tenantId,
  }).returning();

  let tenant = null;
  if (user.tenantId) {
    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    tenant = t ?? null;

    // Auto-create a passenger record so the student appears in driver/admin panels
    const [station] = await db.select().from(stationsTable)
      .where(eq(stationsTable.tenantId, user.tenantId)).limit(1);
    if (station) {
      await db.insert(passengersTable).values({
        tenantId: user.tenantId,
        name: user.name,
        phone: user.phone,
        photoUrl: user.photoUrl ?? null,
        role: user.role ?? "student",
        stationId: station.id,
        status: "pending",
      });
    }
  }

  return res.status(201).json({ ...user, tenant });
});

router.post("/register-school", async (req, res) => {
  const { phone, adminName, schoolName, address, contactPhone, bannerUrl } = req.body as {
    phone?: string; adminName?: string; schoolName?: string; address?: string; contactPhone?: string; bannerUrl?: string;
  };
  if (!phone || !adminName || !schoolName) return res.status(400).json({ error: "Missing required fields" });

  const WORDS_A = ["APEX","BOLT","CORE","DOVE","FLUX","GLOW","HAWK","JADE","KITE","LION","MINT","NOVA","PEAK","RISE","SAGE","TREK","VAST","WAVE","ZEAL","FERN","CREST","DRIFT","EMBER","GROVE","HAVEN","PRISM","QUEST","SCOUT","SHARP","SWIFT"];
  const WORDS_B = ["ALPHA","BRAVE","CLEAR","DELTA","EAGLE","FIELD","GRACE","HONOR","INDEX","UNITY","PRIME","ROUTE","SIGMA","TRAIL","VALOR","NEXUS","ORBIT","PILOT","RELAY","SOLAR","TERRA","ULTRA","VANCE","WINDS","XENON","YUKON","ZENITH","ATLAS","BEACON","CRANE"];
  const wa = WORDS_A[Math.floor(Math.random() * WORDS_A.length)];
  const wb = WORDS_B[Math.floor(Math.random() * WORDS_B.length)];
  const schoolCode = `${wa}-${wb}-${Math.floor(1000 + Math.random() * 9000)}`;
  const [tenant] = await db.insert(tenantsTable).values({
    name: schoolName,
    address: address ?? null,
    contactPhone: contactPhone ?? null,
    bannerUrl: bannerUrl ?? null,
    schoolCode,
  }).returning();

  // Seed a default bus stop for the new school so students can be assigned
  await db.insert(stationsTable).values({
    tenantId: tenant.id,
    name: "School Main Stop",
    lat: 27.7172,
    lng: 85.3240,
    radius: 200,
  });

  const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  let user;
  if (existing.length > 0) {
    [user] = await db.update(usersTable).set({ tenantId: tenant.id, role: "admin" }).where(eq(usersTable.phone, phone)).returning();
  } else {
    [user] = await db.insert(usersTable).values({
      phone, name: adminName, role: "admin", schoolCode, tenantId: tenant.id,
    }).returning();
  }

  return res.status(201).json({ user, tenant, schoolCode });
});

router.patch("/profile", async (req, res) => {
  const { userId, name, title, photoUrl } = req.body as {
    userId?: number; name?: string; title?: string; photoUrl?: string | null;
  };
  if (!userId) return res.status(400).json({ error: "userId required" });
  const updates: Record<string, unknown> = {};
  if (name) updates.name = name;
  if (title !== undefined) updates.title = title ?? null;
  if (photoUrl !== undefined) updates.photoUrl = photoUrl ?? null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  if (!updated) return res.status(404).json({ error: "User not found" });
  return res.json(updated);
});

router.get("/me", async (req, res) => {
  const { phone } = req.query as { phone?: string };
  if (!phone) return res.status(400).json({ error: "Phone required" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) return res.status(404).json({ error: "Not found" });
  let tenant = null;
  if (user.tenantId) {
    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    tenant = t ?? null;
  }
  return res.json({ ...user, tenant });
});

export default router;
