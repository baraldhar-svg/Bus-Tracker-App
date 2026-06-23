/**
 * FleetMap — multi-bus live tracking map for admin views.
 *
 * Renders all buses on a Leaflet map and auto-fits the viewport using
 * LatLngBounds so every vehicle is visible simultaneously. When the real
 * SSE-connected driver's coordinates update, the live bus marker is mutated
 * in-place via setLatLng() — no map re-render, no flicker.
 */
import { useEffect, useRef } from "react";
import { Maximize2 } from "lucide-react";

export interface FleetBus {
  id: number;
  label: string;
  driverName?: string;
  lat: number;
  lng: number;
  status: "on-route" | "depot" | string;
  speed?: number;
}

interface FleetMapProps {
  buses: FleetBus[];
  /** Real-time GPS from SSE — mutates the matching bus marker in-place */
  liveLat?: number;
  liveLng?: number;
  liveIsLive?: boolean;
  /** Which bus id in the `buses` array receives the live GPS updates */
  liveBusId?: number;
  height?: number;
}

const BASE_BUS_SVG = `<svg width="20" height="15" viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="0.5" width="16" height="10" rx="2.2" fill="white"/>
  <rect x="2.5" y="2" width="4" height="3.5" rx="0.9" fill="#93C5FD"/>
  <rect x="8" y="2" width="4" height="3.5" rx="0.9" fill="#93C5FD"/>
  <rect x="13.5" y="2" width="2" height="3.5" rx="0.6" fill="#FDE68A"/>
  <rect x="17" y="0.5" width="4" height="10" rx="1.8" fill="#FDE68A" opacity="0.85"/>
  <circle cx="4.5" cy="14" r="2.2" fill="#1e293b"/>
  <circle cx="4.5" cy="14" r="0.95" fill="#94a3b8"/>
  <circle cx="13" cy="14" r="2.2" fill="#1e293b"/>
  <circle cx="13" cy="14" r="0.95" fill="#94a3b8"/>
</svg>`;

function makeBusMarkerHtml(status: string, isLive: boolean, label: string): string {
  const isOnRoute = status === "on-route";
  const bg = isLive ? "#D97706" : isOnRoute ? "#16a34a" : "#64748b";

  if (isLive) {
    return `<div style="position:relative;width:52px;height:60px;display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="position:absolute;top:0;left:50%;width:48px;height:48px;border-radius:50%;background:rgba(34,197,94,0.10);border:1.5px solid rgba(34,197,94,0.28);transform:translateX(-50%);animation:fm-ripple-out 2.4s ease-out infinite;"></div>
      <div style="position:absolute;top:0;left:50%;width:34px;height:34px;border-radius:50%;background:rgba(34,197,94,0.15);border:1.5px solid rgba(34,197,94,0.42);transform:translateX(-50%) translateY(7px);animation:fm-ripple-out 2.4s ease-out infinite 0.7s;"></div>
      <div style="position:relative;width:40px;height:40px;border-radius:10px;background:${bg};border:2.5px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.40);z-index:1;">${BASE_BUS_SVG}</div>
      <div style="position:absolute;top:2px;right:2px;width:10px;height:10px;background:#22c55e;border:2px solid white;border-radius:50%;z-index:2;"></div>
      <div style="background:${bg};color:white;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.30);z-index:1;line-height:1.4;">${label}</div>
    </div>`;
  }

  return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
    <div style="width:38px;height:38px;border-radius:9px;background:${bg};border:2.5px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.28);">${BASE_BUS_SVG}</div>
    <div style="background:${bg};color:white;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);line-height:1.4;">${label}</div>
  </div>`;
}

function injectFleetStyles() {
  if (document.getElementById("fleet-map-styles")) return;
  const s = document.createElement("style");
  s.id = "fleet-map-styles";
  s.textContent = `
    @keyframes fm-ripple-out {
      0%   { opacity: 0.85; transform: translateX(-50%) scale(0.4); }
      100% { opacity: 0;    transform: translateX(-50%) scale(1.85); }
    }
    .fm-tooltip {
      background: rgba(15,23,42,0.90) !important;
      color: #f8fafc !important;
      border: none !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      padding: 4px 9px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35) !important;
    }
    .fm-tooltip::before { display:none !important; }
  `;
  document.head.appendChild(s);
}

export default function FleetMap({
  buses,
  liveLat,
  liveLng,
  liveIsLive = false,
  liveBusId,
  height = 340,
}: FleetMapProps) {
  const mapRef     = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<unknown>(null);
  /** Map from bus.id → Leaflet marker instance */
  const markerMapRef = useRef<Map<number, unknown>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // ── Build map once ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || buses.length === 0) return;

    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    injectFleetStyles();

    import("leaflet").then((L) => {
      if (leafletRef.current) return;

      // Center on the midpoint of all buses initially; fitBounds will correct zoom
      const center = buses[Math.floor(buses.length / 2)];

      const map = L.map(mapRef.current!, {
        center: [center.lat, center.lng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, subdomains: "abcd" }
      ).addTo(map);

      leafletRef.current = map;
      const mMap = markerMapRef.current;

      buses.forEach((bus) => {
        const isLiveBus = bus.id === liveBusId && liveIsLive;
        const icon = L.divIcon({
          html: makeBusMarkerHtml(bus.status, isLiveBus, bus.label),
          className: "",
          iconSize: isLiveBus ? [52, 60] : [38, 48],
          iconAnchor: isLiveBus ? [26, 20] : [19, 14],
        });
        const marker = L.marker([bus.lat, bus.lng], { icon, zIndexOffset: bus.id === liveBusId ? 1000 : 0 });
        (marker as unknown as { addTo: (m: unknown) => void }).addTo(map);
        marker.bindTooltip(
          `<b>${bus.label}</b><br/>${bus.driverName ?? "Driver"} · ${bus.status === "on-route" ? "🟢 On Route" : "⬛ At Depot"}${bus.speed != null ? `<br/>${bus.speed} km/h` : ""}`,
          { permanent: false, direction: "top", className: "fm-tooltip" }
        );
        mMap.set(bus.id, marker);
      });

      // ── Auto-fit all buses into view ──────────────────────────────────────
      if (buses.length >= 2) {
        const bounds = L.latLngBounds(buses.map((b) => [b.lat, b.lng] as [number, number]));
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.25), { animate: false, maxZoom: 16 });
        }
      }
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (leafletRef.current) {
        (leafletRef.current as { remove: () => void }).remove();
        leafletRef.current = null;
        markerMapRef.current.clear();
        currentPosRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Smooth-animate live bus marker on SSE GPS updates ─────────────────────
  useEffect(() => {
    if (liveBusId == null || liveLat == null || liveLng == null) return;
    if (!leafletRef.current) return;

    const marker = markerMapRef.current.get(liveBusId);
    if (!marker) return;

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const from = currentPosRef.current ?? { lat: liveLat, lng: liveLng };
    const to   = { lat: liveLat, lng: liveLng };
    const startTime = performance.now();
    const DURATION  = 2000;

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    function ease(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function tick(now: number) {
      const raw = Math.min((now - startTime) / DURATION, 1);
      const t   = ease(raw);
      const lat = lerp(from.lat, to.lat, t);
      const lng = lerp(from.lng, to.lng, t);

      (marker as { setLatLng: (p: [number, number]) => void }).setLatLng([lat, lng]);

      if (raw < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        currentPosRef.current = to;
      }
    }
    animFrameRef.current = requestAnimationFrame(tick);

    // Update icon to reflect live state
    import("leaflet").then((L) => {
      const bus = buses.find((b) => b.id === liveBusId);
      if (!bus) return;
      const newIcon = L.divIcon({
        html: makeBusMarkerHtml(bus.status, liveIsLive, bus.label),
        className: "",
        iconSize: liveIsLive ? [52, 60] : [38, 48],
        iconAnchor: liveIsLive ? [26, 20] : [19, 14],
      });
      (marker as { setIcon: (i: unknown) => void }).setIcon(newIcon);
    });
  }, [liveLat, liveLng, liveIsLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fit-bounds helper ──────────────────────────────────────────────────────
  function resetView() {
    if (!leafletRef.current) return;
    import("leaflet").then((L) => {
      const positions: [number, number][] = buses.map((b) => {
        // If this is the live bus, use its last real position
        if (b.id === liveBusId && currentPosRef.current) {
          return [currentPosRef.current.lat, currentPosRef.current.lng];
        }
        return [b.lat, b.lng];
      });

      if (positions.length === 1) {
        (leafletRef.current as { setView: (p: [number, number], z: number) => void })
          .setView(positions[0], 15);
        return;
      }

      const bounds = L.latLngBounds(positions);
      if (bounds.isValid()) {
        (leafletRef.current as { fitBounds: (b: unknown, o: object) => void })
          .fitBounds(bounds, { animate: true, duration: 0.8, padding: [40, 40], maxZoom: 16 });
      }
    });
  }

  function zoomIn()  { (leafletRef.current as { zoomIn:  () => void } | null)?.zoomIn();  }
  function zoomOut() { (leafletRef.current as { zoomOut: () => void } | null)?.zoomOut(); }

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={mapRef} className="w-full h-full" />

      {liveIsLive && (
        <div className="absolute top-2 left-2 z-[1000] flex items-center gap-1.5 rounded-full bg-green-600/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-md backdrop-blur-sm pointer-events-none">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          GPS LIVE
        </div>
      )}

      <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); resetView(); }}
          title="Fit all buses in view"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground hover:bg-muted transition-colors"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-1">
        <button onClick={(e) => { e.stopPropagation(); zoomIn(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors"
        >+</button>
        <button onClick={(e) => { e.stopPropagation(); zoomOut(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors"
        >−</button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-2 z-[1000] flex flex-col gap-1">
        <div className="flex items-center gap-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-border px-2 py-1.5 shadow-sm backdrop-blur-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
          <span className="text-[10px] font-semibold text-foreground">Live GPS</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-border px-2 py-1.5 shadow-sm backdrop-blur-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600 shrink-0" />
          <span className="text-[10px] font-semibold text-foreground">On Route</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-border px-2 py-1.5 shadow-sm backdrop-blur-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400 shrink-0" />
          <span className="text-[10px] font-semibold text-foreground">At Depot</span>
        </div>
      </div>
    </div>
  );
}
