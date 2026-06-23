import { useEffect, useRef } from "react";
import { Crosshair } from "lucide-react";

export interface RouteStop {
  lat: number;
  lng: number;
  name: string;
  eta?: number;
}

interface BusMapProps {
  route: RouteStop[];
  busLat: number;
  busLng: number;
  isLive?: boolean;
  showMyLocation?: boolean;
}

const BASE_BUS_SVG = `<svg width="22" height="16" viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="0.5" width="16" height="10" rx="2.2" fill="white"/>
  <rect x="2.5" y="2" width="4" height="3.5" rx="0.9" fill="#93C5FD"/>
  <rect x="8" y="2" width="4" height="3.5" rx="0.9" fill="#93C5FD"/>
  <rect x="13.5" y="2" width="2" height="3.5" rx="0.6" fill="#FDE68A"/>
  <rect x="17" y="0.5" width="4" height="10" rx="1.8" fill="#FDE68A" opacity="0.85"/>
  <rect x="0" y="7.5" width="16" height="2" rx="0" fill="rgba(0,0,0,0.08)"/>
  <circle cx="4.5" cy="14" r="2.2" fill="#1e293b"/>
  <circle cx="4.5" cy="14" r="0.95" fill="#94a3b8"/>
  <circle cx="13" cy="14" r="2.2" fill="#1e293b"/>
  <circle cx="13" cy="14" r="0.95" fill="#94a3b8"/>
</svg>`;

function makeBusIconHtml(live: boolean): string {
  const bg = live ? "#D97706" : "#94a3b8";
  if (live) {
    return `<div style="position:relative;width:52px;height:52px;pointer-events:auto;">
      <div style="position:absolute;top:50%;left:50%;width:52px;height:52px;border-radius:50%;background:rgba(34,197,94,0.10);border:1.5px solid rgba(34,197,94,0.30);transform:translate(-50%,-50%);animation:gps-ripple-out 2.4s ease-out infinite;"></div>
      <div style="position:absolute;top:50%;left:50%;width:36px;height:36px;border-radius:50%;background:rgba(34,197,94,0.16);border:1.5px solid rgba(34,197,94,0.45);transform:translate(-50%,-50%);animation:gps-ripple-out 2.4s ease-out infinite 0.7s;"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:10px;background:${bg};border:2.5px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.45);">${BASE_BUS_SVG}</div>
      <div style="position:absolute;top:3px;right:3px;width:10px;height:10px;background:#22c55e;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>
    </div>`;
  }
  return `<div style="position:relative;width:38px;height:38px;pointer-events:auto;">
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:10px;background:${bg};border:2.5px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.30);">${BASE_BUS_SVG}</div>
  </div>`;
}

function injectStyles() {
  if (document.getElementById("bus-map-styles")) return;
  const s = document.createElement("style");
  s.id = "bus-map-styles";
  s.textContent = `
    @keyframes gps-ripple-out {
      0%   { opacity: 0.9; transform: translate(-50%,-50%) scale(0.45); }
      100% { opacity: 0;   transform: translate(-50%,-50%) scale(1.9);  }
    }
    @keyframes pulse-gps { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
    .leaflet-stop-tooltip {
      background: rgba(15,23,42,0.90) !important;
      color: #f8fafc !important;
      border: none !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      padding: 3px 8px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
    }
    .leaflet-stop-tooltip::before { display:none !important; }
    .leaflet-attribution-flag { display:none !important; }
  `;
  document.head.appendChild(s);
}

export default function BusMap({ route, busLat, busLng, isLive = false, showMyLocation = true }: BusMapProps) {
  const mapRef    = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<unknown>(null);
  const markerRef  = useRef<unknown>(null);
  const userMarkRef = useRef<unknown>(null);
  const completedLineRef = useRef<unknown>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const stopMarkersRef = useRef<unknown[]>([]);

  // ── Build map once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    const center = route.length > 0
      ? route[Math.floor(route.length / 2)]
      : { lat: busLat, lng: busLng };

    import("leaflet").then((L) => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      injectStyles();

      if (leafletRef.current) return;

      const map = L.map(mapRef.current!, {
        center: [center.lat, center.lng],
        zoom: 14,
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

      // Route polyline
      if (route.length >= 2) {
        const allCoords = route.map((p) => [p.lat, p.lng] as [number, number]);
        L.polyline(allCoords, { color: "#cbd5e1", weight: 5, opacity: 0.55 }).addTo(map);

        const compLine = L.polyline([], { color: "#D97706", weight: 5, opacity: 0.9 }).addTo(map);
        completedLineRef.current = compLine;

        stopMarkersRef.current = route.map((stop, idx) => {
          const isSchool = idx === route.length - 1;
          const icon = L.divIcon({
            html: isSchool
              ? `<div style="background:#10b981;border:3px solid white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.35);">🏫</div>`
              : `<div style="background:white;border:3px solid #D97706;border-radius:50%;width:12px;height:12px;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>`,
            className: "",
            iconSize: isSchool ? [26, 26] : [12, 12],
            iconAnchor: isSchool ? [13, 13] : [6, 6],
          });
          const m = L.marker([stop.lat, stop.lng], { icon });
          m.addTo(map);
          m.bindTooltip(stop.name, {
            permanent: false,
            direction: idx < route.length / 2 ? "right" : "left",
            className: "leaflet-stop-tooltip",
          });
          return m;
        });
      }

      // Bus marker — SVG vector icon
      const busIcon = L.divIcon({
        html: makeBusIconHtml(isLive),
        className: "",
        iconSize: isLive ? [52, 52] : [38, 38],
        iconAnchor: isLive ? [26, 26] : [19, 19],
      });
      const busMarker = L.marker([busLat, busLng], { icon: busIcon, zIndexOffset: 1000 }).addTo(map);
      busMarker.bindTooltip(isLive ? "🟢 Bus is LIVE" : "Bus (offline)", {
        permanent: false,
        direction: "top",
        className: "leaflet-stop-tooltip",
      });

      leafletRef.current = map;
      markerRef.current  = busMarker;
      currentPosRef.current = { lat: busLat, lng: busLng };
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (leafletRef.current) {
        (leafletRef.current as { remove: () => void }).remove();
        leafletRef.current = null;
        markerRef.current  = null;
        userMarkRef.current = null;
        completedLineRef.current = null;
        currentPosRef.current = null;
        stopMarkersRef.current = [];
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Smooth marker animation whenever GPS updates ──────────────────────────
  useEffect(() => {
    if (!markerRef.current || !leafletRef.current) return;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const from = currentPosRef.current ?? { lat: busLat, lng: busLng };
    const to   = { lat: busLat, lng: busLng };
    const startTime = performance.now();
    const DURATION  = 2000;

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function tick(now: number) {
      const raw = Math.min((now - startTime) / DURATION, 1);
      const t   = easeInOut(raw);
      const lat = lerp(from.lat, to.lat, t);
      const lng = lerp(from.lng, to.lng, t);

      (markerRef.current as { setLatLng: (p: [number, number]) => void }).setLatLng([lat, lng]);

      if (raw < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        currentPosRef.current = { lat: to.lat, lng: to.lng };
        (leafletRef.current as { panTo: (p: [number, number], o: object) => void })
          .panTo([to.lat, to.lng], { animate: true, duration: 0.9 });
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [busLat, busLng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Swap icon when live state changes ─────────────────────────────────────
  useEffect(() => {
    if (!markerRef.current) return;
    import("leaflet").then((L) => {
      const newIcon = L.divIcon({
        html: makeBusIconHtml(isLive),
        className: "",
        iconSize: isLive ? [52, 52] : [38, 38],
        iconAnchor: isLive ? [26, 26] : [19, 19],
      });
      (markerRef.current as { setIcon: (i: unknown) => void; bindTooltip: (t: string, o: object) => void })
        .setIcon(newIcon);
    });
  }, [isLive]);

  // ── My Location button ─────────────────────────────────────────────────────
  function locateMe() {
    if (!("geolocation" in navigator) || !leafletRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        import("leaflet").then((L) => {
          type LMap = { flyTo: (p: [number, number], z: number, o: object) => void; getZoom: () => number };
          const lMap = leafletRef.current as LMap | null;
          if (!lMap) return;

          const userIcon = L.divIcon({
            html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.25),0 2px 8px rgba(0,0,0,0.30);"></div>`,
            className: "",
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });

          if (userMarkRef.current) {
            (userMarkRef.current as { setLatLng: (p: [number, number]) => void }).setLatLng([lat, lng]);
          } else {
            const m = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 500 });
            (m as unknown as { addTo: (map: unknown) => void }).addTo(leafletRef.current);
            m.bindTooltip("You are here", { permanent: false, direction: "top", className: "leaflet-stop-tooltip" });
            userMarkRef.current = m;
          }

          lMap.flyTo([lat, lng], Math.max(lMap.getZoom(), 15), { animate: true, duration: 1.2 });
        });
      },
      () => {/* permission denied or unavailable — silent */},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  function zoomIn()  { (leafletRef.current as { zoomIn:  () => void } | null)?.zoomIn();  }
  function zoomOut() { (leafletRef.current as { zoomOut: () => void } | null)?.zoomOut(); }

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* LIVE badge */}
      {isLive && (
        <div className="absolute top-2 left-2 z-[1000] flex items-center gap-1.5 rounded-full bg-green-600/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-md backdrop-blur-sm pointer-events-none">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          GPS LIVE
        </div>
      )}

      {/* My Location button */}
      {showMyLocation && (
        <button
          onClick={(e) => { e.stopPropagation(); locateMe(); }}
          title="Show my location"
          className="absolute bottom-14 right-3 z-[1000] flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Crosshair size={15} strokeWidth={2.2} />
        </button>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); zoomIn(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors"
        >+</button>
        <button
          onClick={(e) => { e.stopPropagation(); zoomOut(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors"
        >−</button>
      </div>
    </div>
  );
}
