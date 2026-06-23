import { useEffect, useRef, useState, useCallback } from "react";
import { Search, RefreshCw, MapPin, X, CheckCircle, SlidersHorizontal } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const KTM = { lat: 27.7172, lng: 85.324 };

function sessionToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface Suggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface PlaceDetail {
  lat: number;
  lng: number;
  name: string;
  formattedAddress: string;
}

interface StationMapPickerProps {
  onConfirm: (station: { name: string; lat: number; lng: number; radius: number }) => Promise<void>;
  onCancel: () => void;
}

export default function StationMapPicker({ onConfirm, onCancel }: StationMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<unknown>(null);
  const pinRef = useRef<unknown>(null);
  const circleRef = useRef<unknown>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(sessionToken());

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [fetching, setFetching] = useState(false);

  const [picked, setPicked] = useState<PlaceDetail | null>(null);
  const [stationName, setStationName] = useState("");
  const [radius, setRadius] = useState(100);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // ── update geofence circle ──────────────────────────────────────────────────
  const updateCircle = useCallback((lat: number, lng: number, r: number) => {
    import("leaflet").then((L) => {
      const map = leafletRef.current as { panTo: (c: [number, number], o: object) => void } | null;
      if (!map) return;

      // Remove old circle
      if (circleRef.current) {
        (circleRef.current as { remove: () => void }).remove();
        circleRef.current = null;
      }
      // Draw new circle
      const circle = (L as unknown as {
        circle: (c: [number, number], o: object) => unknown
      }).circle([lat, lng], {
        radius: r,
        color: "#f59e0b",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 0.12,
        dashArray: "6 4",
      });
      (circle as { addTo: (map: unknown) => void }).addTo(leafletRef.current);
      circleRef.current = circle;

      // Pin marker
      if (pinRef.current) {
        (pinRef.current as { setLatLng: (c: [number, number]) => void }).setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          html: `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="background:#f59e0b;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>
            <div style="width:2px;height:8px;background:#f59e0b"></div>
          </div>`,
          className: "",
          iconSize: [18, 26],
          iconAnchor: [9, 26],
        });
        const marker = (L as unknown as { marker: (c: [number, number], o: object) => unknown })
          .marker([lat, lng], { icon, draggable: true });
        (marker as { addTo: (map: unknown) => void }).addTo(leafletRef.current);
        (marker as {
          on: (ev: string, cb: () => void) => void;
          getLatLng: () => { lat: number; lng: number };
        }).on("dragend", function (this: { getLatLng: () => { lat: number; lng: number } }) {
          const nl = (marker as { getLatLng: () => { lat: number; lng: number } }).getLatLng();
          setPicked((p) => p ? { ...p, lat: nl.lat, lng: nl.lng } : null);
          updateCircle(nl.lat, nl.lng, radius);
        });
        pinRef.current = marker;
      }
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);

  // update circle when radius slider changes
  useEffect(() => {
    if (picked) updateCircle(picked.lat, picked.lng, radius);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius]);

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
        center: [KTM.lat, KTM.lng], zoom: 14,
        zoomControl: true, attributionControl: false,
        scrollWheelZoom: true, doubleClickZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19, subdomains: "abcd",
      }).addTo(map);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng;
        const detail: PlaceDetail = { lat, lng, name: stationName || "Custom Location", formattedAddress: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
        setPicked(detail);
        setShowDropdown(false);
        updateCircle(lat, lng, radius);
      });
      leafletRef.current = map;
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (leafletRef.current) {
        (leafletRef.current as { remove: () => void }).remove();
        leafletRef.current = null; pinRef.current = null; circleRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Google Places autocomplete ──────────────────────────────────────────────
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    setSearching(true); setShowDropdown(true); setActiveIdx(-1);
    try {
      const res = await fetch(
        `${BASE}/api/geocode/places?q=${encodeURIComponent(q)}&session=${sessionRef.current}`
      );
      if (res.status === 503) {
        // Fallback to Nominatim
        const r2 = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(q)}`);
        const d2 = await r2.json() as Array<{ displayName: string; lat: number; lng: number }>;
        setSuggestions(d2.map((x, i) => ({
          placeId: `nominatim_${i}`,
          description: x.displayName,
          mainText: x.displayName.split(",")[0] ?? x.displayName,
          secondaryText: x.displayName.split(",").slice(1).join(",").trim(),
        })));
      } else {
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
      }
    } catch { setSuggestions([]); }
    finally { setSearching(false); }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    if (!val.trim()) { setSuggestions([]); setShowDropdown(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 280);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeIdx]); }
    else if (e.key === "Escape") { setShowDropdown(false); setActiveIdx(-1); }
  }

  // ── pick a suggestion → fetch place details ─────────────────────────────────
  async function pickSuggestion(s: Suggestion) {
    setShowDropdown(false); setActiveIdx(-1);
    setQuery(s.mainText);
    setStationName(s.mainText);

    if (s.placeId.startsWith("nominatim_")) {
      // Already have coords embedded — re-search Nominatim to get coords
      setFetching(true);
      try {
        const r = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(s.description)}`);
        const d = await r.json() as Array<{ lat: number; lng: number; displayName: string }>;
        if (d[0]) {
          const detail: PlaceDetail = { lat: d[0].lat, lng: d[0].lng, name: s.mainText, formattedAddress: d[0].displayName };
          setPicked(detail);
          updateCircle(d[0].lat, d[0].lng, radius);
        }
      } finally { setFetching(false); }
      return;
    }

    // Google place — fetch details for precise coordinates
    setFetching(true);
    try {
      const res = await fetch(
        `${BASE}/api/geocode/place?place_id=${encodeURIComponent(s.placeId)}&session=${sessionRef.current}`
      );
      const detail: PlaceDetail = await res.json();
      setPicked(detail);
      setStationName(detail.name || s.mainText);
      updateCircle(detail.lat, detail.lng, radius);
      // Reset session token after a completed session
      sessionRef.current = sessionToken();
    } catch { /* ignore */ }
    finally { setFetching(false); }
    inputRef.current?.focus();
  }

  async function handleConfirm() {
    if (!picked || !stationName.trim()) return;
    setSaveErr(""); setSaving(true);
    try {
      await onConfirm({ name: stationName.trim(), lat: picked.lat, lng: picked.lng, radius });
      // Reset
      setQuery(""); setPicked(null); setStationName(""); setRadius(100);
      if (pinRef.current) { (pinRef.current as { remove: () => void }).remove(); pinRef.current = null; }
      if (circleRef.current) { (circleRef.current as { remove: () => void }).remove(); circleRef.current = null; }
      sessionRef.current = sessionToken();
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Failed to save station");
    } finally { setSaving(false); }
  }

  const hasPick = picked !== null;

  return (
    <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-card overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2">
          <MapPin size={13} className="text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Smart Station Lookup</span>
          <span className="rounded-full bg-amber-200 dark:bg-amber-900/50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400">Google Places</span>
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Search input */}
      <div className="px-4 pt-3 pb-2 relative">
        <div className="relative">
          {searching || fetching
            ? <RefreshCw size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 animate-spin pointer-events-none z-10" />
            : <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="Search — Koteshwor, Bhaktapur, Kirtipur…"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-muted/40 pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 focus:bg-card transition-colors"
          />
          {query && (
            <button onClick={() => { setQuery(""); setSuggestions([]); setShowDropdown(false); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {showDropdown && (
          <div className="absolute left-4 right-4 top-[calc(100%-4px)] z-50 rounded-b-xl border border-t-0 border-border bg-card shadow-2xl overflow-hidden">
            {searching ? (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <RefreshCw size={11} className="animate-spin text-amber-500" />Searching Google Places…
              </div>
            ) : suggestions.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">No results — try a different name</p>
            ) : (
              <ul className="max-h-48 overflow-y-auto divide-y divide-border/60">
                {suggestions.map((s, i) => (
                  <li key={s.placeId}>
                    <button
                      onMouseDown={() => pickSuggestion(s)}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${i === activeIdx ? "bg-amber-50 dark:bg-amber-950/30" : "hover:bg-muted/60"}`}
                    >
                      <MapPin size={13} className="text-amber-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground leading-tight">{s.mainText}</p>
                        {s.secondaryText && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{s.secondaryText}</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Leaflet map with geofence circle */}
      <div className="mx-4 mb-3 rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: 220 }}>
        <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Picked location info + station name + radius */}
      {hasPick && (
        <div className="mx-4 mb-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Location Pinned</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{picked.formattedAddress}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}</p>
            </div>
          </div>

          {/* Station name */}
          <div>
            <label className="mb-1 block text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Station Name</label>
            <input
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              placeholder="e.g. Koteshwor Bus Stop"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500"
            />
          </div>

          {/* Radius slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <SlidersHorizontal size={9} />Geofence Radius
              </label>
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{radius}m</span>
            </div>
            <input
              type="range" min={50} max={500} step={10}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
              <span>50m</span><span>Small street</span><span>200m</span><span>Junction</span><span>500m</span>
            </div>
          </div>
        </div>
      )}

      {!hasPick && (
        <p className="mx-4 mb-3 text-[10px] text-muted-foreground text-center italic">
          Search a location above, or tap the map to drop a pin manually
        </p>
      )}

      {/* Confirm */}
      <div className="px-4 pb-4">
        {saveErr && <p className="text-[10px] text-red-500 mb-2">{saveErr}</p>}
        <button
          onClick={handleConfirm}
          disabled={!hasPick || !stationName.trim() || saving}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-40 transition-colors"
        >
          {saving
            ? <><RefreshCw size={13} className="animate-spin" />Saving…</>
            : <><CheckCircle size={13} />Save as Geofence Hub — {stationName || "…"}</>
          }
        </button>
      </div>
    </div>
  );
}
