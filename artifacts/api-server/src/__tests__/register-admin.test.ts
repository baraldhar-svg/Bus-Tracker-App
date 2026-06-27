import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, adminRegistrationsTable } from "@workspace/db";

const BASE_PAYLOAD = {
  schoolName: "Sunrise Academy",
  contactName: "Ram Bahadur",
  landline: "01-4567890",
  email: "admin@sunrise.edu.np",
  adminName: "Sita Sharma",
  position: "Principal",
  mobile: "9812345678",
};

describe("POST /api/auth/register-admin", () => {
  const insertedIds: number[] = [];

  afterEach(async () => {
    for (const id of insertedIds) {
      await db
        .delete(adminRegistrationsTable)
        .where(eq(adminRegistrationsTable.id, id));
    }
    insertedIds.length = 0;
  });

  it("returns 201 with id and status for a valid registration payload", async () => {
    const uniqueEmail = `test-${Date.now()}@sunrise.edu.np`;

    const res = await request(app)
      .post("/api/auth/register-admin")
      .send({ ...BASE_PAYLOAD, email: uniqueEmail })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(typeof res.body.id).toBe("number");
    expect(res.body).toHaveProperty("status");

    if (res.body.id) insertedIds.push(res.body.id);
  });

  it("returns 400 when a required field (schoolName) is missing", async () => {
    const { schoolName: _omitted, ...incomplete } = BASE_PAYLOAD;

    const res = await request(app)
      .post("/api/auth/register-admin")
      .send(incomplete)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("details");
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("returns 400 when email is not a valid address", async () => {
    const res = await request(app)
      .post("/api/auth/register-admin")
      .send({ ...BASE_PAYLOAD, email: "not-an-email" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("details");
  });
});
