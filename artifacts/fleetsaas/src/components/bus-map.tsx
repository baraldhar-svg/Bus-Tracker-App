import { useEffect, useRef } from "react";

export interface RouteStop {
  lat: number;
  lng: number;
  name: string;
  eta?: number;
}

interface BusMapProps {
  route: RouteStop[];
  /** Real GPS latitude from driver's phone. When provided, overrides route-index positioning. */
  busLat: number;
  /** Real GPS longitude from driver's phone. When provided, overrides route-index positioning. */
  busLng: number;
  /** When true, a pulsing green dot is shown on the bus marker to indicate a live GPS fix. */
  isLive?: boolean;
}

export default function BusMap({ route, busLat, busLng, isLive = false }: BusMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const completedLineRef = useRef<unknown>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const stopMarkersRef = useRef<unknown[]>([]);

  // Build the initial map once
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

      // Route polyline (planned path through stations)
      if (route.length >= 2) {
        const allCoords = route.map((p) => [p.lat, p.lng] as [number, number]);
        L.polyline(allCoords, { color: "#cbd5e1", weight: 5, opacity: 0.6 }).addTo(map);

        const compLine = L.polyline([], { color: "#D97706", weight: 5, opacity: 0.9 }).addTo(map);
        completedLineRef.current = compLine;

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
      }

      // Bus marker — positioned at current GPS coordinates
      const busIcon = L.divIcon({
        html: `<div style="background:#D97706;border:3px solid white;border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 10px rgba(0,0,0,0.5);">🚌</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const busMarker = L.marker([busLat, busLng], { icon: busIcon, zIndexOffset: 1000 }).addTo(map);

      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
      });

      leafletRef.current = map;
      markerRef.current = busMarker;
      currentPosRef.current = { lat: busLat, lng: busLng };

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Smoothly animate marker to new GPS coordinates whenever they change
  useEffect(() => {
    if (!markerRef.current || !leafletRef.current) return;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const from = currentPosRef.current ?? { lat: busLat, lng: busLng };
    const to = { lat: busLat, lng: busLng };
    const startTime = performance.now();
    const DURATION = 2000; // 2s smooth glide per GPS update

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function tick(now: number) {
      const raw = Math.min((now - startTime) / DURATION, 1);
      const t = easeInOut(raw);
      const lat = lerp(from.lat, to.lat, t);
      const lng = lerp(from.lng, to.lng, t);

      const marker = markerRef.current as { setLatLng: (p: [number, number]) => void };
      marker.setLatLng([lat, lng]);

      if (raw < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        currentPosRef.current = { lat: to.lat, lng: to.lng };
        const map = leafletRef.current as { panTo: (p: [number, number], o: object) => void };
        map.panTo([to.lat, to.lng], { animate: true, duration: 0.8 });
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [busLat, busLng]);

  // Update bus icon to show live vs stale state
  useEffect(() => {
    if (!markerRef.current) return;
    import("leaflet").then((L) => {
      const newIcon = L.divIcon({
        html: isLive
          ? `<div style="position:relative;width:36px;height:36px;">
               <div style="background:#D97706;border:3px solid white;border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 10px rgba(0,0,0,0.5);">🚌</div>
               <span style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;background:#22c55e;border:2px solid white;border-radius:50%;animation:pulse-gps 1.5s ease-in-out infinite;"></span>
             </div>`
          : `<div style="background:#D97706;border:3px solid white;border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 3px 10px rgba(0,0,0,0.5);">🚌</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      (markerRef.current as { setIcon: (i: unknown) => void }).setIcon(newIcon);
    });

    // Inject pulse animation once
    if (!document.querySelector("#gps-pulse-style")) {
      const s = document.createElement("style");
      s.id = "gps-pulse-style";
      s.textContent = `@keyframes pulse-gps { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }`;
      document.head.appendChild(s);
    }
  }, [isLive]);

  function zoomIn() {
    const map = leafletRef.current as { zoomIn: () => void } | null;
    map?.zoomIn();
  }
  function zoomOut() {
    const map = leafletRef.current as { zoomOut: () => void } | null;
    map?.zoomOut();
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      {isLive && (
        <div className="absolute top-2 left-2 z-[1000] flex items-center gap-1.5 rounded-full bg-green-600/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-md backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          GPS LIVE
        </div>
      )}
      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); zoomIn(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors"
          title="Zoom in"
        >+</button>
        <button
          onClick={(e) => { e.stopPropagation(); zoomOut(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors"
          title="Zoom out"
        >−</button>
      </div>
    </div>
  );
}
