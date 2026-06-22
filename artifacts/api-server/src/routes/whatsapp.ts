import { Router } from "express";

const router = Router();

const PHONE_NUMBER_ID = "1098483366689745";

router.post("/send", async (req, res) => {
  const token = process.env["WHATSAPP_ACCESS_TOKEN"];
  if (!token) {
    req.log.error("WHATSAPP_ACCESS_TOKEN secret is not set");
    return res.status(500).json({ error: "WhatsApp not configured" });
  }

  const { to } = req.body as { to?: string };
  if (!to) return res.status(400).json({ error: "'to' phone number is required" });

  const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: "hello_world", language: { code: "en_US" } },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      req.log.error({ status: response.status, data }, "WhatsApp API error");
      return res.status(response.status).json({ error: data });
    }

    req.log.info({ to }, "WhatsApp message sent");
    return res.json({ success: true, data });
  } catch (err) {
    req.log.error({ err }, "WhatsApp fetch failed");
    return res.status(500).json({ error: "Failed to send WhatsApp message" });
  }
});

export default router;
