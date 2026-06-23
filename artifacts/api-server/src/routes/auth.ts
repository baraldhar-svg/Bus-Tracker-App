import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, otpCodesTable, tenantsTable, stationsTable, passengersTable, driversTable, adminRegistrationsTable } from "@workspace/db";
import { eq, and, gt, isNotNull } from "drizzle-orm";

const router = Router();

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /auth/check-phone — look up phone, send OTP if found, deny if not
router.post("/check-phone", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  const cleaned = (phone ?? "").replace(/[\s\-()]/g, "");
  // Accept Nepal mobile numbers OR any international number (e.g. +countrycode...)
  if (!cleaned || !/^\+?\d{7,15}$/.test(cleaned)) {
    return res.status(400).json({ error: "Enter a valid mobile number" });
  }

  let user = (await db.select().from(usersTable).where(eq(usersTable.phone, cleaned)).limit(1))[0];
  // Also try the original phone string (in case stored with spaces)
  if (!user && cleaned !== phone) {
    user = (await db.select().from(usersTable).where(eq(usersTable.phone, phone!)).limit(1))[0];
  }

  // Fallback: check passengersTable for users registered by admin before this fix
  if (!user) {
    const [passenger] = await db
      .select()
      .from(passengersTable)
      .where(and(eq(passengersTable.phone, phone!), isNotNull(passengersTable.phone)))
      .limit(1);

    if (passenger) {
      let schoolCode: string | null = null;
      let tenantId: number | null = passenger.tenantId ?? null;
      if (tenantId) {
        const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
        if (tenant) schoolCode = tenant.schoolCode ?? null;
      }
      const [created] = await db.insert(usersTable).values({
        phone: phone!,
        name: passenger.name,
        role: passenger.role ?? "student",
        tenantId,
        schoolCode,
        photoUrl: passenger.photoUrl ?? null,
      }).returning();
      user = created;
    }
  }

  // Fallback: check driversTable for drivers registered by admin
  if (!user) {
    const [driver] = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.phone, phone!))
      .limit(1);

    if (driver) {
      let schoolCode: string | null = null;
      const tenantId: number | null = driver.tenantId ?? null;
      if (tenantId) {
        const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
        if (tenant) schoolCode = tenant.schoolCode ?? null;
      }
      const [created] = await db.insert(usersTable).values({
        phone: phone!,
        name: driver.name,
        role: "driver",
        tenantId,
        schoolCode,
        photoUrl: driver.photoUrl ?? null,
      }).returning();
      user = created;
    }
  }

  if (!user) {
    return res.status(403).json({
      error: "This number is not registered. Contact your school administrator to be added.",
      found: false,
    });
  }

  // Auto-issue OTP
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(otpCodesTable).values({ phone: phone!, code, expiresAt, used: 0 });
  return res.json({
    found: true,
    name: user.name,
    role: user.role,
    requiresSchoolCode: user.role !== "superadmin" && !!user.tenantId,
    demoCode: code,
  });
});

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
  const { phone, code, schoolCode } = req.body as { phone?: string; code?: string; schoolCode?: string };
  if (!phone || !code) return res.status(400).json({ error: "Phone and code required" });
  const [otp] = await db
    .select()
    .from(otpCodesTable)
    .where(and(eq(otpCodesTable.phone, phone), eq(otpCodesTable.code, code), eq(otpCodesTable.used, 0), gt(otpCodesTable.expiresAt, new Date())))
    .limit(1);
  if (!otp) return res.status(401).json({ error: "Invalid or expired code" });
  await db.update(otpCodesTable).set({ used: 1 }).where(eq(otpCodesTable.id, otp.id));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) {
    return res.status(403).json({ error: "Access denied. This number is not registered." });
  }

  // School code verification (skip for superadmin)
  if (user.role !== "superadmin" && user.tenantId) {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    if (tenant) {
      if (!schoolCode) return res.status(401).json({ error: "School code is required" });
      if (schoolCode.trim().toUpperCase() !== (tenant.schoolCode ?? "").toUpperCase()) {
        return res.status(401).json({ error: "Incorrect school code. Check with your school admin." });
      }
    }
  }

  let tenant = null;
  if (user.tenantId) {
    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    tenant = t ?? null;
  }
  return res.json({ verified: true, user: { ...user, tenant } });
});

// POST /auth/login-password — authenticate with phone + password
router.post("/login-password", async (req, res) => {
  const { phone, password } = req.body as { phone?: string; password?: string };
  if (!phone || !password) return res.status(400).json({ error: "Phone and password are required" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) return res.status(401).json({ error: "No account found for this number" });
  if (!user.passwordHash) return res.status(401).json({ error: "This account uses OTP login. No password is set." });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Incorrect password" });

  let tenant = null;
  if (user.tenantId) {
    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    tenant = t ?? null;
  }
  return res.json({ verified: true, user: { ...user, tenant } });
});

router.post("/register", async (req, res) => {
  const { phone, name, title, role, schoolCode, photoUrl, password, className, customClass, section, rollNumber, faculty } = req.body as {
    phone?: string; name?: string; title?: string; role?: string; schoolCode?: string; photoUrl?: string; password?: string;
    className?: string; customClass?: string; section?: string; rollNumber?: string; faculty?: string;
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

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const [user] = await db.insert(usersTable).values({
    phone, name,
    title: title ?? null,
    photoUrl: photoUrl ?? null,
    role: role ?? "student",
    schoolCode: schoolCode ?? null,
    tenantId,
    passwordHash,
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
        className: className ?? null,
        customClass: customClass ?? null,
        section: section ?? null,
        rollNumber: rollNumber ?? null,
        faculty: faculty ?? null,
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

// POST /auth/register-admin — Step 1: submit admin registration for SuperAdmin approval
router.post("/register-admin", async (req, res) => {
  const { schoolName, contactName, landline, email, adminName, position, mobile } = req.body as {
    schoolName?: string; contactName?: string; landline?: string; email?: string;
    adminName?: string; position?: string; mobile?: string;
  };
  if (!schoolName || !contactName || !landline || !email || !adminName || !position || !mobile) {
    return res.status(400).json({ error: "All fields are required" });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) return res.status(400).json({ error: "Enter a valid email address" });

  const [reg] = await db.insert(adminRegistrationsTable).values({
    schoolName: schoolName.trim(),
    contactName: contactName.trim(),
    landline: landline.trim(),
    email: email.trim().toLowerCase(),
    adminName: adminName.trim(),
    position: position.trim(),
    mobile: mobile.trim(),
    status: "pending_super_admin_approval",
  }).returning();
  return res.status(201).json({ id: reg.id, status: reg.status });
});

// POST /auth/admin-send-otp — Step 3: send WhatsApp OTP for admin verification
router.post("/admin-send-otp", async (req, res) => {
  const { mobile, schoolCode } = req.body as { mobile?: string; schoolCode?: string };
  if (!mobile || !schoolCode) return res.status(400).json({ error: "Mobile and school code required" });

  // Verify the school code exists and is approved
  const [reg] = await db
    .select()
    .from(adminRegistrationsTable)
    .where(eq(adminRegistrationsTable.schoolCode, schoolCode.trim().toUpperCase()))
    .limit(1);

  if (!reg) return res.status(404).json({ error: "Invalid school code. Contact OrbitTrack support." });
  if (reg.status === "pending_super_admin_approval") return res.status(403).json({ error: "Your registration is still pending SuperAdmin approval." });
  if (reg.status === "rejected") return res.status(403).json({ error: "Your registration was not approved. Contact OrbitTrack support." });
  if (reg.status === "verified_active") return res.status(409).json({ error: "This school is already verified. Use Sign In instead." });

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(otpCodesTable).values({ phone: mobile.trim(), code, expiresAt, used: 0 });
  return res.json({ success: true, demoCode: code, schoolName: reg.schoolName });
});

// POST /auth/admin-verify-otp — Step 3: verify OTP → activate school → create admin session
router.post("/admin-verify-otp", async (req, res) => {
  const { mobile, schoolCode, otpCode } = req.body as { mobile?: string; schoolCode?: string; otpCode?: string };
  if (!mobile || !schoolCode || !otpCode) return res.status(400).json({ error: "Mobile, school code and OTP required" });

  const [otp] = await db
    .select()
    .from(otpCodesTable)
    .where(and(eq(otpCodesTable.phone, mobile.trim()), eq(otpCodesTable.code, otpCode.trim()), eq(otpCodesTable.used, 0), gt(otpCodesTable.expiresAt, new Date())))
    .limit(1);
  if (!otp) return res.status(401).json({ error: "Invalid or expired OTP code" });
  await db.update(otpCodesTable).set({ used: 1 }).where(eq(otpCodesTable.id, otp.id));

  const [reg] = await db
    .select()
    .from(adminRegistrationsTable)
    .where(eq(adminRegistrationsTable.schoolCode, schoolCode.trim().toUpperCase()))
    .limit(1);
  if (!reg || !reg.tenantId) return res.status(404).json({ error: "School registration not found" });

  // Mark verified
  await db.update(adminRegistrationsTable).set({ status: "verified_active" }).where(eq(adminRegistrationsTable.id, reg.id));

  // Create or find user account for the admin
  const existing = await db.select().from(usersTable).where(eq(usersTable.phone, mobile.trim())).limit(1);
  let user;
  if (existing.length > 0) {
    [user] = await db.update(usersTable).set({ tenantId: reg.tenantId, role: "admin", schoolCode: reg.schoolCode }).where(eq(usersTable.phone, mobile.trim())).returning();
  } else {
    [user] = await db.insert(usersTable).values({
      phone: mobile.trim(),
      name: reg.adminName,
      role: "admin",
      tenantId: reg.tenantId,
      schoolCode: reg.schoolCode,
    }).returning();
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, reg.tenantId)).limit(1);
  return res.json({ verified: true, user: { ...user, tenant: tenant ?? null } });
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
