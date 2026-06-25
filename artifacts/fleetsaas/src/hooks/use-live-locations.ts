/**
 * useLiveLocations — returns live GPS positions for ALL online drivers in the tenant.
 *
 * Used by admin/superadmin dashboards to render multi-vehicle fleet maps.
 *
 * Strategy:
 *  1. Polls GET /api/trips/locations every 10 s to get the full set of online drivers.
 *  2. Patches individual entries in real-time via SSE `location_update` events (each event
 *     now carries driverId + vehicleNumber so consumers can identify which vehicle moved).
 *  3. Handles trip_completed events to mark the finished driver as no longer live.
 *
 * Multi-tenant isolation:
 *  The browser EventSource API cannot send custom headers, so the tenantId is passed
 *  as a query parameter: /api/events?tenantId=N. The server rooms SSE clients by
 *  tenantId so this client ONLY receives events for its own school — cross-tenant
 *  leakage is impossible.
 *
 * Session cleanup:
 *  tenantId is included in the useEffect dependency array. If the user logs out or
 *  switches school, the old EventSource is closed and a new one is opened for the
 *  new tenant. No leftover subscriptions survive a school switch.
 */
import { useEffect, useState } from "react";
import { getTenantId } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface LiveDriverLocation {
  id: number;
  name: string;
  vehicleNumber: string;
  lat: number | null;
  lng: number | null;
  isLive: boolean;
  updatedAt: string | null;
}

export function useLiveLocations(): LiveDriverLocation[] {
  const [locations, setLocations] = useState<LiveDriverLocation[]>([]);

  // Capture tenantId once; it doesn't change mid-session. Including it in the
  // dependency array guarantees a fresh EventSource whenever auth changes.
  const tenantId = getTenantId();

  useEffect(() => {
    let destroyed = false;

    const headers: Record<string, string> = {};
    if (tenantId !== null) headers["x-tenant-id"] = String(tenantId);

    async function poll() {
      try {
        const r = await fetch(`${BASE}/api/trips/locations`, { headers });
        if (!r.ok || destroyed) return;
        const data = await r.json() as LiveDriverLocation[];
        if (!destroyed) setLocations(data);
      } catch { /* network error — ignore */ }
    }

    void poll();
    const pollInterval = setInterval(poll, 10_000);

    // SSE: EventSource cannot send custom headers — pass tenantId as query param.
    // The server joins this client into the tenant-scoped room immediately on connect,
    // so only events for this school's tenant are written to this response stream.
    const esUrl = tenantId !== null
      ? `${BASE}/api/events?tenantId=${tenantId}`
      : `${BASE}/api/events`;
    const es = new EventSource(esUrl);

    es.addEventListener("location_update", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as {
          driverId?: number;
          vehicleNumber?: string;
          lat?: number;
          lng?: number;
          updatedAt?: string;
        };
        if (d.driverId == null || d.lat == null || d.lng == null) return;
        setLocations((prev) => {
          const idx = prev.findIndex((x) => x.id === d.driverId);
          if (idx === -1) {
            // New driver came online — trigger a full re-poll to get their full record.
            void poll();
            return prev;
          }
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            lat: d.lat!,
            lng: d.lng!,
            isLive: true,
            updatedAt: d.updatedAt ?? null,
          };
          return next;
        });
      } catch { /* malformed event */ }
    });

    es.addEventListener("trip_completed", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { driverId?: number };
        if (d.driverId == null) {
          // Tenant-wide complete — re-poll to get updated state.
          void poll();
          return;
        }
        setLocations((prev) => {
          const idx = prev.findIndex((x) => x.id === d.driverId);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], isLive: false };
          return next;
        });
      } catch { /* ignore */ }
    });

    es.addEventListener("trip_started", () => {
      // A new driver went live — re-poll to include them.
      void poll();
    });

    return () => {
      destroyed = true;
      clearInterval(pollInterval);
      // Closing the EventSource unbinds the device from the tenant's SSE room.
      // On logout or school switch, the old connection is guaranteed to be closed
      // before the new one opens — no cross-tenant telemetry can leak.
      es.close();
    };
  }, [tenantId]); // re-establish connection when tenant changes (logout / school switch)

  return locations;
}
