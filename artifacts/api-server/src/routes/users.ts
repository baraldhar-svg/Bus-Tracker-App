import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const role = typeof req.query.role === "string" ? req.query.role.trim() : "";

  let rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      role: usersTable.role,
      tenantId: usersTable.tenantId,
      tenantName: tenantsTable.name,
      createdAt: usersTable.createdAt,
      biometricEnabled: usersTable.biometricEnabled,
    })
    .from(usersTable)
    .leftJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
    .orderBy(usersTable.tenantId, usersTable.name);

  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) ||
        r.phone.includes(lower)
    );
  }
  if (role) {
    rows = rows.filter((r) => r.role === role);
  }

  return res.json(rows);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof usersTable.$inferInsert> = {};

  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.phone === "string" && body.phone.trim()) updates.phone = body.phone.trim();
  if (
    typeof body.role === "string" &&
    ["student", "driver", "admin", "superadmin"].includes(body.role)
  ) {
    updates.role = body.role as typeof usersTable.$inferInsert["role"];
  }

  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: "Nothing to update" });

  await db.update(usersTable).set(updates).where(eq(usersTable.id, id));

  const [row] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      role: usersTable.role,
      tenantId: usersTable.tenantId,
      tenantName: tenantsTable.name,
      createdAt: usersTable.createdAt,
      biometricEnabled: usersTable.biometricEnabled,
    })
    .from(usersTable)
    .leftJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
    .where(eq(usersTable.id, id));

  return res.json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(usersTable).where(eq(usersTable.id, id));
  return res.json({ ok: true });
});

export default router;
