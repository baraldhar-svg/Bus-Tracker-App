import { useState, useEffect } from "react";
import { useListAnnouncements, useGetTripTimeline, useListCalendarEvents, useListRoutes } from "@workspace/api-client-react";
import { Bus, Lock, Unlock, MapPin, Navigation, ChevronDown, CheckCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ROUTE_PREF_KEY = "orbittrack_parent_route";
const STATION_PREF_KEY = "orbittrack_parent_station";
const LOCKED_KEY = "orbittrack_parent_locked";

type RouteStation = { id: number; routeId: number; stationId: number; position: number; stationName: string | null; lat: number | null; lng: number | null; radius: number | null };

function todayAdStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function tomorrowAdStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ParentPortal() {
  const { data: announcements } = useListAnnouncements();
  const { data: timeline } = useGetTripTimeline();
  const { data: routes } = useListRoutes();

  const thisMonth = todayAdStr().slice(0, 7);
  const { data: calEvents } = useListCalendarEvents({ month: thisMonth });

  const todayStr = todayAdStr();
  const tmrStr = tomorrowAdStr();

  const upcomingEvents = (calEvents ?? []).filter(
    (e) => e.eventDate === todayStr || e.eventDate === tmrStr
  );

  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(() => {
    const v = localStorage.getItem(ROUTE_PREF_KEY);
    return v ? Number(v) : null;
  });
  const [selectedStationId, setSelectedStationId] = useState<number | null>(() => {
    const v = localStorage.getItem(STATION_PREF_KEY);
    return v ? Number(v) : null;
  });
  const [locked, setLocked] = useState<boolean>(() => localStorage.getItem(LOCKED_KEY) === "1");
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);

  useEffect(() => {
    if (!selectedRouteId) { setRouteStations([]); return; }
    setLoadingStations(true);
    fetch(`${BASE}/api/routes/${selectedRouteId}/stations`)
      .then((r) => r.json())
      .then((data: RouteStation[]) => setRouteStations(Array.isArray(data) ? data : []))
      .catch(() => setRouteStations([]))
      .finally(() => setLoadingStations(false));
  }, [selectedRouteId]);

  function handleSelectRoute(id: number | null) {
    if (locked) return;
    setSelectedRouteId(id);
    setSelectedStationId(null);
    setRouteStations([]);
    if (id) localStorage.setItem(ROUTE_PREF_KEY, String(id));
    else localStorage.removeItem(ROUTE_PREF_KEY);
    localStorage.removeItem(STATION_PREF_KEY);
  }

  function handleSelectStation(id: number | null) {
    if (locked) return;
    setSelectedStationId(id);
    if (id) localStorage.setItem(STATION_PREF_KEY, String(id));
    else localStorage.removeItem(STATION_PREF_KEY);
  }

  function handleToggleLock() {
    if (!selectedRouteId || !selectedStationId) return;
    const next = !locked;
    setLocked(next);
    localStorage.setItem(LOCKED_KEY, next ? "1" : "0");
  }

  const selectedRoute = (routes ?? []).find((r) => r.id === selectedRouteId) ?? null;
  const selectedStation = routeStations.find((s) => s.stationId === selectedStationId) ?? null;

  const mapLat = selectedStation?.lat ?? 27.7172;
  const mapLng = selectedStation?.lng ?? 85.3240;

  return (
    <div className="mx-auto w-full max-w-[480px] bg-card p-4 shadow-md sm:my-8 sm:rounded-xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary flex items-center gap-2">
          <Bus size={20} className="text-[#FFCF38]" />OrbitTrack
        </h1>
        <span className="rounded-full bg-amber-100 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">Parent</span>
      </div>

      {/* Uniform notice */}
      <div className="rounded-lg bg-muted p-4 text-center">
        <p className="text-sm font-medium">Please upload standard uniform photos only! (कृपया युनिफर्म सहितको फोटोमात्र मान्य हुने छ !)</p>
      </div>

      {/* Upcoming Calendar Events urgent banner */}
      {upcomingEvents.length > 0 && (
        <div className="space-y-2">
          {upcomingEvents.map((ev) => {
            const isToday = ev.eventDate === todayStr;
            const isHoliday = ev.type === "holiday";
            return (
              <div key={ev.id} className={`flex items-start gap-3 rounded-xl border p-3 ${isHoliday ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"}`}>
                <span className="text-lg">{isHoliday ? "🎉" : "📅"}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold uppercase tracking-wide ${isHoliday ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {isHoliday ? "Holiday" : "Event"} {isToday ? "Today" : "Tomorrow"}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{ev.title}</p>
                  {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Bus Route & Station Picker ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-primary flex items-center gap-2"><Navigation size={14} />My Bus Settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Select your route and boarding station</p>
          </div>
          {locked ? (
            <button onClick={handleToggleLock} className="flex items-center gap-1.5 rounded-xl bg-green-100 dark:bg-green-950/30 border border-green-300 dark:border-green-700 px-3 py-1.5 text-[10px] font-bold text-green-700 dark:text-green-400 hover:opacity-80 transition-opacity">
              <Lock size={10} />Locked
            </button>
          ) : (
            <button onClick={handleToggleLock} disabled={!selectedRouteId || !selectedStationId}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[10px] font-semibold text-muted-foreground hover:border-amber-500 hover:text-amber-600 disabled:opacity-40 transition-colors">
              <Unlock size={10} />Lock Selection
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Route dropdown */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Bus Route</label>
            {locked && selectedRoute ? (
              <div className="flex items-center gap-2 rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 px-3 py-2.5">
                <CheckCircle size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm font-semibold text-foreground">{selectedRoute.name}</p>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedRouteId ?? ""}
                  onChange={(e) => handleSelectRoute(e.target.value ? Number(e.target.value) : null)}
                  disabled={locked}
                  className="w-full appearance-none rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500 pr-8"
                >
                  <option value="">Choose your route…</option>
                  {(routes ?? []).filter((r) => r.isActive).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Station list for selected route */}
          {selectedRouteId && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Boarding Station</label>
              {loadingStations ? (
                <p className="text-xs text-muted-foreground py-2">Loading stations…</p>
              ) : routeStations.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 italic">No stations on this route yet</p>
              ) : locked && selectedStation ? (
                <div className="flex items-center gap-2 rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 px-3 py-2.5">
                  <MapPin size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedStation.stationName}</p>
                    {selectedStation.lat && selectedStation.lng && (
                      <p className="text-[10px] text-muted-foreground">{selectedStation.lat.toFixed(4)}, {selectedStation.lng.toFixed(4)}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto rounded-xl border border-border">
                  {routeStations.map((s) => (
                    <button
                      key={s.stationId}
                      onClick={() => handleSelectStation(s.stationId)}
                      disabled={locked}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${selectedStationId === s.stationId ? "bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-500" : "hover:bg-muted"}`}
                    >
                      <span className="text-[10px] font-bold text-[#FFCF38] w-5 shrink-0">{s.position}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.stationName}</p>
                        {s.lat && s.lng && <p className="text-[10px] text-muted-foreground">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</p>}
                      </div>
                      {selectedStationId === s.stationId && <CheckCircle size={14} className="text-[#FFCF38] shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Map for selected station */}
      {selectedStationId && selectedStation?.lat && selectedStation?.lng && (
        <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5"><MapPin size={11} />Live Map — {selectedStation.stationName}</p>
          </div>
          <iframe
            title="station-map"
            className="w-full h-48 border-0"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapLng - 0.01}%2C${mapLat - 0.008}%2C${mapLng + 0.01}%2C${mapLat + 0.008}&layer=mapnik&marker=${mapLat}%2C${mapLng}`}
          />
          <div className="px-5 py-2 flex items-center justify-between bg-muted/20">
            <p className="text-[10px] text-muted-foreground">{mapLat.toFixed(4)}, {mapLng.toFixed(4)}</p>
            <a href={`https://www.openstreetmap.org/?mlat=${mapLat}&mlon=${mapLng}#map=16/${mapLat}/${mapLng}`} target="_blank" rel="noreferrer"
              className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold hover:underline">
              Open full map →
            </a>
          </div>
        </div>
      )}

      {/* Announcements */}
      {announcements?.length ? (
        <div className="space-y-2">
          <h2 className="font-semibold text-primary">Notices</h2>
          {announcements.map((a) => (
            <div key={a.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
              <p className="text-sm">{a.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Tracking Timeline */}
      <div>
        <h2 className="mb-2 font-semibold text-primary">Tracking Timeline</h2>
        {timeline ? (
          <div className="space-y-3">
            {timeline.map((event) => (
              <div key={event.id} className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full shrink-0 ${event.status === "completed" ? "bg-green-500" : "bg-gray-300"}`} />
                <div>
                  <p className="text-sm font-medium">{event.description}</p>
                  <p className="text-xs text-muted-foreground">{event.time}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading timeline...</p>
        )}
      </div>
    </div>
  );
}
