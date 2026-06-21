import { useEffect, useRef, useState, useCallback } from "react";
import { Search, RefreshCw, MapPin, X, CheckCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const KTM = { lat: 27.7172, lng: 85.324 };

interface GeoResult {
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
  const pinRef = useRef<unknown>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);
  const [stationName, setStationName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Move or create pin on map
  const movePin = useCallback((lat: number, lng: number) => {
    import("leaflet").then((L) => {
      const map = leafletRef.current as { panTo: (c: [number,number], o: object) => void } | null;
      if (!map) return;
      if (pinRef.current) {
        (pinRef.current as { setLatLng: (c: [number,number]) => void }).setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:0">
            <div style="background:#f59e0b;border:3px solid #fff;border-radius:50%;width:20px;height:20px;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>
            <div style="width:2px;height:9px;background:#f59e0b;"></div>
          </div>`,
          className: "",
          iconSize: [20, 29],
          iconAnchor: [10, 29],
        });
        const m = (L as unknown as { marker: (c:[number,number], o:object) => unknown }).marker([lat, lng], { icon, draggable: true });
        (m as { addTo: (map:unknown) => void }).addTo(leafletRef.current);
        // Update coords when user drags the pin
        (m as { on: (ev:string, cb:(e:{latlng:{lat:number;lng:number}}) => void) => void }).on("dragend", (e) => {
          const { lat: dlat, lng: dlng } = e.latlng;
          setPickedLat(dlat);
          setPickedLng(dlng);
        });
        pinRef.current = m;
      }
      map.panTo([lat, lng], { animate: true, duration: 0.4 });
    });
  }, []);

  // Init Leaflet
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    import("leaflet").then((L) => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (!document.getElementById("smp-style")) {
        const s = document.createElement("style");
        s.id = "smp-style";
        s.textContent = `.smp-tip{background:rgba(15,23,42,.92);color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;padding:3px 8px;box-shadow:0 2px 6px rgba(0,0,0,.3)}.smp-tip::before{display:none}`;
        document.head.appendChild(s);
      }
      const map = L.map(mapRef.current!, {
        center: [KTM.lat, KTM.lng],
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
        doubleClickZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19, subdomains: "abcd",
      }).addTo(map);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;
        setPickedLat(lat);
        setPickedLng(lng);
        setShowResults(false);
        movePin(lat, lng);
      });
      leafletRef.current = map;
    });
    return () => {
      if (leafletRef.current) {
        (leafletRef.current as { remove: () => void }).remove();
        leafletRef.current = null;
        pinRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search geocode
  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true); setShowResults(true);
    try {
      const res = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(q)}`);
      const data: GeoResult[] = await res.json();
      setResults(data);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  function pickResult(r: GeoResult) {
    setPickedLat(r.lat);
    setPickedLng(r.lng);
    const name = r.displayName.split(",")[0]?.trim() ?? "";
    setStationName(name);
    setQuery(name);
    setShowResults(false);
    movePin(r.lat, r.lng);
  }

  async function handleAdd() {
    if (!pickedLat || !pickedLng || !stationName.trim()) return;
    setSaveErr(""); setSaving(true);
    try {
      await onConfirm({ name: stationName.trim(), lat: pickedLat, lng: pickedLng });
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  const hasPick = pickedLat !== null && pickedLng !== null;

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-card overflow-hidden shadow-md">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
          <MapPin size={10} className="shrink-0" />New Station
        </span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors"><X size={13} /></button>
      </div>

      {/* Unified search + name input */}
      <div className="px-3 pt-2.5 pb-2 relative">
        <div className="flex gap-1.5">
          {/* Single input — search AND station name */}
          <div className="relative flex-1 min-w-0">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setStationName(e.target.value);
                if (!e.target.value) { setShowResults(false); setResults([]); }
              }}
              onKeyDown={(e) => e.key === "Enter" && search(query)}
              onFocus={() => results.length > 0 && setShowResults(true)}
              placeholder="Search or type station name…"
              className="w-full rounded-xl border border-border bg-muted/40 pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <button
            onClick={() => search(query)}
            disabled={!query.trim() || searching}
            className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 shrink-0 flex items-center gap-1 transition-colors"
          >
            {searching ? <RefreshCw size={10} className="animate-spin" /> : <Search size={10} />}
          </button>
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">
          {hasPick
            ? `📍 ${pickedLat!.toFixed(4)}, ${pickedLng!.toFixed(4)} — drag pin to adjust`
            : "Tap map to pin a location"}
        </p>

        {/* Inline results dropdown */}
        {showResults && (
          <div className="absolute left-3 right-3 top-full mt-0.5 z-50 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            {searching ? (
              <div className="flex items-center justify-center gap-1.5 py-3 text-[10px] text-muted-foreground">
                <RefreshCw size={10} className="animate-spin" />Searching…
              </div>
            ) : results.length === 0 ? (
              <p className="py-3 text-center text-[10px] text-muted-foreground">No results</p>
            ) : (
              <div className="max-h-32 overflow-y-auto divide-y divide-border">
                {results.map((r, i) => (
                  <button key={i} onClick={() => pickResult(r)}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
                    <MapPin size={11} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground line-clamp-1">{r.displayName.split(",")[0]}</p>
                      <p className="text-[9px] text-muted-foreground line-clamp-1">{r.displayName}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowResults(false)}
              className="w-full text-[9px] text-muted-foreground py-1.5 hover:text-foreground border-t border-border transition-colors">
              Close
            </button>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="mx-3 mb-2 rounded-xl overflow-hidden border border-border" style={{ height: 200 }}>
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Add button */}
      <div className="px-3 pb-3">
        {saveErr && <p className="text-[10px] text-red-500 mb-1.5">{saveErr}</p>}
        <button
          onClick={handleAdd}
          disabled={!hasPick || !stationName.trim() || saving}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
        >
          {saving ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={12} />}
          {saving ? "Adding…" : hasPick && stationName.trim() ? `Add "${stationName}" to Route` : "Pin a location to add"}
        </button>
      </div>
    </div>
  );
}
