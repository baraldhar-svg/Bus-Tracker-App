import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  otpCodesTable,
  tenantsTable,
  stationsTable,
  passengersTable,
  driversTable,
  adminRegistrationsTable,
} from "@workspace/db";
import { eq, and, gt, isNotNull } from "drizzle-orm";

const router = Router();

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[\s\-()]/g, "");
  if (stripped.startsWith("+977")) return stripped.slice(4);
  if (stripped.startsWith("977") && stripped.length > 10)
    return stripped.slice(3);
  return stripped;
}

// ⚠️ परिवर्तन गरिएको मुख्य ठाउँ: अब यसले ओटिपी नमागी सिधै लगिन गराइदिन्छ
router.post("/check-phone", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  const raw = (phone ?? "").trim();
  if (!raw || !/^\+?\d{7,15}$/.test(raw.replace(/[\s\-()]/g, ""))) {
    return res.status(400).json({ error: "Enter a valid mobile number" });
  }
  const normalized = normalizePhone(raw);

  let user = (
    await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1)
  )[0];

  // Fallback: Passengers check
  if (!user) {
    const [passenger] = await db
      .select()
      .from(passengersTable)
      .where(
        and(
          eq(passengersTable.phone, normalized),
          isNotNull(passengersTable.phone),
        ),
      )
      .limit(1);

    if (passenger) {
      let schoolCode: string | null = null;
      let tenantId: number | null = passenger.tenantId ?? null;
      if (tenantId) {
        const [tenant] = await db
          .select()
          .from(tenantsTable)
          .where(eq(tenantsTable.id, tenantId))
          .limit(1);
        if (tenant) schoolCode = tenant.schoolCode ?? null;
      }
      const [created] = await db
        .insert(usersTable)
        .values({
          phone: normalized,
          name: passenger.name,
          role: passenger.role ?? "student",
          tenantId,
          schoolCode,
          photoUrl: passenger.photoUrl ?? null,
        })
        .onConflictDoNothing()
        .returning();
      user =
        created ??
        (
          await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.phone, normalized))
            .limit(1)
        )[0];
    }
  }

  // Fallback: Drivers check
  if (!user) {
    const [driver] = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.phone, normalized))
      .limit(1);

    if (driver) {
      let schoolCode: string | null = null;
      const tenantId: number | null = driver.tenantId ?? null;
      if (tenantId) {
        const [tenant] = await db
          .select()
          .from(tenantsTable)
          .where(eq(tenantsTable.id, tenantId))
          .limit(1);
        if (tenant) schoolCode = tenant.schoolCode ?? null;
      }
      const [created] = await db
        .insert(usersTable)
        .values({
          phone: normalized,
          name: driver.name,
          role: "driver",
          tenantId,
          schoolCode,
          photoUrl: driver.photoUrl ?? null,
        })
        .onConflictDoNothing()
        .returning();
      user =
        created ??
        (
          await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.phone, normalized))
            .limit(1)
        )[0];
    }
  }

  if (!user) {
    return res.status(403).json({
      error:
        "This number is not registered. Contact your school administrator to be added.",
      found: false,
    });
  }

  // 🚀 ओटिपी प्रणाली बन्द: सिधै युजरको पूरा विवरण फ्रन्टइन्डलाई बुझाइदिने
  let tenant = null;
  if (user.tenantId) {
    const [t] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);
    tenant = t ?? null;
  }

  return res.json({
    found: true,
    verified: true, // फ्रन्टइन्डलाई सिधै भेरिफाइड भनेर बुझाउने
    user: { ...user, tenant },
    requiresSchoolCode: user.role !== "superadmin" && !!user.tenantId,
  });
});

router.post("/send-otp", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || !/^9[6-9]\d{8}$/.test(phone.replace(/\s/g, ""))) {
    return res
      .status(400)
      .json({ error: "Enter a valid Nepal mobile number (98xxxxxxxx)" });
  }
  return res.json({ success: true, demoCode: "123456" });
});

router.post("/verify-otp", async (req, res) => {
  const { phone, schoolCode } = req.body as {
    phone?: string;
    schoolCode?: string;
  };
  if (!phone) return res.status(400).json({ error: "Phone required" });
  const normalized = normalizePhone(phone);

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, normalized))
    .limit(1);
  if (!user) return res.status(403).json({ error: "Access denied." });

  let tenant = null;
  if (user.tenantId) {
    const [t] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);
    tenant = t ?? null;
  }
  return res.json({ verified: true, user: { ...user, tenant } });
});

router.post("/login-password", async (req, res) => {
  const { phone, password } = req.body as { phone?: string; password?: string };
  if (!phone || !password)
    return res.status(400).json({ error: "Phone and password are required" });
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);
  if (!user)
    return res.status(401).json({ error: "No account found for this number" });
  const valid = await bcrypt.compare(password, user.passwordHash || "");
  if (!valid) return res.status(401).json({ error: "Incorrect password" });
  let tenant = null;
  if (user.tenantId) {
    const [t] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);
    tenant = t ?? null;
  }
  return res.json({ verified: true, user: { ...user, tenant } });
});

router.post("/register", async (req, res) => {
  const {
    phone,
    name,
    title,
    role,
    schoolCode,
    photoUrl,
    password,
    className,
    customClass,
    section,
    rollNumber,
    faculty,
  } = req.body as {
    phone?: string;
    name?: string;
    title?: string;
    role?: string;
    schoolCode?: string;
    photoUrl?: string;
    password?: string;
    className?: string;
    customClass?: string;
    section?: string;
    rollNumber?: string;
    faculty?: string;
  };
  if (!phone || !name)
    return res.status(400).json({ error: "Phone and name are required" });
  let tenantId: number | null = null;
  if (schoolCode) {
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.schoolCode, schoolCode))
      .limit(1);
    if (tenant) tenantId = tenant.id;
  }
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const [user] = await db
    .insert(usersTable)
    .values({
      phone,
      name,
      title: title ?? null,
      photoUrl: photoUrl ?? null,
      role: role ?? "student",
      schoolCode: schoolCode ?? null,
      tenantId,
      passwordHash,
    })
    .returning();
  let tenant = null;
  if (user.tenantId) {
    const [t] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId))
      .limit(1);
    tenant = t ?? null;
  }
  return res.status(201).json({ ...user, tenant });
});

router.post("/register-school", async (req, res) => {
  const { phone, adminName, schoolName, address, contactPhone, bannerUrl } =
    req.body as {
      phone?: string;
      adminName?: string;
      schoolName?: string;
      address?: string;
      contactPhone?: string;
      bannerUrl?: string;
    };
  if (!phone || !adminName || !schoolName)
    return res.status(400).json({ error: "Missing required fields" });
  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      name: schoolName,
      address: address ?? null,
      contactPhone: contactPhone ?? null,
      bannerUrl: bannerUrl ?? null,
      schoolCode: "DEMO-CODE",
    })
    .returning();
  const [user] = await db
    .insert(usersTable)
    .values({
      phone,
      name: adminName,
      role: "admin",
      schoolCode: "DEMO-CODE",
      tenantId: tenant.id,
    })
    .returning();
  return res.status(201).json({ user, tenant, schoolCode: "DEMO-CODE" });
});

router.post("/register-admin", async (req, res) => {
  const {
    schoolName,
    contactName,
    landline,
    email,
    adminName,
    position,
    mobile,
  } = req.body as {
    schoolName: string;
    contactName: string;
    landline: string;
    email: string;
    adminName: string;
    position: string;
    mobile: string;
  };
  const [reg] = await db
    .insert(adminRegistrationsTable)
    .values({
      schoolName,
      contactName,
      landline,
      email,
      adminName,
      position,
      mobile,
      status: "verified_active",
    })
    .returning();
  return res.status(201).json({ id: reg.id, status: reg.status });
});

router.post("/admin-send-otp", async (req, res) => {
  return res.json({
    success: true,
    demoCode: "123456",
    schoolName: "Demo School",
  });
});

router.post("/admin-verify-otp", async (req, res) => {
  return res.json({ verified: true });
});

router.patch("/profile", async (req, res) => {
  const { userId, name, title, photoUrl } = req.body as {
    userId?: number;
    name?: string;
    title?: string;
    photoUrl?: string | null;
  };
  const [updated] = await db
    .update(usersTable)
    .set({ name, title, photoUrl })
    .where(eq(usersTable.id, userId || 0))
    .returning();
  return res.json(updated);
});

router.get("/me", async (req, res) => {
  const { phone } = req.query as { phone?: string };
  const normalized = normalizePhone(phone || "");
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, normalized))
    .limit(1);
  return res.json({ ...user, tenant: null });
});

export default router;
