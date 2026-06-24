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

// GET /geocode/reverse?lat=&lng= — Nominatim reverse geocoding, returns best local name
router.get("/reverse", async (req, res) => {
  const lat = parseFloat(String(req.query.lat ?? ""));
  const lng = parseFloat(String(req.query.lng ?? ""));
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "lat and lng required" });

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "OrbitTrack School Bus Tracker/1.0 (nepal-fleet@orbittrack.app)",
        "Accept": "application/json",
      },
    });
    if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
    const data = await response.json() as {
      display_name?: string;
      address?: {
        suburb?: string; neighbourhood?: string; road?: string;
        village?: string; town?: string; city?: string; county?: string;
        quarter?: string; residential?: string;
      };
    };
    const addr = data.address ?? {};
    const area =
      addr.suburb ?? addr.neighbourhood ?? addr.quarter ??
      addr.residential ?? addr.village;
    const road = addr.road;
    const city = addr.town ?? addr.city ?? addr.county;

    let name: string;
    if (road && area) {
      name = `${road}, ${area}`;
    } else if (road && city) {
      name = `${road}, ${city}`;
    } else if (area) {
      name = area;
    } else if (road) {
      name = road;
    } else {
      name =
        city ??
        (data.display_name ? data.display_name.split(",")[0]?.trim() : null) ??
        `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
    return res.json({ name, lat, lng });
  } catch (err) {
    req.log.error({ err }, "Reverse geocode failed");
    return res.status(502).json({ error: "Reverse geocode unavailable" });
  }
});

export default router;
