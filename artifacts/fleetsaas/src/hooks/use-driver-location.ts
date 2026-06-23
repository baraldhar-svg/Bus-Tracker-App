/**
 * useDriverLocation — subscribes to live driver GPS coordinates.
 *
 * Strategy (layered):
 *  1. Immediately polls GET /api/trips/active to get last-known coordinates.
 *  2. Opens an SSE stream and listens for `location_update` events, which the
 *     driver's mobile posts every ~3 seconds via POST /api/trips/location.
 *  3. Re-polls /api/trips/active every 10 s as a backstop for missed SSE events.
 */
import { useEffect, useRef, useState } from "react";
import { getTenantId } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface DriverLocation {
  lat: number;
  lng: number;
  isLive: boolean;
  updatedAt: string | null;
}

const DEFAULT_LOC: DriverLocation = {
  lat: 27.7172,
  lng: 85.3240,
  isLive: false,
  updatedAt: null,
};

export function useDriverLocation(): DriverLocation {
  const [loc, setLoc] = useState<DriverLocation>(DEFAULT_LOC);
  const locRef = useRef(loc);
  locRef.current = loc;

  useEffect(() => {
    let destroyed = false;

    function applyUpdate(lat: number, lng: number, isLive: boolean, updatedAt: string | null) {
      if (destroyed) return;
      setLoc({ lat, lng, isLive, updatedAt });
    }

    // --- 1. Initial poll ---
    const tenantId = getTenantId();
    const headers: Record<string, string> = {};
    if (tenantId !== null) headers["x-tenant-id"] = String(tenantId);

    async function poll() {
      try {
        const r = await fetch(`${BASE}/api/trips/active`, { headers });
        if (!r.ok || destroyed) return;
        const d = await r.json() as { currentLat?: number; currentLng?: number; isLive?: boolean; locationUpdatedAt?: string | null };
        if (d.currentLat != null && d.currentLng != null) {
          applyUpdate(d.currentLat, d.currentLng, d.isLive ?? false, d.locationUpdatedAt ?? null);
        }
      } catch { /* network error — ignore */ }
    }

    void poll();
    const pollInterval = setInterval(poll, 10_000);

    // --- 2. SSE stream ---
    const es = new EventSource(`${BASE}/api/events`);

    es.addEventListener("location_update", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { lat?: number; lng?: number; updatedAt?: string };
        if (d.lat != null && d.lng != null) {
          applyUpdate(d.lat, d.lng, true, d.updatedAt ?? null);
        }
      } catch { /* malformed event */ }
    });

    // Trip completed — mark as not-live
    es.addEventListener("trip_completed", () => {
      setLoc((prev) => ({ ...prev, isLive: false }));
    });

    return () => {
      destroyed = true;
      clearInterval(pollInterval);
      es.close();
    };
  }, []);

  return loc;
}
