/**
 * RouteBuilderMap — Google Maps JS API route visualizer / builder.
 *
 * Features:
 *  - Loads Maps JS API dynamically (key fetched from backend, never in source)
 *  - Native Google Places AutocompleteService (restricted to Nepal, 'np')
 *  - Numbered google.maps.Marker pins per stop (1, 2, 3 …)
 *  - Dashed google.maps.Polyline connecting stops in order
 *  - google.maps.LatLngBounds auto-fit whenever the stops array changes
 *  - viewMode: searching + clicking locked; static route + labels shown
 *  - onMapClick callback delivers exact { lat, lng } on map click
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from "react";
import { Search, RefreshCw, MapPin, X, Maximize2, Lock } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

declare const google: any;

export interface RouteStop {
  id: number | string;
  name: string;
  lat: number;
  lng: number;
}

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export interface RouteBuilderMapProps {
  stops?: RouteStop[];
  onMapClick?: (lat: number, lng: number, name?: string) => void;
  viewMode?: boolean;
  height?: number;
  /** Which stop index (0-based) to highlight as the "active" stop */
  activeStopIndex?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const KTM  = { lat: 27.7172, lng: 85.324 };

// ── Google Maps singleton loader ───────────────────────────────────────────────

let _mapsPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (_mapsPromise) return _mapsPromise;
  if (typeof window !== "undefined" && (window as any).google?.maps?.Map) {
    _mapsPromise = Promise.resolve();
    return _mapsPromise;
  }

  _mapsPromise = (async () => {
    const res = await fetch(`${BASE}/api/geocode/maps-key`);
    if (!res.ok) throw new Error("maps-key endpoint unreachable");
    const { key } = await res.json() as { key: string };
    if (!key) throw new Error("GOOGLE_MAPS_API_KEY not configured on server");

    await new Promise<void>((resolve, reject) => {
      const cbName = `__gmCb_${Date.now()}`;
      (window as any)[cbName] = () => {
        delete (window as any)[cbName];
        resolve();
      };
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=${cbName}&loading=async`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        _mapsPromise = null; // allow retry
        reject(new Error("Google Maps script failed to load"));
      };
      document.head.appendChild(script);
    });
  })();

  return _mapsPromise;
}

// ── Marker icon helpers ────────────────────────────────────────────────────────

function makeStopIcon(num: number, active: boolean) {
  const bg    = active ? "#d97706" : "#1e293b";
  const ring  = active ? "#fbbf24" : "#475569";
  const fs    = num > 9 ? 9 : 12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.8 15 25 15 25S30 25.8 30 15C30 6.716 23.284 0 15 0z"
          fill="${bg}" stroke="${ring}" stroke-width="2.5"/>
    <circle cx="15" cy="15" r="9" fill="white" fill-opacity="0.18"/>
    <text x="15" y="${num > 9 ? 19.5 : 20}" text-anchor="middle"
          font-family="system-ui,Arial,sans-serif" font-weight="700"
          font-size="${fs}" fill="white">${num}</text>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(30, 40),
    anchor: new google.maps.Point(15, 40),
    labelOrigin: new google.maps.Point(15, 15),
  };
}

function makeStartIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.8 15 25 15 25S30 25.8 30 15C30 6.716 23.284 0 15 0z"
          fill="#16a34a" stroke="#86efac" stroke-width="2.5"/>
    <circle cx="15" cy="15" r="6" fill="white"/>
    <circle cx="15" cy="15" r="3.5" fill="#16a34a"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(30, 40),
    anchor: new google.maps.Point(15, 40),
  };
}

function makeEndIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
    <path d="M15 0C6.716 0 0 6.716 0 15c0 10.8 15 25 15 25S30 25.8 30 15C30 6.716 23.284 0 15 0z"
          fill="#dc2626" stroke="#fca5a5" stroke-width="2.5"/>
    <rect x="9" y="9" width="12" height="12" rx="2" fill="white"/>
    <rect x="11.5" y="11.5" width="7" height="7" rx="1" fill="#dc2626"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(30, 40),
    anchor: new google.maps.Point(15, 40),
  };
}

// ── Dashed polyline path icon (replaces strokeOpacity) ───────────────────────

const DASH_ICON = {
  path: "M 0,-1 0,1",
  strokeOpacity: 1,
  strokeColor: "#f59e0b",
  strokeWeight: 3,
  scale: 4,
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function RouteBuilderMap({
  stops = [],
  onMapClick,
  viewMode = false,
  height = 380,
  activeStopIndex,
}: RouteBuilderMapProps) {
  const mapDivRef      = useRef<HTMLDivElement>(null);
  const gMapRef        = useRef<any>(null);
  const markersRef     = useRef<any[]>([]);
  const polylineRef    = useRef<any>(null);
  const acServiceRef   = useRef<any>(null);
  const placesSvcRef   = useRef<any>(null);
  const clickListRef   = useRef<any>(null);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapsReady, setMapsReady]       = useState(false);
  const [mapsError, setMapsError]       = useState<string | null>(null);
  const [query, setQuery]               = useState("");
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([]);
  const [searching, setSearching]       = useState(false);
  const [fetching, setFetching]         = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx]       = useState(-1);
  const [pendingName, setPendingName]   = useState<string | null>(null);

  // ── 1. Load Google Maps once ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => { if (!cancelled) setMapsReady(true); })
      .catch((err: Error) => { if (!cancelled) setMapsError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // ── 2. Initialize map after SDK ready ─────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !mapDivRef.current || gMapRef.current) return;

    const map = new google.maps.Map(mapDivRef.current, {
      center: stops.length > 0 ? { lat: stops[0].lat, lng: stops[0].lng } : KTM,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      gestureHandling: "cooperative",
      styles: [
        { featureType: "poi",   elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "transit", elementType: "labels", stylers: [{ visibility: "simplified" }] },
      ],
    });

    gMapRef.current     = map;
    acServiceRef.current = new google.maps.places.AutocompleteService();
    placesSvcRef.current = new google.maps.places.PlacesService(map);

    if (!viewMode && onMapClick) {
      clickListRef.current = map.addListener("click", (e: any) => {
        const lat = e.latLng.lat() as number;
        const lng = e.latLng.lng() as number;
        onMapClick(lat, lng, pendingNameRef.current ?? undefined);
        setPendingName(null);
        pendingNameRef.current = null;
        setQuery("");
        setSuggestions([]);
        setShowDropdown(false);
      });
    }

    return () => {
      if (clickListRef.current) {
        google.maps.event.removeListener(clickListRef.current);
        clickListRef.current = null;
      }
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
      gMapRef.current = null;
    };
  }, [mapsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref so the click listener always sees latest pendingName without re-binding
  const pendingNameRef = useRef<string | null>(null);
  useEffect(() => { pendingNameRef.current = pendingName; }, [pendingName]);

  // ── 3. Sync stops → markers + polyline + bounds ───────────────────────────
  useEffect(() => {
    if (!mapsReady || !gMapRef.current) return;
    const map = gMapRef.current;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Draw numbered markers
    const newMarkers = stops.map((stop, idx) => {
      const isFirst = idx === 0;
      const isLast  = idx === stops.length - 1 && stops.length > 1;
      const isActive = idx === activeStopIndex;

      let icon: any;
      if (isFirst && stops.length > 1) icon = makeStartIcon();
      else if (isLast)                  icon = makeEndIcon();
      else                              icon = makeStopIcon(idx + 1, isActive);

      const marker = new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map,
        icon,
        title: stop.name,
        zIndex: isActive ? 1000 : 100 + idx,
        animation: isActive ? google.maps.Animation.DROP : null,
      });

      // Tooltip on hover — InfoWindow
      const infoWin = new google.maps.InfoWindow({
        content: `<div style="font-size:11px;font-weight:700;padding:2px 4px;max-width:160px">${stop.name}</div>`,
        disableAutoPan: true,
      });
      marker.addListener("mouseover", () => infoWin.open({ anchor: marker, map }));
      marker.addListener("mouseout",  () => infoWin.close());

      return marker;
    });
    markersRef.current = newMarkers;

    // Draw dashed polyline
    if (polylineRef.current) polylineRef.current.setMap(null);
    if (stops.length >= 2) {
      polylineRef.current = new google.maps.Polyline({
        path: stops.map((s) => ({ lat: s.lat, lng: s.lng })),
        geodesic: true,
        strokeOpacity: 0,
        strokeColor: "#f59e0b",
        icons: [{ icon: DASH_ICON, offset: "0", repeat: "22px" }],
        map,
        zIndex: 50,
      });
    }

    // Auto-fit bounds around all stops
    if (stops.length === 1) {
      map.panTo({ lat: stops[0].lat, lng: stops[0].lng });
      map.setZoom(15);
    } else if (stops.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
      map.fitBounds(bounds, { top: 50, right: 40, bottom: 50, left: 40 });
    }
  }, [mapsReady, stops, activeStopIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Places Autocomplete (native, restricted to Nepal) ──────────────────
  const fetchSuggestions = useCallback((q: string) => {
    if (!acServiceRef.current || !q.trim() || q.trim().length < 2) {
      setSuggestions([]); setShowDropdown(false); return;
    }
    setSearching(true); setShowDropdown(true); setActiveIdx(-1);
    acServiceRef.current.getPlacePredictions(
      {
        input: q,
        componentRestrictions: { country: "np" },
        types: ["geocode", "establishment"],
      },
      (preds: any[] | null, status: string) => {
        setSearching(false);
        if (status === "OK" && preds) {
          setSuggestions(
            preds.map((p) => ({
              placeId: p.place_id,
              mainText: p.structured_formatting?.main_text ?? p.description.split(",")[0],
              secondaryText: p.structured_formatting?.secondary_text ?? "",
            }))
          );
        } else {
          setSuggestions([]);
        }
      }
    );
  }, []);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (!val.trim()) { setSuggestions([]); setShowDropdown(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 260);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp")  { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeIdx]); }
    else if (e.key === "Escape") { setShowDropdown(false); setActiveIdx(-1); }
  }

  async function pickSuggestion(s: Suggestion) {
    setShowDropdown(false); setActiveIdx(-1);
    setQuery(s.mainText);
    if (!placesSvcRef.current) return;

    setFetching(true);
    placesSvcRef.current.getDetails(
      { placeId: s.placeId, fields: ["geometry", "name", "formatted_address"] },
      (place: any, status: string) => {
        setFetching(false);
        if (status !== "OK" || !place?.geometry?.location) return;
        const lat = place.geometry.location.lat() as number;
        const lng = place.geometry.location.lng() as number;
        const name = place.name ?? s.mainText;

        // Pan to the result
        if (gMapRef.current) gMapRef.current.panTo({ lat, lng });

        // If the caller wants to handle clicks, store the resolved name so the
        // next map click (or they can call onMapClick directly) uses it.
        // If no onMapClick is wired up, we call it immediately.
        if (onMapClick) {
          setPendingName(name);
          pendingNameRef.current = name;
          // Emit immediately so the parent can add the stop without requiring a
          // secondary click; the map also re-centres, giving visual confirmation.
          onMapClick(lat, lng, name);
          setPendingName(null);
          pendingNameRef.current = null;
          setQuery("");
          setSuggestions([]);
        }
      }
    );
  }

  // ── Zoom / fit helpers ─────────────────────────────────────────────────────
  function zoomIn()  { gMapRef.current?.setZoom((gMapRef.current.getZoom() ?? 13) + 1); }
  function zoomOut() { gMapRef.current?.setZoom(Math.max(1, (gMapRef.current.getZoom() ?? 13) - 1)); }

  function fitAll() {
    if (!gMapRef.current || stops.length === 0) return;
    if (stops.length === 1) {
      gMapRef.current.panTo({ lat: stops[0].lat, lng: stops[0].lng });
      gMapRef.current.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    gMapRef.current.fitBounds(bounds, { top: 50, right: 40, bottom: 50, left: 40 });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (mapsError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-muted/30 text-center"
        style={{ height }}
      >
        <MapPin size={28} className="text-muted-foreground opacity-40" />
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Google Maps unavailable</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1 max-w-[240px]">{mapsError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-border shadow-sm" style={{ height }}>

      {/* ── Loading skeleton ── */}
      {!mapsReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-muted/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw size={14} className="animate-spin text-amber-500" />
            Loading Google Maps…
          </div>
        </div>
      )}

      {/* ── Map container ── */}
      <div ref={mapDivRef} className="absolute inset-0" />

      {/* ── Search overlay (hidden in viewMode) ── */}
      {!viewMode && mapsReady && (
        <div className="absolute top-2 left-2 right-14 z-10">
          <div className="relative">
            <div className="relative flex items-center">
              {searching || fetching
                ? <RefreshCw size={12} className="absolute left-3 text-amber-500 animate-spin pointer-events-none z-10" />
                : <Search size={12} className="absolute left-3 text-slate-500 pointer-events-none z-10" />
              }
              <input
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 160)}
                placeholder="Search Nepal — Koteshwor, Bhaktapur…"
                autoComplete="off"
                className="w-full rounded-xl border border-border bg-white/95 dark:bg-slate-900/95 shadow-md pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 backdrop-blur-sm transition-colors"
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setSuggestions([]); setShowDropdown(false); }}
                  className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Suggestions dropdown */}
            {showDropdown && (
              <div className="absolute left-0 right-0 top-[calc(100%+2px)] z-50 rounded-xl border border-border bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                {searching ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <RefreshCw size={11} className="animate-spin text-amber-500" />Searching Google Places…
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No results — try a different name</p>
                ) : (
                  <ul className="max-h-52 overflow-y-auto divide-y divide-border/50">
                    {suggestions.map((s, i) => (
                      <li key={s.placeId}>
                        <button
                          onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${i === activeIdx ? "bg-amber-50 dark:bg-amber-950/30" : "hover:bg-muted/60"}`}
                        >
                          <MapPin size={13} className="text-amber-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground leading-tight">{s.mainText}</p>
                            {s.secondaryText && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{s.secondaryText}</p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Pending click hint */}
          {pendingName && (
            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-2.5 py-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 shadow">
              <MapPin size={10} className="shrink-0" />
              Click the map to place "{pendingName}"
            </div>
          )}
        </div>
      )}

      {/* ── viewMode locked badge ── */}
      {viewMode && mapsReady && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-slate-800/80 border border-slate-600 px-2.5 py-1 text-[10px] font-semibold text-slate-300 backdrop-blur-sm pointer-events-none">
          <Lock size={9} />View Only
        </div>
      )}

      {/* ── Stop count badge ── */}
      {stops.length > 0 && mapsReady && (
        <div className="absolute bottom-12 left-2 z-10 flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-slate-800/90 border border-border px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur-sm pointer-events-none">
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          {stops.length} stop{stops.length !== 1 ? "s" : ""}
          {stops.length >= 2 && (
            <span className="text-muted-foreground">· dashed route</span>
          )}
        </div>
      )}

      {/* ── Legend: Start / End pins ── */}
      {stops.length >= 2 && mapsReady && (
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-border px-2.5 py-1.5 shadow-sm backdrop-blur-sm pointer-events-none">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600 shrink-0" />
          <span className="text-[9px] font-semibold text-foreground">Start</span>
          <span className="text-muted-foreground text-[9px]">·</span>
          <span className="h-2.5 w-2.5 rounded-full bg-red-600 shrink-0" />
          <span className="text-[9px] font-semibold text-foreground">End</span>
          <span className="text-muted-foreground text-[9px]">·</span>
          <span className="h-2.5 w-2.5 rounded-full bg-slate-800 shrink-0" />
          <span className="text-[9px] font-semibold text-foreground">Via</span>
        </div>
      )}

      {/* ── Map controls (top-right) ── */}
      {mapsReady && (
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); fitAll(); }}
            title="Fit all stops"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground hover:bg-muted transition-colors"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      )}

      {/* ── Zoom controls (bottom-right) ── */}
      {mapsReady && (
        <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1">
          <button onClick={(e) => { e.stopPropagation(); zoomIn(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors"
          >+</button>
          <button onClick={(e) => { e.stopPropagation(); zoomOut(); }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-border shadow-md text-foreground text-lg font-bold hover:bg-muted transition-colors"
          >−</button>
        </div>
      )}
    </div>
  );
}
