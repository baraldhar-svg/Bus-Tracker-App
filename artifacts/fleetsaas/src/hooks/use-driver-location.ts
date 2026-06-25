/**
 * useDriverLocation — subscribes to live GPS coordinates for a specific driver.
 *
 * Strategy (layered):
 *  1. Immediately polls GET /api/trips/active(?driverId=N) to get last-known coordinates.
 *  2. Opens an SSE stream and listens for `location_update` events (posted every ~3 s by the
 *     driver's mobile via POST /api/trips/location). Events are filtered to the requested driverId
 *     when one is provided.
 *  3. Re-polls /api/trips/active every 10 s as a backstop for missed SSE events.
 *
 * @param driverId - optional: scope to a specific driver. When omitted, returns the first active
 *                   driver in the tenant (backward-compat for single-driver portals).
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

export function useDriverLocation(driverId?: number): DriverLocation {
  const [loc, setLoc] = useState<DriverLocation>(DEFAULT_LOC);
  const locRef = useRef(loc);
  locRef.current = loc;

  useEffect(() => {
    let destroyed = false;

    function applyUpdate(lat: number, lng: number, isLive: boolean, updatedAt: string | null) {
      if (destroyed) return;
      setLoc({ lat, lng, isLive, updatedAt });
    }

    const tenantId = getTenantId();
    const headers: Record<string, string> = {};
    if (tenantId !== null) headers["x-tenant-id"] = String(tenantId);

    async function poll() {
      try {
        const url = driverId
          ? `${BASE}/api/trips/active?driverId=${driverId}`
          : `${BASE}/api/trips/active`;
        const r = await fetch(url, { headers });
        if (!r.ok || destroyed) return;
        const d = await r.json() as { currentLat?: number; currentLng?: number; isLive?: boolean; locationUpdatedAt?: string | null };
        if (d.currentLat != null && d.currentLng != null) {
          applyUpdate(d.currentLat, d.currentLng, d.isLive ?? false, d.locationUpdatedAt ?? null);
        }
      } catch { /* network error — ignore */ }
    }

    void poll();
    const pollInterval = setInterval(poll, 10_000);

    const es = new EventSource(`${BASE}/api/events`);

    es.addEventListener("location_update", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as {
          driverId?: number; lat?: number; lng?: number; updatedAt?: string;
        };
        // If we're scoped to a specific driver, ignore events from other drivers.
        if (driverId != null && d.driverId !== driverId) return;
        if (d.lat != null && d.lng != null) {
          applyUpdate(d.lat, d.lng, true, d.updatedAt ?? null);
        }
      } catch { /* malformed event */ }
    });

    es.addEventListener("trip_completed", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { driverId?: number };
        // Only mark not-live if the completed driver matches our scope (or no scope).
        if (driverId != null && d.driverId !== driverId) return;
        setLoc((prev) => ({ ...prev, isLive: false }));
      } catch { /* ignore */ }
    });

    return () => {
      destroyed = true;
      clearInterval(pollInterval);
      es.close();
    };
  }, [driverId]);

  return loc;
}
