import { useEffect, useRef, useState, useCallback } from "react";
import { Search, RefreshCw, MapPin, X, CheckCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Kathmandu center — default map center
const KTM = { lat: 27.7172, lng: 85.3240 };

interface GeoResult {
  lat: number;
  lng: number;
  displayName: string;
}

interface PickedLocation {
  lat: number;
  lng: number;
  displayName: string;
}

interface StationMapPickerProps {
  onConfirm: (station: { name: string; lat: number; lng: number }) => Promise<void>;
  onCancel: () => void;
}

export default function StationMapPicker({ onConfirm, onCancel }: StationMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<unknown>(null);
  const pinMarkerRef = useRef<unknown>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [stationName, setStationName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Set or move the pin marker on the map
  const setPinOnMap = useCallback((lat: number, lng: number, label: string) => {
    import("leaflet").then((L) => {
      const map = leafletRef.current as {
        setView: (c: [number, number], z: number, o: object) => void;
        panTo: (c: [number, number], o: object) => void;
      } | null;
      if (!map) return;

      if (pinMarkerRef.current) {
        const m = pinMarkerRef.current as { setLatLng: (c: [number, number]) => void; setTooltipContent: (s: string) => void };
        m.setLatLng([lat, lng]);
        m.setTooltipContent(label);
      } else {
        const pinIcon = L.divIcon({
          html: `<div style="display:flex;flex-direction:column;align-items:center;">
            <div style="background:#D97706;border:3px solid white;border-radius:50%;width:22px;height:22px;box-shadow:0 3px 10px rgba(0,0,0,0.45);"></div>
            <div style="width:2px;height:10px;background:#D97706;margin-top:1px;"></div>
          </div>`,
          className: "",
          iconSize: [22, 32],
          iconAnchor: [11, 32],
        });
        const marker = (L as unknown as { marker: (c: [number, number], o: object) => unknown }).marker([lat, lng], { icon: pinIcon });
        (marker as { addTo: (m: unknown) => unknown; bindTooltip: (s: string, o: object) => void }).addTo(leafletRef.current);
        (marker as { bindTooltip: (s: string, o: object) => void }).bindTooltip(label, { permanent: false, direction: "top", className: "map-picker-tooltip" });
        pinMarkerRef.current = marker;
      }
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
    });
  }, []);

  // Init Leaflet map
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    import("leaflet").then((L) => {
      // Leaflet CSS (reuse if already loaded)
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // Tooltip style
      if (!document.getElementById("map-picker-style")) {
        const style = document.createElement("style");
        style.id = "map-picker-style";
        style.textContent = `
          .map-picker-tooltip { background: rgba(15,23,42,0.92); color:#fff; border:none; border-radius:6px; font-size:11px; font-weight:600; padding:4px 9px; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
          .map-picker-tooltip::before { display:none; }
          .map-picker-result-marker { background:#3b82f6; border:2px solid white; border-radius:50%; width:12px; height:12px; box-shadow:0 1px 5px rgba(0,0,0,0.4); cursor:pointer; }
        `;
        document.head.appendChild(style);
      }

      const map = L.map(mapRef.current!, {
        center: [KTM.lat, KTM.lng],
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
        doubleClickZoom: false,
      });

      // CartoDB Voyager — clean, Google Maps-like tiles, no API key
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, subdomains: "abcd" }
      ).addTo(map);

      // Click anywhere on map → place pin
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;
        const loc: PickedLocation = { lat, lng, displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
        setPicked(loc);
        setStationName((prev) => prev || "");
        setPinOnMap(lat, lng, "📍 Selected location");
      });

      leafletRef.current = map;
    });

    return () => {
      if (leafletRef.current) {
        (leafletRef.current as { remove: () => void }).remove();
        leafletRef.current = null;
        pinMarkerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search geocode
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearchErr(""); setSearching(true); setResults([]);
    try {
      const res = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(query)}`);
      const data: GeoResult[] = await res.json();
      setResults(data);
      if (data.length === 0) setSearchErr("No results — try a different name");
      else {
        // Fit map to results
        import("leaflet").then((L) => {
          const map = leafletRef.current as { fitBounds: (b: [[number,number],[number,number]], o: object) => void } | null;
          if (!map || data.length === 0) return;
          const lats = data.map((d) => d.lat);
          const lngs = data.map((d) => d.lng);
          const bounds: [[number,number],[number,number]] = [
            [Math.min(...lats), Math.min(...lngs)],
            [Math.max(...lats), Math.max(...lngs)],
          ];
          (L as unknown as { latLngBounds: (b: [[number,number],[number,number]]) => unknown });
          map.fitBounds(bounds, { maxZoom: 15, padding: [40, 40] } as object);
        });
      }
    } catch { setSearchErr("Search failed — check connection"); }
    finally { setSearching(false); }
  }, [query]);

  // Pick a result from list
  function pickResult(r: GeoResult) {
    const loc: PickedLocation = { lat: r.lat, lng: r.lng, displayName: r.displayName };
    setPicked(loc);
    const shortName = r.displayName.split(",")[0]?.trim() ?? "";
    setStationName((prev) => prev || shortName);
    setResults([]);
    setQuery("");
    setPinOnMap(r.lat, r.lng, shortName);
  }

  // Confirm and save
  async function handleConfirm() {
    if (!picked || !stationName.trim()) return;
    setSaveErr(""); setSaving(true);
    try {
      await onConfirm({ name: stationName.trim(), lat: picked.lat, lng: picked.lng });
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Failed to create station");
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-amber-100/60 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2">
          <MapPin size={13} className="text-amber-600 dark:text-amber-400" />
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Station Map Picker</p>
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Search bar */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search location in Nepal…"
              className="w-full rounded-xl border border-border bg-card pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || searching}
            className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 shrink-0 flex items-center gap-1 transition-colors"
          >
            {searching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
            {searching ? "" : "Go"}
          </button>
        </div>
        {searchErr && <p className="mt-1 text-[10px] text-red-500">{searchErr}</p>}
        <p className="mt-1 text-[10px] text-muted-foreground">Or tap anywhere on the map to drop a pin</p>
      </div>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <div className="mx-3 mb-2 rounded-xl border border-border bg-card overflow-hidden shadow-md z-10 relative">
          <div className="max-h-36 overflow-y-auto divide-y divide-border">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => pickResult(r)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
              >
                <MapPin size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground line-clamp-1">{r.displayName.split(",")[0]}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{r.displayName}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Leaflet Map */}
      <div className="mx-3 mb-3 rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: 220 }}>
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Confirm section — shown after pin placed */}
      {picked && (
        <div className="mx-3 mb-3 rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 p-3 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">📍 Location pinned</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{picked.displayName}</p>
              <p className="text-[10px] text-muted-foreground font-mono">{picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}</p>
            </div>
            <button
              onClick={() => { setPicked(null); setStationName(""); }}
              className="text-muted-foreground hover:text-red-500 shrink-0 mt-0.5"
            >
              <X size={12} />
            </button>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Station Name</label>
            <input
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              placeholder="e.g. Koteshwor Chowk"
              autoFocus
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          {saveErr && <p className="text-[10px] text-red-500">{saveErr}</p>}
          <button
            onClick={handleConfirm}
            disabled={!stationName.trim() || saving}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {saving ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={12} />}
            {saving ? "Adding station…" : "Add to Route"}
          </button>
        </div>
      )}
    </div>
  );
}
