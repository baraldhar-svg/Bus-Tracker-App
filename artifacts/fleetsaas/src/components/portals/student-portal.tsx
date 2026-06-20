import { useState, useEffect, useCallback, useRef } from "react";
import {
  useListAnnouncements,
  useGetTripTimeline,
  useUpdatePassenger,
  useListPassengers,
  useListRoutes,
  getListPassengersQueryKey,
  useListCalendarEvents,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import BusMap from "@/components/bus-map";
import { useT } from "@/lib/i18n";
import {
  Bus, ClipboardList, Map, Clock, MessageSquare, X,
  User, Timer, Home, MapPin, HeartPulse, ThumbsUp, Route, Navigation, CheckCircle, RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEMO_PASSENGER_ID = 1;

const QUICK_MESSAGES = [
  { Icon: User,       label: "I'm on my way",      value: "I'm on my way" },
  { Icon: Timer,      label: "Wait, I'm coming!",   value: "Wait, I'm coming!" },
  { Icon: Home,       label: "Staying home today",  value: "Staying home today" },
  { Icon: MapPin,     label: "At the stop now",     value: "At the stop now" },
  { Icon: HeartPulse, label: "Sick, not coming",    value: "Sick, not coming" },
  { Icon: ThumbsUp,   label: "On the bus",          value: "On the bus" },
];

// Simulated bus GPS route through Kathmandu
const BUS_POSITIONS = [
  { lat: 27.6726, lng: 85.3130, name: "Balkhu", eta: 18 },
  { lat: 27.6857, lng: 85.3176, name: "Ekantakuna", eta: 15 },
  { lat: 27.6922, lng: 85.3206, name: "Satdobato", eta: 12 },
  { lat: 27.7010, lng: 85.3171, name: "Lagankhel", eta: 9 },
  { lat: 27.7089, lng: 85.3208, name: "Jawalakhel", eta: 6 },
  { lat: 27.7172, lng: 85.3240, name: "Pulchowk", eta: 4 },
  { lat: 27.7244, lng: 85.3291, name: "Tripureshwor", eta: 2 },
  { lat: 27.7315, lng: 85.3250, name: "Ratnapark", eta: 0 },
];

// Student's home stop is Kalanki — bus is close when ETA <= 4 min
const GEO_ALERT_THRESHOLD_ETA = 5;

type RouteStationItem = { id: number; stationId: number; stationName: string | null; position: number; radius: number | null };

export default function StudentPortal() {
  const t = useT();
  const { data: announcements } = useListAnnouncements();
  const { data: timeline } = useGetTripTimeline(1);
  const { data: passengers } = useListPassengers();
  const { data: routes } = useListRoutes();
  const updatePassenger = useUpdatePassenger();
  const queryClient = useQueryClient();

  const [posIdx, setPosIdx] = useState(0);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [liveToday, setLiveToday] = useState(false);
  const [onLeave, setOnLeave] = useState(false);
  const [geoAlertDismissed, setGeoAlertDismissed] = useState(false);


  // Transport Config state
  const [transportOpen, setTransportOpen] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [routeStations, setRouteStations] = useState<RouteStationItem[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [loadingStations, setLoadingStations] = useState(false);
  const [transportSaving, setTransportSaving] = useState(false);
  const [transportSaved, setTransportSaved] = useState(false);

  const todayAdStr = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })();
  const tmrAdStr = (() => { const d = new Date(); d.setDate(d.getDate()+1); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })();
  const { data: calEvents } = useListCalendarEvents({ month: todayAdStr.slice(0, 7) });
  const upcomingEvents = (calEvents ?? []).filter(e => e.eventDate === todayAdStr || e.eventDate === tmrAdStr);

  const me = passengers?.find((p) => p.id === DEMO_PASSENGER_ID);

  useEffect(() => {
    if (me?.liveToday === 1) setLiveToday(true);
    if (me?.quickMessage) setSentMsg(me.quickMessage);
    if (me?.routeId) setSelectedRouteId(String(me.routeId));
    if (me?.stationId) setSelectedStationId(String(me.stationId));
  }, [me?.liveToday, me?.quickMessage, me?.routeId, me?.stationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load stations when selected route changes
  useEffect(() => {
    if (!selectedRouteId) { setRouteStations([]); return; }
    setLoadingStations(true);
    fetch(`${BASE}/api/routes/${selectedRouteId}/stations`)
      .then((r) => r.json())
      .then((data: RouteStationItem[]) => setRouteStations(data))
      .catch(() => setRouteStations([]))
      .finally(() => setLoadingStations(false));
  }, [selectedRouteId]);

  const handleSaveTransport = useCallback(async () => {
    setTransportSaving(true);
    setTransportSaved(false);
    try {
      await updatePassenger.mutateAsync({
        id: DEMO_PASSENGER_ID,
        data: {
          routeId: selectedRouteId ? Number(selectedRouteId) : undefined,
          stationId: selectedStationId ? Number(selectedStationId) : undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
      setTransportSaved(true);
      setTransportOpen(false);
      setTimeout(() => setTransportSaved(false), 3000);
    } catch { /* ignore */ }
    finally { setTransportSaving(false); }
  }, [selectedRouteId, selectedStationId, updatePassenger, queryClient]);

  // Bus position simulation every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPosIdx((i) => (i + 1) % BUS_POSITIONS.length);
      setGeoAlertDismissed(false); // reset alert for each new position
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const pos = BUS_POSITIONS[posIdx];
  const nearbyAlert = pos.eta <= GEO_ALERT_THRESHOLD_ETA && !geoAlertDismissed;

  const handleLiveToday = useCallback(async () => {
    if (onLeave) return;
    const next = !liveToday;
    setLiveToday(next);
    await updatePassenger.mutateAsync({ id: DEMO_PASSENGER_ID, data: { liveToday: next ? 1 : 0 } });
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  }, [liveToday, onLeave, updatePassenger, queryClient]);

  const handleLeave = useCallback(async () => {
    const next = !onLeave;
    setOnLeave(next);
    if (next) {
      setLiveToday(false);
      setSentMsg("Staying home today");
      await updatePassenger.mutateAsync({
        id: DEMO_PASSENGER_ID,
        data: { liveToday: 0, quickMessage: "Staying home today", status: "leave" },
      });
    } else {
      setSentMsg(null);
      await updatePassenger.mutateAsync({ id: DEMO_PASSENGER_ID, data: { liveToday: 0, status: "pending" } });
    }
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  }, [onLeave, updatePassenger, queryClient]);

  const handleLeaveClick = useCallback(() => {
    handleLeave();
  }, [handleLeave]);

  const handleQuickMessage = useCallback(async (msg: string) => {
    setSentMsg(msg);
    await updatePassenger.mutateAsync({ id: DEMO_PASSENGER_ID, data: { quickMessage: msg } });
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  }, [updatePassenger, queryClient]);

  const etaProgress = Math.max(0, 100 - (pos.eta / 18) * 100);

  return (
    <div className="w-full px-4 pb-8 pt-4 flex flex-col gap-5">
      {/* Calendar upcoming events urgent banner */}
      {upcomingEvents.length > 0 && (
        <div className="space-y-2">
          {upcomingEvents.map((ev) => {
            const isToday = ev.eventDate === todayAdStr;
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
      {/* Geofencing Alert */}
      {nearbyAlert && (
        <div className="relative rounded-xl border border-amber-400 bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-lg animate-pulse-once">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bus size={36} className="text-white drop-shadow" />
              <div>
                <p className="font-bold text-sm">Bus is nearby — {pos.eta} min away!</p>
                <p className="text-xs text-amber-100 mt-0.5">
                  Approaching {pos.name} stop · Get ready now
                </p>
              </div>
            </div>
            <button
              onClick={() => setGeoAlertDismissed(true)}
              className="shrink-0 rounded-full p-1 hover:bg-white/20 text-white text-xs"
            >✕</button>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-[3500ms]"
              style={{ width: `${etaProgress}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[10px] text-amber-100">Route progress {Math.round(etaProgress)}%</p>
        </div>
      )}
      {/* Riding Today / Leave Status */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
        <p className="text-sm font-semibold text-foreground">{t.todaysStatus}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleLiveToday}
            disabled={onLeave}
            className={`rounded-xl py-3 text-sm font-semibold transition-all ${
              liveToday && !onLeave
                ? "bg-green-600 text-white shadow-md"
                : "bg-muted text-muted-foreground border border-border disabled:opacity-50"
            }`}
          >
            {liveToday && !onLeave ? t.ridingToday : t.markLive}
          </button>
          <button
            onClick={handleLeaveClick}
            className={`rounded-xl py-3 text-sm font-semibold transition-all select-none ${
              onLeave
                ? "bg-red-600 text-white shadow-md"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            {onLeave ? (
              <span className="flex items-center justify-center gap-1"><X size={12} /> {t.onLeave}</span>
            ) : t.takeLeave}
          </button>
        </div>
        {sentMsg && (
          <div className="rounded-lg dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 bg-background text-xs font-extrabold text-[#000]">
            Driver notified: <span className="font-semibold text-[#007500]">{onLeave ? "Not Riding Today" : "Coming to School Today"}</span>
          </div>
        )}
      </div>
      {/* Notice Board */}
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 overflow-hidden shadow-sm">
        {/* Board header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#FFF078]">
          <ClipboardList size={18} className="text-slate-900" />
          <div className="flex-1">
            <p className="font-bold text-slate-900 text-sm leading-tight">Notice Board</p>
            <p className="text-[10px] text-amber-900/70">From your school administration</p>
          </div>
          {announcements?.length ? (
            <span className="rounded-full bg-slate-900/20 px-2 py-0.5 text-[10px] font-bold text-slate-900">
              {announcements.length} notice{announcements.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        {/* Notices list */}
        <div className="divide-y divide-amber-200 dark:divide-amber-800/30">
          {announcements?.length ? (
            announcements.map((a, idx) => (
              <div key={a.id} className="flex items-start gap-3 px-4 py-3 bg-background">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-900">
                  {idx + 1}
                </span>
                <p className="text-sm dark:text-amber-200 leading-snug text-[#FF9F00] font-bold">{a.message}</p>
              </div>
            ))
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-amber-700 dark:text-amber-400">No notices at this time</p>
              <p className="text-xs text-amber-600/60 dark:text-[#FFF078]/50 mt-0.5">Check back later for updates from your school</p>
            </div>
          )}
        </div>
      </div>
      {/* Live Bus Map */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-primary text-sm flex items-center gap-1.5"><Map size={14} /> Live Bus Location</h2>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
              LIVE
            </span>
          </div>
        </div>

        {/* ETA Bar */}
        <div className="rounded-xl border border-border bg-muted/40 p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Current Location</p>
            <p className="text-sm font-semibold text-foreground">{pos.name}</p>
          </div>
          <div className="flex-1 mx-2">
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-[3500ms] ease-linear"
                style={{ width: `${etaProgress}%` }}
              />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">ETA</p>
            <p className={`text-sm font-bold ${pos.eta <= 4 ? "text-red-500" : "text-green-600"}`}>
              {pos.eta === 0 ? "NOW" : `${pos.eta} min`}
            </p>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: 280 }}>
          <BusMap route={BUS_POSITIONS} posIdx={posIdx} />
        </div>
        <p className="text-xs text-muted-foreground text-center">Next stop: Kalanki Chowk</p>
      </div>
      {/* Tracking Timeline */}
      <div className="space-y-2">
        <h2 className="font-semibold text-primary text-sm flex items-center gap-1.5"><Clock size={14} /> Tracking Timeline</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {timeline ? (
            <div className="divide-y divide-border max-h-52 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
              {timeline.map((event, idx) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <div className={`h-3 w-3 rounded-full border-2 ${
                      event.status === "completed"
                        ? "border-green-500 bg-green-500"
                        : idx === timeline.findIndex(e => e.status !== "completed")
                        ? "border-amber-500 bg-amber-500 animate-pulse"
                        : "border-border bg-transparent"
                    }`} />
                    {idx < timeline.length - 1 && (
                      <div className={`w-0.5 h-4 ${event.status === "completed" ? "bg-green-300" : "bg-border"}`} />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-sm font-medium text-foreground">{event.description}</p>
                    <p className="text-xs text-muted-foreground">{event.time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground p-4">Loading timeline...</p>
          )}
        </div>
      </div>
      {/* Quick Message Bar */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><MessageSquare size={14} /> Quick Message to Driver</p>
          {sentMsg && (
            <span className="text-xs text-green-600 font-medium">✓ Sent</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_MESSAGES.map((msg) => (
            <button
              key={msg.value}
              onClick={() => handleQuickMessage(msg.value)}
              className={`rounded-xl border px-3 py-2.5 text-xs font-medium text-left transition-all ${
                sentMsg === msg.value
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 shadow-sm"
                  : "border-border bg-card hover:bg-muted text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5"><msg.Icon size={13} className="shrink-0" />{msg.label}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Transport Configuration */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <button
          onClick={() => setTransportOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Route size={15} className="text-[#FFF078] shrink-0" />
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Transport Configuration</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {me?.routeId
                  ? `Route ${(routes ?? []).find((r) => r.id === me.routeId)?.name ?? `#${me.routeId}`} · station configured`
                  : "No route assigned — tap to configure"}
              </p>
            </div>
          </div>
          <span className="text-muted-foreground text-xs">{transportOpen ? "▲" : "▼"}</span>
        </button>

        {transportOpen && (
          <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
            {/* Route picker */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Your Route</label>
              <select
                value={selectedRouteId}
                onChange={(e) => { setSelectedRouteId(e.target.value); setSelectedStationId(""); }}
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500"
              >
                <option value="">Select a route…</option>
                {(routes ?? []).filter((r) => r.isActive).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Station picker */}
            {selectedRouteId && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Navigation size={10} />Your Pickup / Drop-off Station
                </label>
                {loadingStations ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <RefreshCw size={11} className="animate-spin" />Loading stations…
                  </div>
                ) : routeStations.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">No stations on this route yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {routeStations.map((rs, idx) => (
                      <button
                        key={rs.id}
                        onClick={() => setSelectedStationId(String(rs.stationId))}
                        className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                          selectedStationId === String(rs.stationId)
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                            : "border-border bg-muted/30 hover:border-amber-300"
                        }`}
                      >
                        <span className="text-[10px] font-bold text-[#FFF078] w-4 shrink-0">{idx + 1}</span>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-foreground">{rs.stationName ?? `Station #${rs.stationId}`}</p>
                          {rs.radius && <p className="text-[9px] text-muted-foreground">{rs.radius}m geofence</p>}
                        </div>
                        {selectedStationId === String(rs.stationId) && (
                          <CheckCircle size={13} className="text-[#FFF078] shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Save button */}
            <div className="pt-1 flex items-center gap-3">
              <button
                onClick={handleSaveTransport}
                disabled={!selectedRouteId || !selectedStationId || transportSaving}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {transportSaving ? "Saving…" : "Save Transport Config"}
              </button>
              {transportSaved && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle size={12} />Saved!
                </span>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              Your driver will see your assigned station on the boarding checklist
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
