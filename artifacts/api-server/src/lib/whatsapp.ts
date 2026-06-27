import { db } from "@workspace/db";
import { whatsappNotificationsTable } from "@workspace/db";
import { logger } from "./logger";

const PHONE_NUMBER_ID = "1098483366689745";
const WA_API_URL = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

export interface WhatsAppPayload {
  tenantId: number;
  to: string;
  recipientName: string;
  type: "absent" | "delay";
  passengerName?: string;
  stationName?: string;
  messageBody: string;
}

export async function sendWhatsAppAlert(payload: WhatsAppPayload): Promise<void> {
  const token = process.env["WHATSAPP_ACCESS_TOKEN"];
  if (!token) {
    logger.warn("WHATSAPP_ACCESS_TOKEN not set — skipping WhatsApp notification");
    return;
  }

  let status: "sent" | "failed" = "sent";
  let errorDetail: string | undefined;

  try {
    const response = await fetch(WA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: payload.to.replace(/\D/g, ""),
        type: "text",
        text: { body: payload.messageBody },
      }),
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      status = "failed";
      errorDetail = JSON.stringify(data);
      logger.error({ status: response.status, data, type: payload.type }, "WhatsApp alert failed");
    } else {
      logger.info({ to: payload.to, type: payload.type }, "WhatsApp alert sent");
    }
  } catch (err) {
    status = "failed";
    errorDetail = err instanceof Error ? err.message : String(err);
    logger.error({ err, type: payload.type }, "WhatsApp alert fetch error");
  }

  try {
    await db.insert(whatsappNotificationsTable).values({
      tenantId: payload.tenantId,
      to: payload.to,
      recipientName: payload.recipientName,
      type: payload.type,
      passengerName: payload.passengerName ?? null,
      stationName: payload.stationName ?? null,
      messageBody: payload.messageBody,
      status,
      errorDetail: errorDetail ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to persist WhatsApp notification log");
  }
}
