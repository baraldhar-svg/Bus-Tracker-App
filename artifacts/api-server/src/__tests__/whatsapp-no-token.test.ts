import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { db, whatsappNotificationsTable } from "@workspace/db";
import { sendWhatsAppAlert } from "../lib/whatsapp";

describe("sendWhatsAppAlert — no token path", () => {
  const TENANT_ID = 1;
  const TEST_PHONE = "+977-9800099001";
  let savedToken: string | undefined;
  const insertedIds: number[] = [];

  beforeEach(() => {
    savedToken = process.env["WHATSAPP_ACCESS_TOKEN"];
    delete process.env["WHATSAPP_ACCESS_TOKEN"];
  });

  afterEach(async () => {
    if (savedToken !== undefined) {
      process.env["WHATSAPP_ACCESS_TOKEN"] = savedToken;
    } else {
      delete process.env["WHATSAPP_ACCESS_TOKEN"];
    }
    for (const id of insertedIds) {
      await db
        .delete(whatsappNotificationsTable)
        .where(eq(whatsappNotificationsTable.id, id));
    }
    insertedIds.length = 0;
  });

  it("writes a failed row with status=failed and errorDetail=token_not_configured", async () => {
    await sendWhatsAppAlert({
      tenantId: TENANT_ID,
      to: TEST_PHONE,
      recipientName: "Test Parent",
      type: "absent",
      passengerName: "Test Student",
      stationName: "Central Station",
      messageBody: "Test Student was marked absent at Central Station today.",
    });

    const rows = await db
      .select()
      .from(whatsappNotificationsTable)
      .where(
        and(
          eq(whatsappNotificationsTable.tenantId, TENANT_ID),
          eq(whatsappNotificationsTable.to, TEST_PHONE),
        ),
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1]!;
    expect(row.status).toBe("failed");
    expect(row.errorDetail).toBe("token_not_configured");
    expect(row.type).toBe("absent");
    expect(row.templateName).toBe("absent_alert");
    expect(row.recipientName).toBe("Test Parent");

    insertedIds.push(row.id);
  });

  it("logs a failed row for delay type as well", async () => {
    await sendWhatsAppAlert({
      tenantId: TENANT_ID,
      to: TEST_PHONE,
      recipientName: "Test Parent",
      type: "delay",
      stationName: "North Gate",
      messageBody: "Bus delay alert: the bus serving North Gate is running behind schedule.",
    });

    const rows = await db
      .select()
      .from(whatsappNotificationsTable)
      .where(
        and(
          eq(whatsappNotificationsTable.tenantId, TENANT_ID),
          eq(whatsappNotificationsTable.to, TEST_PHONE),
        ),
      );

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1]!;
    expect(row.status).toBe("failed");
    expect(row.errorDetail).toBe("token_not_configured");
    expect(row.type).toBe("delay");
    expect(row.templateName).toBe("delay_alert");

    insertedIds.push(row.id);
  });
});
