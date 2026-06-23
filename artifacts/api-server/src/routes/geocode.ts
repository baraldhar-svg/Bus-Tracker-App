import { Router } from "express";

const router = Router();

// GET /geocode?q=... — Nominatim address lookup (Nepal-biased, kept as fallback)
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
    const raw = await response.json() as Array<{ display_name: string; lat: string; lon: string }>;
    const results = raw.map((r) => ({
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
    return res.json(results);
  } catch (err) {
    req.log.error({ err }, "Geocode lookup failed");
    return res.status(502).json({ error: "Geocode service unavailable" });
  }
});

// GET /geocode/places?q=&session= — Google Places Autocomplete (server-side, key never exposed)
router.get("/places", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const session = String(req.query.session ?? "orbittrack-session");
  if (!q) return res.status(400).json({ error: "Query required" });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    req.log.warn("GOOGLE_MAPS_API_KEY not set — falling back to Nominatim");
    return res.status(503).json({ error: "Google Maps not configured" });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&key=${key}&components=country:np&language=en&sessiontoken=${encodeURIComponent(session)}`;
    const r = await fetch(url);
    const data = await r.json() as {
      status: string;
      predictions?: Array<{ place_id: string; description: string; structured_formatting?: { main_text: string; secondary_text?: string } }>;
      error_message?: string;
    };

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      req.log.error({ status: data.status, msg: data.error_message }, "Places autocomplete error");
      return res.status(502).json({ error: data.error_message ?? "Places API error" });
    }

    return res.json((data.predictions ?? []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description.split(",")[0],
      secondaryText: p.structured_formatting?.secondary_text ?? "",
    })));
  } catch (err) {
    req.log.error({ err }, "Places autocomplete failed");
    return res.status(502).json({ error: "Places service unavailable" });
  }
});

// GET /geocode/place?place_id=&session= — Google Places Details → precise lat/lng + name
router.get("/place", async (req, res) => {
  const placeId = String(req.query.place_id ?? "").trim();
  const session = String(req.query.session ?? "orbittrack-session");
  if (!placeId) return res.status(400).json({ error: "place_id required" });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: "Google Maps not configured" });

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,name,formatted_address&key=${key}&sessiontoken=${encodeURIComponent(session)}`;
    const r = await fetch(url);
    const data = await r.json() as {
      status: string;
      result?: {
        geometry?: { location?: { lat: number; lng: number } };
        name?: string;
        formatted_address?: string;
      };
      error_message?: string;
    };

    if (data.status !== "OK") {
      req.log.error({ status: data.status, msg: data.error_message }, "Places details error");
      return res.status(502).json({ error: data.error_message ?? "Places details error" });
    }

    const loc = data.result?.geometry?.location;
    if (!loc) return res.status(404).json({ error: "No geometry returned" });

    return res.json({
      lat: loc.lat,
      lng: loc.lng,
      name: data.result?.name ?? "",
      formattedAddress: data.result?.formatted_address ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "Places details failed");
    return res.status(502).json({ error: "Places service unavailable" });
  }
});

// GET /geocode/maps-key — returns the Maps JS API key so the browser can load
// the Google Maps JS SDK. The key is always visible in the Maps script URL anyway;
// serving it here keeps it out of frontend source code.
router.get("/maps-key", (_req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
  return res.json({ key });
});

export default router;
