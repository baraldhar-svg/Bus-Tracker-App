import { db } from "@workspace/db";
import { whatsappNotificationsTable } from "@workspace/db";
import { logger } from "./logger";

const PHONE_NUMBER_ID = "1098483366689745";
const WA_API_URL = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

// Template names as registered in Meta Business Manager
const TEMPLATES = {
  absent: "absent_alert",
  delay: "delay_alert",
} as const;

// WhatsApp error codes in the 132000 range indicate template-related failures.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const TEMPLATE_ERROR_CODES = new Set([
  132000, // Template parameter count mismatch
  132001, // Template does not exist
  132005, // Template hydration error
  132007, // Template format character policy violated
  132008, // Template throttled
  132012, // Template parameter format mismatch
  132015, // Template not approved
  132016, // Template deleted
  132068, // Template paused
  132069, // Template disabled
]);

function isTemplateError(errorCode: number): boolean {
  return TEMPLATE_ERROR_CODES.has(errorCode) || (errorCode >= 132000 && errorCode < 133000);
}

export interface WhatsAppPayload {
  tenantId: number;
  to: string;
  recipientName: string;
  type: "absent" | "delay";
  passengerName?: string;
  stationName?: string;
  messageBody: string;
}

/**
 * Build the WhatsApp template components for the given alert type.
 *
 * Template definitions (must match what is registered in Meta Business Manager):
 *
 * absent_alert (en_US):
 *   Body: "{{1}} was marked absent at {{2}} today. Please contact the school if this is unexpected."
 *   Parameters: [passengerName, stationName]
 *
 * delay_alert (en_US):
 *   Body: "Bus delay alert: the bus serving {{1}} is running behind schedule. We will update you when it arrives."
 *   Parameters: [stationName]
 */
function buildTemplateComponents(
  type: "absent" | "delay",
  passengerName: string | undefined,
  stationName: string | undefined,
): Array<{ type: string; parameters: Array<{ type: string; text: string }> }> {
  if (type === "absent") {
    return [
      {
        type: "body",
        parameters: [
          { type: "text", text: passengerName ?? "Your child" },
          { type: "text", text: stationName ?? "their station" },
        ],
      },
    ];
  }

  // delay
  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: stationName ?? "your station" },
      ],
    },
  ];
}

export async function sendWhatsAppAlert(payload: WhatsAppPayload): Promise<void> {
  const token = process.env["WHATSAPP_ACCESS_TOKEN"];
  if (!token) {
    logger.warn("WHATSAPP_ACCESS_TOKEN not set — skipping WhatsApp notification");
    return;
  }

  const templateName = TEMPLATES[payload.type];
  let status: "sent" | "failed" = "sent";
  let errorDetail: string | undefined;

  try {
    const components = buildTemplateComponents(payload.type, payload.passengerName, payload.stationName);

    const response = await fetch(WA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: payload.to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: "en_US" },
          components,
        },
      }),
    });

    const data = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      status = "failed";

      // Detect template-specific errors so admins can act on them
      const waError = (data["error"] as Record<string, unknown> | undefined);
      const errorCode = typeof waError?.["code"] === "number" ? waError["code"] : 0;

      if (isTemplateError(errorCode)) {
        errorDetail = `TEMPLATE_ERROR [${errorCode}]: template "${templateName}" was rejected by WhatsApp — ${waError?.["message"] ?? "unknown reason"}. Verify the template is approved in Meta Business Manager.`;
        logger.error(
          { status: response.status, errorCode, template: templateName, type: payload.type },
          "WhatsApp template delivery failed — template not approved or parameters mismatched",
        );
      } else {
        errorDetail = JSON.stringify(data);
        logger.error({ status: response.status, data, type: payload.type }, "WhatsApp alert failed");
      }
    } else {
      logger.info({ to: payload.to, type: payload.type, template: templateName }, "WhatsApp template alert sent");
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
      templateName,
      messageBody: payload.messageBody,
      status,
      errorDetail: errorDetail ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to persist WhatsApp notification log");
  }
}
