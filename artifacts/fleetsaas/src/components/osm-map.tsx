/**
 * OsmMap — Master Free Map Engine (Leaflet.js + OpenStreetMap)
 *
 * mode="tracking" — Single bus live tracking with ripple, route dots, My Location
 * mode="fleet"    — Multi-bus admin view with live GPS streaming and LatLngBounds auto-fit
 * mode="build"    — Route builder: numbered stop markers, dashed polyline, Nominatim search
 *
 * 100% free — no API keys. OSM tiles + Nominatim for search.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from "react";
import { Crosshair, Maximize2, Minimize2, Scan, Search, RefreshCw, MapPin, X, Lock } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const KTM  = { lat: 27.7172, lng: 85.324 };

// ── Public types ──────────────────────────────────────────────────────────────

export interface FleetBus {
  id: number;
  label: string;
  driverName?: string;
  lat: number;
  lng: number;
  status: "on-route" | "depot" | string;
  speed?: number;
}

export interface RouteStop {
  id: number | string;
  name: string;
  lat: number;
  lng: number;
}

export interface RouteWaypoint {
  lat: number;
  lng: number;
  name: string;
}

export interface OsmMapProps {
  mode: "tracking" | "fleet" | "build";
  height?: number;

  // ── tracking ────────────────────────────────────────────────────────────────
  /** Current bus latitude */
  lat?: number;
  /** Current bus longitude */
  lng?: number;
  /** Whether the driver is actively streaming GPS */
  isLive?: boolean;
  /** Static route station dots drawn beneath the bus marker */
  route?: RouteWaypoint[];
  /** Show the "My Location" crosshair button (default: true in tracking mode) */
  showMyLocation?: boolean;

  // ── fleet ───────────────────────────────────────────────────────────────────
  /** All fleet vehicles to render */
  buses?: FleetBus[];
  /** Live GPS lat from SSE (applied only to liveBusId marker) */
  liveLat?: number;
  /** Live GPS lng from SSE */
  liveLng?: number;
  /** Whether the live stream is active */
  liveIsLive?: boolean;
  /** Which bus in `buses` receives the SSE coordinates */
  liveBusId?: number;

  // ── build ───────────────────────────────────────────────────────────────────
  /** Ordered list of route stops to render as numbered markers */
  stops?: RouteStop[];
  /** Called when user clicks the map or picks a Nominatim result */
  onMapClick?: (lat: number, lng: number, name?: string) => void;
  /** true = read-only: no click, no search, static route + labels shown */
  viewMode?: boolean;
  /** 0-based index of the stop to highlight in amber */
  activeStopIndex?: number;
}

// ── CSS injection (once per page) ─────────────────────────────────────────────

function injectOsmStyles() {
  if (document.getElementById("osm-map-styles")) return;
  const s = document.createElement("style");
  s.id = "osm-map-styles";
  s.textContent = `
    @keyframes osm-ripple {
      0%   { opacity: 0.80; transform: translate(-50%, -50%) scale(0.30); }
      100% { opacity: 0;    transform: translate(-50%, -50%) scale(2.10); }
    }
    .osm-tip {
      background: rgba(15,23,42,0.90) !important;
      color: #f1f5f9 !important;
      border: none !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      padding: 3px 9px !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4) !important;
      white-space: nowrap !important;
    }
    .osm-tip::before { display: none !important; }
  `;
  document.head.appendChild(s);
}

function ensureLeafletCss() {
  if (document.querySelector('link[href*="leaflet"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

// ── SVG Bus body (shared by tracking + fleet markers) ─────────────────────────

const BUS_SVG = `<svg width="20" height="14" viewBox="0 0 22 15" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="0.5" width="16" height="9" rx="2" fill="white"/>
  <rect x="2.5" y="1.8" width="4"   height="3" rx="0.8" fill="#93C5FD"/>
  <rect x="8"   y="1.8" width="4"   height="3" rx="0.8" fill="#93C5FD"/>
  <rect x="13.5" y="1.8" width="2"  height="3" rx="0.6" fill="#FDE68A"/>
  <rect x="17"  y="0.5" width="4"   height="9" rx="1.5" fill="#FDE68A" opacity="0.85"/>
  <circle cx="4.5"  cy="13" r="2"   fill="#1e293b"/>
  <circle cx="4.5"  cy="13" r="0.9" fill="#94a3b8"/>
  <circle cx="12.5" cy="13" r="2"   fill="#1e293b"/>
  <circle cx="12.5" cy="13" r="0.9" fill="#94a3b8"/>
</svg>`;

// ── Marker HTML generators ────────────────────────────────────────────────────

function busMarkerHtml(status: string, live: boolean, label?: string): string {
  const bg = live ? "#D97706" : status === "on-route" ? "#16a34a" : "#64748b";
  const ripple = live ? `
    <div style="position:absolute;top:50%;left:50%;width:52px;height:52px;border-radius:50%;
         background:rgba(34,197,94,0.10);border:1.5px solid rgba(34,197,94,0.30);
         animation:osm-ripple 2.4s ease-out infinite;pointer-events:none;z-index:0;"></div>
    <div style="position:absolute;top:50%;left:50%;width:34px;height:34px;border-radius:50%;
         background:rgba(34,197,94,0.16);border:1.5px solid rgba(34,197,94,0.44);
         animation:osm-ripple 2.4s ease-out 0.85s infinite;pointer-events:none;z-index:0;"></div>` : "";
  const liveDot = live
    ? `<div style="position:absolute;top:1px;right:1px;width:9px;height:9px;
           background:#22c55e;border:2px solid white;border-radius:50%;z-index:3;"></div>`
    : "";

  if (label) {
    // Fleet marker (badge + label below)
    return `<div style="position:relative;width:54px;height:60px;display:flex;flex-direction:column;align-items:center;gap:2px;">
      ${ripple}
      <div style="position:relative;width:40px;height:38px;border-radius:9px;background:${bg};border:2.5px solid white;
           display:flex;align-items:center;justify-content:center;
           box-shadow:0 3px 10px rgba(0,0,0,0.40);z-index:1;">
        ${BUS_SVG}${liveDot}
      </div>
      <div style="background:${bg};color:white;border-radius:4px;padding:1px 6px;
           font-size:9px;font-weight:700;white-space:nowrap;
           box-shadow:0 1px 4px rgba(0,0,0,0.30);z-index:1;line-height:1.5;">${label}</div>
    </div>`;
  }

  // Single-bus tracking marker
  return `<div style="position:relative;width:46px;height:46px;display:flex;align-items:center;justify-content:center;">
    ${ripple}
    <div style="position:relative;width:38px;height:38px;border-radius:9px;background:${bg};border:2.5px solid white;
         display:flex;align-items:center;justify-content:center;
         box-shadow:0 3px 10px rgba(0,0,0,0.40);z-index:1;">
      ${BUS_SVG}${liveDot}
    </div>
  </div>`;
}

function stopMarkerHtml(num: number, isFirst: boolean, isLast: boolean, isActive: boolean): string {
  const bg     = isFirst ? "#16a34a" : isLast ? "#dc2626" : isActive ? "#d97706" : "#1e293b";
  const border = isFirst ? "#86efac" : isLast ? "#fca5a5" : isActive ? "#fbbf24" : "#64748b";
  const fs     = num > 9 ? 9 : 12;

  const circle = isLast
    ? `<div style="width:22px;height:22px;border-radius:3px;background:${bg};border:2px solid white;
           box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
         <div style="width:8px;height:8px;border-radius:1px;background:white;"></div>
       </div>`
    : isFirst
    ? `<div style="width:22px;height:22px;border-radius:50%;background:${bg};border:2px solid white;
           box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
         <div style="width:8px;height:8px;border-radius:50%;background:white;"></div>
       </div>`
    : `<div style="width:24px;height:24px;border-radius:50%;background:${bg};border:2px solid ${border};
           box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
         <span style="font-family:system-ui,sans-serif;font-weight:700;font-size:${fs}px;color:white;line-height:1;">${num}</span>
       </div>`;

  return `<div style="display:flex;flex-direction:column;align-items:center;width:28px;height:36px;">
    ${circle}
    <div style="width:2px;flex:1;background:${bg};opacity:0.6;"></div>
  </div>`;
}

// ── Easing helpers ────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function ease(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

// ── Partial Leaflet map type ──────────────────────────────────────────────────

type LMap = {
  panTo:     (c: [number, number], o?: object) => void;
  flyTo:     (c: [number, number], z: number, o?: object) => void;
  setView:   (c: [number, number], z: number) => void;
  getZoom:   () => number;
  zoomIn:    () => void;
  zoomOut:   () => void;
  fitBounds: (b: unknown, o?: object) => void;
  remove:    () => void;
  on:        (ev: string, cb: (e: any) => void) => void;
  off:       (ev: string, cb?: (e: any) => void) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OsmMap({
  mode,
  height = 340,
  // tracking
  lat, lng, isLive = false, route = [], showMyLocation = true,
  // fleet
  buses = [], liveLat, liveLng, liveIsLive = false, liveBusId,
  // build
  stops = [], onMapClick, viewMode = false, activeStopIndex,
}: OsmMapProps) {
  const mapDivRef    = useRef<HTMLDivElement>(null);
  const leafletRef   = useRef<unknown>(null);

  // tracking refs
  const busMarkRef     = useRef<unknown>(null);
  const userMarkRef    = useRef<unknown>(null);
  const routeDotsRef   = useRef<unknown[]>([]);
  const animRef        = useRef<number | null>(null);
  const trackPosRef    = useRef<{ lat: number; lng: number } | null>(null);

  // fleet refs
  const fleetMarkersRef = useRef<Map<number, unknown>>(new Map());
  const fleetAnimRef    = useRef<number | null>(null);
  const fleetPosRef     = useRef<{ lat: number; lng: number } | null>(null);

  // build refs
  const stopMarkersRef = useRef<unknown[]>([]);
  const polylineRef    = useRef<unknown>(null);
  const clickCbRef     = useRef<((e: any) => void) | null>(null);
  const pendingPinRef  = useRef<unknown>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-current ref for onMapClick (avoids stale closure in Leaflet event)
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // search state (build mode)
  const [query, setQuery]             = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ lat: number; lng: number; name: string }>>([]);
  const [searching, setSearching]     = useState(false);
  const [showDrop, setShowDrop]       = useState(false);
  const [srchIdx, setSrchIdx]         = useState(-1);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [isFullscreen, setIsFullscreen]     = useState(false);

  // ── 1. Init map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || leafletRef.current) return;
    ensureLeafletCss();
    injectOsmStyles();

    import("leaflet").then((L) => {
      if (leafletRef.current) return;

      const initCenter: [number, number] =
        mode === "tracking" && lat != null && lng != null ? [lat, lng]
        : mode === "fleet"  && buses.length > 0           ? [buses[Math.floor(buses.length / 2)].lat, buses[Math.floor(buses.length / 2)].lng]
        : mode === "build"  && stops.length > 0           ? [stops[0].lat, stops[0].lng]
        : [KTM.lat, KTM.lng];

      const map = L.map(mapDivRef.current!, {
        center: initCenter,
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: mode !== "tracking",
        doubleClickZoom: false,
        touchZoom: true,
      });

      // CartoDB Positron — clean, clear street tiles, no key required
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: "© OpenStreetMap contributors © CARTO",
      }).addTo(map);

      leafletRef.current = map;

      // ── Mode-specific init ───────────────────────────────────────────────
      if (mode === "tracking") {
        if (lat != null && lng != null) _initBusMarker(L, map, lat, lng);
        _syncRouteWaypoints(L, map, route);
      }

      if (mode === "fleet") {
        _initFleetMarkers(L, map, buses, liveBusId, liveIsLive);
        _fitFleetBounds(L, map, buses);
      }

      if (mode === "build") {
        _syncBuildStops(L, map, stops, activeStopIndex);
        if (!viewMode) {
          const cb = (e: any) => {
            const { lat: clat, lng: clng } = e.latlng;
            setQuery(""); setSuggestions([]); setShowDrop(false);
            _showPendingPin(L, map, clat, clng);
            setReverseLoading(true);
            fetch(`${BASE}/api/geocode/reverse?lat=${clat}&lng=${clng}`)
              .then((r) => r.ok ? r.json() as Promise<{ name: string }> : Promise.resolve(null))
              .then((data) => {
                _clearPendingPin();
                setReverseLoading(false);
                onMapClickRef.current?.(clat, clng, data?.name ?? undefined);
              })
              .catch(() => {
                _clearPendingPin();
                setReverseLoading(false);
                onMapClickRef.current?.(clat, clng);
              });
          };
          clickCbRef.current = cb;
          map.on("click", cb);
        }
      }
    });

    return () => {
      if (animRef.current)      cancelAnimationFrame(animRef.current);
      if (fleetAnimRef.current) cancelAnimationFrame(fleetAnimRef.current);
      if (debounceRef.current)  clearTimeout(debounceRef.current);
      const map = leafletRef.current as LMap | null;
      if (map) {
        if (clickCbRef.current) map.off("click", clickCbRef.current);
        map.remove();
      }
      leafletRef.current = null;
      busMarkRef.current = null;
      userMarkRef.current = null;
      routeDotsRef.current = [];
      fleetMarkersRef.current.clear();
      stopMarkersRef.current = [];
      polylineRef.current = null;
      clickCbRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2a. Tracking: smooth-animate bus on GPS update ────────────────────────
  useEffect(() => {
    if (mode !== "tracking" || lat == null || lng == null) return;
    import("leaflet").then((L) => {
      const map = leafletRef.current as LMap | null;
      if (!map) return;

      if (!busMarkRef.current) {
        _initBusMarker(L, map as any, lat, lng);
        return;
      }

      if (animRef.current) cancelAnimationFrame(animRef.current);
      const from = trackPosRef.current ?? { lat, lng };
      const to   = { lat, lng };
      const t0   = performance.now();
      const DUR  = 2200;

      function tick(now: number) {
        const raw = Math.min((now - t0) / DUR, 1);
        const t   = ease(raw);
        (busMarkRef.current as any).setLatLng([lerp(from.lat, to.lat, t), lerp(from.lng, to.lng, t)]);
        if (raw < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          trackPosRef.current = to;
          (leafletRef.current as LMap | null)?.panTo([to.lat, to.lng], { animate: true, duration: 0.6 });
        }
      }
      animRef.current = requestAnimationFrame(tick);

      // Update icon to reflect live state
      const icon = L.divIcon({
        html: busMarkerHtml("on-route", isLive),
        className: "",
        iconSize: [46, 46],
        iconAnchor: [23, 23],
      });
      (busMarkRef.current as any).setIcon(icon);
    });
  }, [lat, lng, isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2b. Tracking: sync route waypoints when route prop changes ────────────
  useEffect(() => {
    if (mode !== "tracking" || !leafletRef.current) return;
    import("leaflet").then((L) => {
      if (!leafletRef.current) return;
      _syncRouteWaypoints(L, leafletRef.current as any, route);
    });
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Fleet: smooth-animate live bus on SSE update ───────────────────────
  useEffect(() => {
    if (mode !== "fleet" || liveBusId == null || liveLat == null || liveLng == null) return;
    const marker = fleetMarkersRef.current.get(liveBusId);
    if (!marker) return;

    if (fleetAnimRef.current) cancelAnimationFrame(fleetAnimRef.current);
    const from = fleetPosRef.current ?? { lat: liveLat, lng: liveLng };
    const to   = { lat: liveLat, lng: liveLng };
    const t0   = performance.now();
    const DUR  = 2000;

    function tick(now: number) {
      const raw = Math.min((now - t0) / DUR, 1);
      const t   = ease(raw);
      (marker as any).setLatLng([lerp(from.lat, to.lat, t), lerp(from.lng, to.lng, t)]);
      if (raw < 1) fleetAnimRef.current = requestAnimationFrame(tick);
      else fleetPosRef.current = to;
    }
    fleetAnimRef.current = requestAnimationFrame(tick);

    // Update live bus icon
    import("leaflet").then((L) => {
      const bus = buses.find((b) => b.id === liveBusId);
      if (!bus) return;
      const icon = L.divIcon({
        html: busMarkerHtml(bus.status, liveIsLive, bus.label),
        className: "",
        iconSize: [54, 60],
        iconAnchor: [27, 20],
      });
      (marker as any).setIcon(icon);
    });
  }, [liveLat, liveLng, liveIsLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Build: sync stops → markers + polyline + bounds ───────────────────
  useEffect(() => {
    if (mode !== "build" || !leafletRef.current) return;
    import("leaflet").then((L) => {
      if (!leafletRef.current) return;
      _syncBuildStops(L, leafletRef.current as any, stops, activeStopIndex);
    });
  }, [stops, activeStopIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _initBusMarker(L: any, map: any, la: number, ln: number) {
    const icon = L.divIcon({
      html: busMarkerHtml("on-route", isLive),
      className: "",
      iconSize: [46, 46],
      iconAnchor: [23, 23],
    });
    const m = L.marker([la, ln], { icon, zIndexOffset: 1000 });
    (m as any).addTo(map);
    m.bindTooltip("Your Bus", { permanent: false, direction: "top", className: "osm-tip" });
    busMarkRef.current = m;
    trackPosRef.current = { lat: la, lng: ln };
    map.setView([la, ln], 15);
  }

  function _syncRouteWaypoints(L: any, map: any, wps: RouteWaypoint[]) {
    routeDotsRef.current.forEach((m) => (m as any).remove());
    routeDotsRef.current = [];
    wps.forEach((wp) => {
      const icon = L.divIcon({
        html: `<div style="width:10px;height:10px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>`,
        className: "",
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
      const m = L.marker([wp.lat, wp.lng], { icon, zIndexOffset: 0 });
      (m as any).addTo(map);
      m.bindTooltip(wp.name, { permanent: false, direction: "top", className: "osm-tip" });
      routeDotsRef.current.push(m);
    });
  }

  function _initFleetMarkers(L: any, map: any, fleetBuses: FleetBus[], liveId?: number, live?: boolean) {
    fleetMarkersRef.current.clear();
    fleetBuses.forEach((bus) => {
      const isLiveBus = bus.id === liveId && live;
      const icon = L.divIcon({
        html: busMarkerHtml(bus.status, !!isLiveBus, bus.label),
        className: "",
        iconSize: isLiveBus ? [54, 60] : [42, 48],
        iconAnchor: isLiveBus ? [27, 20] : [21, 16],
      });
      const marker = L.marker([bus.lat, bus.lng], { icon, zIndexOffset: bus.id === liveId ? 1000 : 0 });
      (marker as any).addTo(map);
      marker.bindTooltip(
        `<b>${bus.label}</b><br>${bus.driverName ?? "Driver"} · ${bus.status === "on-route" ? "🟢 On Route" : "⬛ At Depot"}${bus.speed != null ? `<br>${bus.speed} km/h` : ""}`,
        { permanent: false, direction: "top", className: "osm-tip" }
      );
      fleetMarkersRef.current.set(bus.id, marker);
    });
  }

  function _fitFleetBounds(L: any, map: any, fleetBuses: FleetBus[]) {
    if (fleetBuses.length === 0) return;
    if (fleetBuses.length === 1) { map.setView([fleetBuses[0].lat, fleetBuses[0].lng], 15); return; }
    const bounds = L.latLngBounds(fleetBuses.map((b) => [b.lat, b.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.28), { animate: false, maxZoom: 16 });
  }

  function _syncBuildStops(L: any, map: any, bldStops: RouteStop[], activIdx?: number) {
    // Remove old markers + polyline
    stopMarkersRef.current.forEach((m) => (m as any).remove());
    stopMarkersRef.current = [];
    if (polylineRef.current) { (polylineRef.current as any).remove(); polylineRef.current = null; }

    bldStops.forEach((stop, idx) => {
      const isFirst  = idx === 0;
      const isLast   = idx === bldStops.length - 1 && bldStops.length > 1;
      const isActive = idx === activIdx;
      const icon = L.divIcon({
        html: stopMarkerHtml(idx + 1, isFirst, isLast, isActive),
        className: "",
        iconSize: [28, 36],
        iconAnchor: [14, 36],
      });
      const m = L.marker([stop.lat, stop.lng], { icon, zIndexOffset: isActive ? 500 : 100 });
      (m as any).addTo(map);
      m.bindTooltip(stop.name, { permanent: false, direction: "right", className: "osm-tip" });
      stopMarkersRef.current.push(m);
    });

    // Dashed polyline connecting all stops
    if (bldStops.length >= 2) {
      const poly = L.polyline(
        bldStops.map((s) => [s.lat, s.lng] as [number, number]),
        { color: "#f59e0b", weight: 2.5, opacity: 0.85, dashArray: "10 7", lineCap: "round", lineJoin: "round" }
      );
      (poly as any).addTo(map);
      polylineRef.current = poly;
    }

    // Do NOT auto-fit — let the user stay at their chosen zoom level.
    // Use the "Fit all" button (top-right) to fit bounds on demand.
  }

  // ── Pending pin (build mode — shown while reverse geocoding) ─────────────
  function _showPendingPin(L: any, map: any, la: number, ln: number) {
    if (pendingPinRef.current) (pendingPinRef.current as any).remove();

    // Draggable icon — move-arrows inside amber circle signals "drag to reposition"
    const icon = L.divIcon({
      html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:grab;">
        <div style="width:30px;height:30px;border-radius:50%;background:#f59e0b;border:3px solid white;
             box-shadow:0 2px 14px rgba(245,158,11,0.65);display:flex;align-items:center;justify-content:center;
             animation:osm-ripple 1.2s ease-out infinite;">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
            <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
            <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
          </svg>
        </div>
        <div style="width:2px;height:10px;background:#f59e0b;opacity:0.75;"></div>
      </div>`,
      className: "",
      iconSize: [30, 42],
      iconAnchor: [15, 42],
    });

    const pin = L.marker([la, ln], { icon, zIndexOffset: 2000, interactive: true, draggable: true });
    (pin as any).addTo(map);

    // On drag-end: re-reverse-geocode the new position and bubble it up
    (pin as any).on("dragend", () => {
      const { lat: newLat, lng: newLng } = (pin as any).getLatLng();
      setReverseLoading(true);
      fetch(`${BASE}/api/geocode/reverse?lat=${newLat}&lng=${newLng}`)
        .then((r) => r.ok ? r.json() as Promise<{ name: string }> : Promise.resolve(null))
        .then((data) => {
          setReverseLoading(false);
          onMapClickRef.current?.(newLat, newLng, data?.name ?? undefined);
        })
        .catch(() => {
          setReverseLoading(false);
          onMapClickRef.current?.(newLat, newLng);
        });
    });

    pendingPinRef.current = pin;
  }

  function _clearPendingPin() {
    if (pendingPinRef.current) {
      (pendingPinRef.current as any).remove();
      pendingPinRef.current = null;
    }
  }

  // ── My Location (tracking mode) ───────────────────────────────────────────
  function locateMe() {
    if (!("geolocation" in navigator) || !leafletRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const ln = pos.coords.longitude;
        import("leaflet").then((L) => {
          const map = leafletRef.current as LMap | null;
          if (!map) return;
          const icon = L.divIcon({
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.25),0 2px 8px rgba(0,0,0,0.30);"></div>`,
            className: "",
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          if (userMarkRef.current) {
            (userMarkRef.current as any).setLatLng([la, ln]);
          } else {
            const m = L.marker([la, ln], { icon, zIndexOffset: 500 });
            (m as any).addTo(leafletRef.current);
            m.bindTooltip("You are here", { permanent: false, direction: "top", className: "osm-tip" });
            userMarkRef.current = m;
          }
          map.flyTo([la, ln], Math.max(map.getZoom(), 15), { animate: true, duration: 1.2 });
        });
      },
      () => { /* permission denied — silent */ },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  // ── Zoom / fit ────────────────────────────────────────────────────────────
  function zoomIn()  { (leafletRef.current as LMap | null)?.zoomIn(); }
  function zoomOut() { (leafletRef.current as LMap | null)?.zoomOut(); }

  // ── Same-page fullscreen (Fullscreen API) ─────────────────────────────────
  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function openFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
  }

  function fitAll() {
    if (!leafletRef.current) return;
    import("leaflet").then((L) => {
      if (!leafletRef.current) return;
      const map = leafletRef.current as LMap;

      if (mode === "fleet" && buses.length >= 2) {
        const pts = buses.map((b) =>
          b.id === liveBusId && fleetPosRef.current
            ? [fleetPosRef.current.lat, fleetPosRef.current.lng] as [number, number]
            : [b.lat, b.lng] as [number, number]
        );
        const bounds = L.latLngBounds(pts);
        if (bounds.isValid()) map.fitBounds(bounds, { animate: true, padding: [40, 40], maxZoom: 16 } as any);
      }

      if (mode === "build" && stops.length >= 2) {
        const bounds = L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number]));
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true } as any);
      }
    });
  }

  // ── Nominatim search (build mode) ─────────────────────────────────────────
  const fetchNominatim = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setShowDrop(false); return; }
    setSearching(true); setShowDrop(true); setSrchIdx(-1);
    try {
      const res = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("geocode error");
      const data = await res.json() as Array<{ displayName: string; lat: number; lng: number }>;
      setSuggestions(data.map((d) => ({
        lat: d.lat,
        lng: d.lng,
        name: d.displayName.split(",")[0]?.trim() ?? d.displayName,
      })));
    } catch { setSuggestions([]); }
    finally { setSearching(false); }
  }, []);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (!val.trim()) { setSuggestions([]); setShowDrop(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchNominatim(val), 300);
  }

  function handleSearchKey(e: React.KeyboardEvent) {
    if (!showDrop || suggestions.length === 0) return;
    if (e.key === "ArrowDown")  { e.preventDefault(); setSrchIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setSrchIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && srchIdx >= 0) { e.preventDefault(); pickSuggestion(suggestions[srchIdx]); }
    else if (e.key === "Escape") { setShowDrop(false); setSrchIdx(-1); }
  }

  function pickSuggestion(s: { lat: number; lng: number; name: string }) {
    setShowDrop(false); setSrchIdx(-1);
    const map = leafletRef.current as LMap | null;
    if (map) map.flyTo([s.lat, s.lng], 16, { animate: true, duration: 0.9 });
    if (onMapClick) {
      onMapClick(s.lat, s.lng, s.name);
      setQuery(""); setSuggestions([]);
    } else {
      setQuery(s.name);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isTrack = mode === "tracking";
  const isFleet = mode === "fleet";
  const isBuild = mode === "build";

  return (
    <div ref={containerRef} className="relative w-full bg-white" style={{ height, overflow: "clip" }}>

      {/* Map canvas */}
      <div ref={mapDivRef} className="absolute inset-0" />

      {/* ── Build: Nominatim search overlay ── */}
      {isBuild && !viewMode && (
        <div className="absolute top-2 left-2 right-14 z-[1001]">
          <div className="relative">
            <div className="flex items-center relative">
              {searching
                ? <RefreshCw size={12} className="absolute left-3 text-amber-500 animate-spin pointer-events-none" />
                : <Search    size={12} className="absolute left-3 text-slate-500 pointer-events-none" />
              }
              <input
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleSearchKey}
                onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 160)}
                placeholder="Search Nepal — Koteshwor, Bhaktapur, Kirtipur…"
                autoComplete="off"
                className="w-full rounded-xl border border-border bg-white/96 dark:bg-slate-900/96 shadow-lg pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 backdrop-blur-sm transition-colors"
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setSuggestions([]); setShowDrop(false); }}
                  className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {showDrop && (
              <div className="absolute left-0 right-0 top-[calc(100%+2px)] z-50 rounded-xl border border-border bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                {searching ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <RefreshCw size={11} className="animate-spin text-amber-500" />
                    Searching Nominatim (Nepal)…
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No results — try a different name</p>
                ) : (
                  <ul className="max-h-48 overflow-y-auto divide-y divide-border/50">
                    {suggestions.map((s, i) => (
                      <li key={`${s.lat}-${s.lng}-${i}`}>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                            i === srchIdx ? "bg-amber-50 dark:bg-amber-950/30" : "hover:bg-muted/60"
                          }`}
                        >
                          <MapPin size={12} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs font-semibold text-foreground leading-tight line-clamp-1">{s.name}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Build: view-only badge ── */}
      {isBuild && viewMode && (
        <div className="absolute top-2 left-2 z-[1001] flex items-center gap-1.5 rounded-full bg-slate-800/80 border border-slate-600 px-2.5 py-1 text-[10px] font-semibold text-slate-300 backdrop-blur-sm pointer-events-none">
          <Lock size={9} /> View Only
        </div>
      )}

      {/* ── Tracking: waiting for GPS ── */}
      {isTrack && lat == null && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
          <div className="rounded-xl bg-white/85 dark:bg-slate-900/85 border border-border shadow-md px-4 py-3 text-center backdrop-blur-sm">
            <p className="text-xs font-semibold text-muted-foreground">Waiting for GPS signal…</p>
          </div>
        </div>
      )}

      {/* ── GPS LIVE badge ── */}
      {((isTrack && isLive) || (isFleet && liveIsLive)) && (
        <div className="absolute top-2 left-2 z-[1001] flex items-center gap-1.5 rounded-full bg-green-600/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-md backdrop-blur-sm pointer-events-none">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          GPS LIVE
        </div>
      )}

      {/* ── Build: reverse geocoding loading badge ── */}
      {isBuild && reverseLoading && (
        <div className="absolute top-12 left-2 right-14 z-[1002] flex items-center gap-2 rounded-xl bg-amber-500/95 border border-amber-400 px-3 py-2 shadow-lg backdrop-blur-sm pointer-events-none">
          <RefreshCw size={11} className="animate-spin text-white shrink-0" />
          <span className="text-xs font-semibold text-white">Looking up location name…</span>
        </div>
      )}

      {/* ── Build: click-to-add hint ── */}
      {isBuild && !viewMode && !reverseLoading && stops.length === 0 && (
        <div className="absolute bottom-14 left-2 right-2 z-[1001] flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-800/80 border border-slate-600 px-3 py-1.5 text-[10px] font-semibold text-slate-200 backdrop-blur-sm shadow-md">
            <MapPin size={10} className="text-amber-400" />
            Click anywhere on the map to add a stop
          </div>
        </div>
      )}

      {/* ── Build: stop count badge ── */}
      {isBuild && stops.length > 0 && (
        <div className="absolute bottom-14 left-2 z-[1001] flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-slate-800/90 border border-border px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur-sm pointer-events-none">
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          {stops.length} stop{stops.length !== 1 ? "s" : ""}
          {stops.length >= 2 && <span className="text-muted-foreground ml-0.5">· route</span>}
        </div>
      )}

      {/* ── Legend ── */}
      {(isFleet || (isBuild && stops.length >= 2)) && (
        <div className="absolute bottom-2 left-2 z-[1001] flex flex-col gap-1 pointer-events-none">
          {isFleet && (
            <>
              <LegendPill color="#D97706" label="GPS Live" />
              <LegendPill color="#16a34a" label="On Route" />
              <LegendPill color="#64748b" label="At Depot" />
            </>
          )}
          {isBuild && stops.length >= 2 && (
            <>
              <LegendPill color="#16a34a" label="Start" />
              <LegendPill color="#dc2626" label="End" />
              <LegendPill color="#1e293b" label="Via" />
            </>
          )}
        </div>
      )}

      {/* ── Top-right: fit-all + open-in-new-tab ── */}
      <div className="absolute top-2 right-2 z-[1001] flex flex-col gap-1">
        {(isFleet || isBuild) && (
          <button
            onClick={(e) => { e.stopPropagation(); fitAll(); }}
            title="Fit all stops in view"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground hover:bg-muted transition-colors"
          >
            <Scan size={13} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); openFullscreen(); }}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground hover:bg-muted transition-colors"
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      {/* ── Bottom-right: My Location + zoom ── */}
      <div className="absolute bottom-2 right-2 z-[1001] flex flex-col gap-1">
        {isTrack && showMyLocation && (
          <button
            onClick={(e) => { e.stopPropagation(); locateMe(); }}
            title="My location"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground hover:bg-muted transition-colors mb-0.5"
          >
            <Crosshair size={13} />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); zoomIn(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors">
          +
        </button>
        <button onClick={(e) => { e.stopPropagation(); zoomOut(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors">
          −
        </button>
      </div>

      {/* OSM attribution (required) */}
      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 z-[1000] text-[7px] text-slate-400/50 pointer-events-none select-none">
        © OpenStreetMap contributors
      </div>
    </div>
  );
}

function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-border px-2 py-1 shadow-sm backdrop-blur-sm">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[9px] font-semibold text-foreground">{label}</span>
    </div>
  );
}
