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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);
  const [stationName, setStationName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // ── pin helper ─────────────────────────────────────────────────────────────
  const movePin = useCallback((lat: number, lng: number) => {
    import("leaflet").then((L) => {
      const map = leafletRef.current as { panTo: (c: [number, number], o: object) => void } | null;
      if (!map) return;
      if (pinRef.current) {
        (pinRef.current as { setLatLng: (c: [number, number]) => void }).setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          html: `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="background:#f59e0b;border:3px solid #fff;border-radius:50%;width:20px;height:20px;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>
            <div style="width:2px;height:9px;background:#f59e0b"></div>
          </div>`,
          className: "",
          iconSize: [20, 29],
          iconAnchor: [10, 29],
        });
        const m = (L as unknown as { marker: (c: [number, number], o: object) => unknown }).marker(
          [lat, lng], { icon, draggable: true }
        );
        (m as { addTo: (map: unknown) => void }).addTo(leafletRef.current);
        (m as { on: (ev: string, cb: (e: { latlng: { lat: number; lng: number } }) => void) => void }).on(
          "dragend", (e) => { setPickedLat(e.latlng.lat); setPickedLng(e.latlng.lng); }
        );
        pinRef.current = m;
      }
      map.panTo([lat, lng], { animate: true, duration: 0.4 });
    });
  }, []);

  // ── init Leaflet ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    import("leaflet").then((L) => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      const map = L.map(mapRef.current!, {
        center: [KTM.lat, KTM.lng], zoom: 13,
        zoomControl: true, attributionControl: false,
        scrollWheelZoom: true, doubleClickZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19, subdomains: "abcd",
      }).addTo(map);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;
        setPickedLat(lat); setPickedLng(lng);
        setShowDropdown(false);
        movePin(lat, lng);
      });
      leafletRef.current = map;
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (leafletRef.current) {
        (leafletRef.current as { remove: () => void }).remove();
        leafletRef.current = null; pinRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── geocode fetch ───────────────────────────────────────────────────────────
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setShowDropdown(false); return; }
    setSearching(true); setShowDropdown(true); setActiveIdx(-1);
    try {
      const res = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(q)}`);
      const data: GeoResult[] = await res.json();
      setResults(data);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  // ── debounced onChange ──────────────────────────────────────────────────────
  function handleChange(val: string) {
    setQuery(val);
    setStationName(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setResults([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350);
  }

  // ── keyboard nav ────────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || results.length === 0) {
      if (e.key === "Enter") fetchSuggestions(query);
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pickResult(results[activeIdx]); }
    else if (e.key === "Escape") { setShowDropdown(false); setActiveIdx(-1); }
  }

  // ── pick suggestion ─────────────────────────────────────────────────────────
  function pickResult(r: GeoResult) {
    const name = r.displayName.split(",")[0]?.trim() ?? "";
    setQuery(name); setStationName(name);
    setPickedLat(r.lat); setPickedLng(r.lng);
    setResults([]); setShowDropdown(false); setActiveIdx(-1);
    movePin(r.lat, r.lng);
    inputRef.current?.focus();
  }

  // ── confirm ─────────────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!pickedLat || !pickedLng || !stationName.trim()) return;
    setSaveErr(""); setSaving(true);
    try { await onConfirm({ name: stationName.trim(), lat: pickedLat, lng: pickedLng }); }
    catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  const hasPick = pickedLat !== null && pickedLng !== null;

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-card overflow-hidden shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
          <MapPin size={10} />New Station
        </span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors"><X size={13} /></button>
      </div>

      {/* Search input with live suggestions */}
      <div className="px-3 pt-2.5 pb-2 relative">
        <div className="relative">
          {/* Icon */}
          {searching
            ? <RefreshCw size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500 animate-spin pointer-events-none z-10" />
            : <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
          }

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Type a location to search…"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-muted/40 pl-8 pr-8 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 focus:bg-card transition-colors"
          />

          {/* Clear button */}
          {query && (
            <button
              onClick={() => { setQuery(""); setStationName(""); setResults([]); setShowDropdown(false); inputRef.current?.focus(); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Coordinate hint */}
        <p className="text-[9px] text-muted-foreground mt-1 leading-none">
          {hasPick
            ? `📍 ${pickedLat!.toFixed(5)}, ${pickedLng!.toFixed(5)} — drag pin to fine-tune`
            : "Tap the map to drop a pin"}
        </p>

        {/* Live suggestions dropdown */}
        {showDropdown && (
          <div className="absolute left-3 right-3 top-[calc(100%-4px)] z-50 rounded-b-xl border border-t-0 border-border bg-card shadow-2xl overflow-hidden">
            {searching ? (
              <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
                <RefreshCw size={10} className="animate-spin text-amber-500" />
                Searching…
              </div>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-muted-foreground">No results for "{query}"</p>
            ) : (
              <ul className="max-h-44 overflow-y-auto">
                {results.map((r, i) => (
                  <li key={i}>
                    <button
                      onMouseDown={() => pickResult(r)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                        i === activeIdx
                          ? "bg-amber-50 dark:bg-amber-950/30"
                          : "hover:bg-muted/60"
                      } ${i > 0 ? "border-t border-border/60" : ""}`}
                    >
                      <MapPin size={12} className="text-amber-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-foreground leading-tight line-clamp-1">
                          {r.displayName.split(",")[0]}
                        </p>
                        <p className="text-[9px] text-muted-foreground line-clamp-1 mt-0.5">
                          {r.displayName}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Leaflet map */}
      <div className="mx-3 mb-2 rounded-xl overflow-hidden border border-border" style={{ height: 200 }}>
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Confirm */}
      <div className="px-3 pb-3">
        {saveErr && <p className="text-[10px] text-red-500 mb-1.5">{saveErr}</p>}
        <button
          onClick={handleAdd}
          disabled={!hasPick || !stationName.trim() || saving}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
        >
          {saving ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={12} />}
          {saving
            ? "Adding…"
            : hasPick && stationName.trim()
              ? `Add "${stationName}" to Route`
              : "Pin a location on the map first"}
        </button>
      </div>
    </div>
  );
}
