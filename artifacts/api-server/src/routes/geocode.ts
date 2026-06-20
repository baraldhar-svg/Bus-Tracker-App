import { Router } from "express";

const router = Router();

// GET /geocode?q=... — Nominatim address lookup (Nepal-biased)
router.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "Query parameter 'q' is required" });

  try {
    const encoded = encodeURIComponent(q);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&accept-language=en&countrycodes=np`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "OrbitTrack School Bus Tracker/1.0 (nepal-fleet@orbittrack.app)",
        "Accept": "application/json",
      },
    });
    if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
    const data: Array<{ display_name: string; lat: string; lon: string }> = await response.json();
    const results = data.map((r) => ({
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Geocode lookup failed");
    res.status(502).json({ error: "Geocode service unavailable" });
  }
});

export default router;
