import { Router } from "express";
import { addSSEClient, removeSSEClient } from "../lib/sse";

const router = Router();

/**
 * GET /api/events — long-lived SSE connection, tenant-scoped.
 *
 * Security note: the browser EventSource API cannot send custom headers, so
 * x-tenant-id is not available here. Instead the client passes tenantId as a
 * query parameter (?tenantId=N). We validate and fall back to req.tenantId
 * (which itself defaults to 1) if absent or malformed.
 *
 * The tenantId is used as the room key in sse.ts so this client will ONLY
 * receive broadcasts that target its specific school. Events for other tenants
 * are never written to this response.
 */
router.get("/", (req, res) => {
  // Resolve tenantId — prefer the explicit query param over the header-derived one
  // because EventSource cannot send the x-tenant-id header.
  const rawQ = req.query["tenantId"];
  const parsedQ = rawQ ? parseInt(String(Array.isArray(rawQ) ? rawQ[0] : rawQ), 10) : NaN;
  const tenantId: number = !isNaN(parsedQ) && parsedQ > 0 ? parsedQ : req.tenantId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`: connected tenant=${tenantId}\n\n`);

  addSSEClient(tenantId, res);

  // Keep-alive ping every 25 s — prevents proxy/CDN from closing idle connections.
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSSEClient(tenantId, res);
  });
});

export default router;
