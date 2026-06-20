import { useEffect, useRef } from "react";

interface BusMapProps {
  lat: number;
  lng: number;
}

export default function BusMap({ lat, lng }: BusMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Dynamically import leaflet to avoid SSR issues
    import("leaflet").then((L) => {
      // Import leaflet CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (!leafletMapRef.current) {
        const map = L.map(mapRef.current!, {
          center: [lat, lng],
          zoom: 14,
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          touchZoom: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        // Custom bus icon
        const busIcon = L.divIcon({
          html: `<div style="background:#D97706;border:2px solid white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.4);">🚌</div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([lat, lng], { icon: busIcon }).addTo(map);
        leafletMapRef.current = map;
        markerRef.current = marker;

        // Pulse circle
        L.circle([lat, lng], { radius: 80, color: "#D97706", fillColor: "#D97706", fillOpacity: 0.15, weight: 2 }).addTo(map);
      }
    });

    return () => {
      if (leafletMapRef.current) {
        (leafletMapRef.current as { remove: () => void }).remove();
        leafletMapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Update marker position when lat/lng changes
  useEffect(() => {
    if (!markerRef.current || !leafletMapRef.current) return;
    import("leaflet").then((L) => {
      const marker = markerRef.current as { setLatLng: (pos: L.LatLngExpression) => void };
      const map = leafletMapRef.current as { panTo: (pos: L.LatLngExpression) => void };
      marker.setLatLng([lat, lng]);
      map.panTo([lat, lng]);
    });
  }, [lat, lng]);

  return <div ref={mapRef} className="w-full h-full rounded-xl" />;
}
