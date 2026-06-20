import { useEffect, useRef } from "react";

export interface RouteStop {
  lat: number;
  lng: number;
  name: string;
  eta: number;
}

interface BusMapProps {
  route: RouteStop[];
  posIdx: number;
}

export default function BusMap({ route, posIdx }: BusMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const completedLineRef = useRef<unknown>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const stopMarkersRef = useRef<unknown[]>([]);

  useEffect(() => {
    if (!mapRef.current || route.length === 0) return;

    import("leaflet").then((L) => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (leafletRef.current) return;

      const start = route[0];
      const map = L.map(mapRef.current!, {
        center: [start.lat, start.lng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: true,
      });

      // CartoDB Voyager — clean Google Maps-like style, free, no API key
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, subdomains: "abcd" }
      ).addTo(map);

      // Full route polyline (grey base)
      const allCoords = route.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(allCoords, { color: "#cbd5e1", weight: 5, opacity: 0.6 }).addTo(map);

      // Completed portion (amber) — will be replaced on update
      const compLine = L.polyline([], { color: "#D97706", weight: 5, opacity: 0.9 }).addTo(map);
      completedLineRef.current = compLine;

      // Stop circles
      stopMarkersRef.current = route.map((stop, idx) => {
        const isSchool = idx === route.length - 1;
        const icon = L.divIcon({
          html: isSchool
            ? `<div style="background:#10b981;border:3px solid white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.35);">🏫</div>`
            : `<div style="background:white;border:3px solid #D97706;border-radius:50%;width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>`,
          className: "",
          iconSize: isSchool ? [24, 24] : [14, 14],
          iconAnchor: isSchool ? [12, 12] : [7, 7],
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

      // Bus icon
      const busIcon = L.divIcon({
        html: `<div style="background:#D97706;border:3px solid white;border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 10px rgba(0,0,0,0.5);">🚌</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const busMarker = L.marker([start.lat, start.lng], { icon: busIcon, zIndexOffset: 1000 }).addTo(map);

      leafletRef.current = map;
      markerRef.current = busMarker;
      currentPosRef.current = { lat: start.lat, lng: start.lng };

      // Inject tooltip style
      const style = document.createElement("style");
      style.textContent = `.leaflet-stop-tooltip { background: rgba(15,23,42,0.9); color: #f8fafc; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; padding: 3px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
      .leaflet-stop-tooltip::before { display:none; }`;
      document.head.appendChild(style);
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (leafletRef.current) {
        (leafletRef.current as { remove: () => void }).remove();
        leafletRef.current = null;
        markerRef.current = null;
        completedLineRef.current = null;
        currentPosRef.current = null;
        stopMarkersRef.current = [];
      }
    };
  }, []);

  // Smooth animation whenever posIdx changes
  useEffect(() => {
    if (!markerRef.current || !leafletRef.current || route.length === 0) return;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const safeIdx = Math.min(posIdx, route.length - 1);
    const from = currentPosRef.current ?? route[0];
    const to = route[safeIdx];
    const startTime = performance.now();
    const DURATION = 3600;

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function tick(now: number) {
      const raw = Math.min((now - startTime) / DURATION, 1);
      const t = easeInOut(raw);
      const lat = lerp(from.lat, to.lat, t);
      const lng = lerp(from.lng, to.lng, t);

      const marker = markerRef.current as { setLatLng: (p: [number, number]) => void };
      marker.setLatLng([lat, lng]);

      // Update completed polyline
      const compLine = completedLineRef.current as { setLatLngs: (pts: [number, number][]) => void } | null;
      if (compLine) {
        const doneCoords: [number, number][] = route
          .slice(0, safeIdx)
          .map((p) => [p.lat, p.lng]);
        doneCoords.push([lat, lng]);
        compLine.setLatLngs(doneCoords);
      }

      // Update stop circle colours
      stopMarkersRef.current.forEach((sm, idx) => {
        const el = (sm as { getElement: () => HTMLElement | undefined }).getElement?.();
        if (!el) return;
        const inner = el.querySelector("div") as HTMLElement | null;
        if (!inner) return;
        if (idx < route.length - 1) {
          if (idx < safeIdx) {
            inner.style.background = "#D97706";
            inner.style.borderColor = "#D97706";
          } else {
            inner.style.background = "white";
            inner.style.borderColor = "#D97706";
          }
        }
      });

      if (raw < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        currentPosRef.current = { lat: to.lat, lng: to.lng };
        const map = leafletRef.current as { panTo: (p: [number, number], o: object) => void };
        map.panTo([to.lat, to.lng], { animate: true, duration: 0.8 });
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [posIdx]);

  return <div ref={mapRef} className="w-full h-full" />;
}
