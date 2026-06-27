import { logger } from "./logger";

export interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

export interface ExpoPushReceipt {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Send one or more Expo push notifications.
 * Chunks are sent in batches of 100 (Expo's recommended limit).
 * Errors are logged but never thrown — push is best-effort.
 */
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[]
): Promise<void> {
  if (messages.length === 0) return;

  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "(no body)");
        logger.warn({ status: res.status, body: text }, "Expo push HTTP error");
        return;
      }

      const json = (await res.json()) as { data: ExpoPushReceipt[] };
      const failed = json.data?.filter((r) => r.status === "error") ?? [];
      if (failed.length > 0) {
        logger.warn({ failed }, "Some Expo push receipts returned errors");
      }
    } catch (err) {
      logger.error({ err }, "Expo push send failed");
    }
  }
}
