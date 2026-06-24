import { useState, useEffect, useCallback, useRef } from "react";
import { useDriverLocation } from "@/hooks/use-driver-location";
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
import OsmMap from "@/components/osm-map";
import PaymentModal from "@/components/PaymentModal";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import {
  Bus, ClipboardList, Map, Clock, MessageSquare, X,
  User, Timer, Home, MapPin, HeartPulse, ThumbsUp, Route, Navigation, CheckCircle, RefreshCw,
  ShieldAlert, CreditCard, AlertTriangle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const QUICK_MESSAGES = [
  { Icon: User,       label: "I'm on my way",      value: "I'm on my way" },
  { Icon: Timer,      label: "Wait, I'm coming!",   value: "Wait, I'm coming!" },
  { Icon: Home,       label: "Staying home today",  value: "Staying home today" },
  { Icon: MapPin,     label: "At the stop now",     value: "At the stop now" },
  { Icon: HeartPulse, label: "Sick, not coming",    value: "Sick, not coming" },
  { Icon: ThumbsUp,   label: "On the bus",          value: "On the bus" },
];

// Student's home stop ETA alert threshold
const GEO_ALERT_THRESHOLD_METERS = 800;

type RouteStationItem = { id: number; stationId: number; stationName: string | null; position: number; radius: number | null; lat?: number | null; lng?: number | null };

export default function StudentPortal() {
  const t = useT();
  const { user } = useAuth();
  const { data: announcements } = useListAnnouncements();
  const { data: timeline } = useGetTripTimeline();
  const { data: passengers } = useListPassengers();
  const { data: routes } = useListRoutes();
  const updatePassenger = useUpdatePassenger();
  const queryClient = useQueryClient();

  const driverLoc = useDriverLocation();
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [liveToday, setLiveToday] = useState(false);
  const [onLeave, setOnLeave] = useState(false);
  const [geoAlertDismissed, setGeoAlertDismissed] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);


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

  // Find this student's passenger record by phone; fall back to first if not yet linked
  const me = passengers?.find((p) => p.phone === user?.phone) ?? passengers?.[0];

  // Subscription status — server computes isPaying/daysLeft/isExpired, cast from extended response
  type SubPassenger = typeof me & { isPaying?: boolean; isExpired?: boolean; daysLeft?: number | null; showExpiryBanner?: boolean };
  const meEx = me as SubPassenger | undefined;
  const isPaying = meEx?.isPaying ?? false;
  const daysLeft = meEx?.daysLeft ?? null;
  const showExpiryBanner = meEx?.showExpiryBanner ?? false;

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
        id: me?.id ?? 1,
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

  // Geofencing: alert when driver is within threshold of student's stop
  const myStop = routeStations.find((rs) => String(rs.stationId) === selectedStationId);
  const nearbyAlert = (() => {
    if (!driverLoc.isLive || !myStop?.lat || !myStop?.lng || geoAlertDismissed) return false;
    const dLat = (driverLoc.lat - myStop.lat) * 111000;
    const dLng = (driverLoc.lng - myStop.lng) * 111000 * Math.cos(myStop.lat * (Math.PI / 180));
    return Math.sqrt(dLat * dLat + dLng * dLng) < GEO_ALERT_THRESHOLD_METERS;
  })();

  const handleLiveToday = useCallback(async () => {
    if (onLeave) return;
    const next = !liveToday;
    setLiveToday(next);
    await updatePassenger.mutateAsync({ id: me?.id ?? 1, data: { liveToday: next ? 1 : 0 } });
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  }, [liveToday, onLeave, updatePassenger, queryClient]);

  const handleLeave = useCallback(async () => {
    const next = !onLeave;
    setOnLeave(next);
    if (next) {
      setLiveToday(false);
      setSentMsg("Staying home today");
      await updatePassenger.mutateAsync({
        id: me?.id ?? 1,
        data: { liveToday: 0, quickMessage: "Staying home today" },
      });
    } else {
      setSentMsg(null);
      await updatePassenger.mutateAsync({ id: me?.id ?? 1, data: { liveToday: 0 } });
    }
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  }, [onLeave, updatePassenger, queryClient]);

  const handleLeaveClick = useCallback(() => {
    handleLeave();
  }, [handleLeave]);

  const [activeQuickMsg, setActiveQuickMsg] = useState<string | null>(null);

  const handleQuickMessage = useCallback(async (msg: string) => {
    setActiveQuickMsg(msg);
    setSentMsg(msg);
    await updatePassenger.mutateAsync({ id: me?.id ?? 1, data: { quickMessage: msg } });
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  }, [updatePassenger, queryClient]);


  return (
    <div className="w-full px-4 pb-8 pt-4 flex flex-col gap-5">

      {/* Payment modal overlay */}
      {paymentModalOpen && (
        <PaymentModal
          passengerId={me?.id ?? 0}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={() => {
            setPaymentModalOpen(false);
            queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
          }}
        />
      )}

      {/* Subscription expiry warning banner */}
      {showExpiryBanner && daysLeft !== null && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-400 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
          <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-orange-800 dark:text-orange-300">
              Bus access expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
              Renew now to keep tracking your bus without interruption.
            </p>
          </div>
          <button
            onClick={() => setPaymentModalOpen(true)}
            className="shrink-0 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors"
          >
            Renew
          </button>
        </div>
      )}

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
      {/* Geofencing Alert — fires when live GPS puts the bus within 800m of student's stop */}
      {nearbyAlert && (
        <div className="relative rounded-xl border border-amber-400 bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bus size={36} className="text-white drop-shadow" />
              <div>
                <p className="font-bold text-sm">Bus is nearby — get ready!</p>
                <p className="text-xs text-amber-100 mt-0.5">
                  {myStop?.lat ? `Approaching ${myStop.stationName ?? "your stop"} · head out now` : "Bus is close — head to your stop"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setGeoAlertDismissed(true)}
              className="shrink-0 rounded-full p-1 hover:bg-white/20 text-white text-xs"
            >✕</button>
          </div>
        </div>
      )}
      {/* Welcome bar */}
      {user && (
        <div className="border border-border rounded-xl bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-2.5 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {user.title ? `${user.title} ` : ""}{user.name}
              </span>
              <span className="rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                {user.role}
              </span>
              {user.tenant?.name && (
                <span className="text-xs text-muted-foreground">· {user.tenant.name}</span>
              )}
            </div>
            {(() => {
              const station = routeStations.find(rs => String(rs.stationId) === selectedStationId);
              return station?.stationName ? (
                <p className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                  <MapPin size={10} className="shrink-0 text-amber-500" />
                  {station.stationName}
                </p>
              ) : null;
            })()}
          </div>
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
        {/* Notices list — 2 visible, rest scrollable */}
        <div className="divide-y divide-amber-200 dark:divide-amber-800/30 max-h-[116px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-amber-300 dark:[&::-webkit-scrollbar-thumb]:bg-amber-700 hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
          {announcements?.length ? (
            announcements.map((a, idx) => (
              <div key={a.id} className="flex items-start gap-3 px-4 py-3 bg-background">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-slate-900 bg-[#fff647]">
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
      {/* GPS / Tracking — paying users only */}
      {isPaying ? (
      <><div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-primary text-sm flex items-center gap-1.5"><Map size={14} /> Live Bus Location</h2>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
              LIVE
            </span>
          </div>
        </div>

        {/* Route-locked Bus Info Banner */}
        {(() => {
          const selRoute = (routes ?? []).find((r) => r.id === Number(selectedRouteId));
          if (!selRoute) return (
            <button
              onClick={() => setTransportOpen(true)}
              className="w-full flex items-center gap-3 rounded-xl border border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/10 px-4 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
            >
              <Route size={14} className="text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">No route selected</p>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70">Tap to choose your bus route ↓</p>
              </div>
            </button>
          );
          return (
            <div className="flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5">
              <div className={`h-2 w-2 rounded-full shrink-0 ${selRoute.isActive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{selRoute.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {selRoute.vehiclePlate ? (
                    <><span className="font-semibold text-amber-700 dark:text-amber-400">{selRoute.vehiclePlate}</span>{selRoute.driverName ? ` · ${selRoute.driverName}` : ""}</>
                  ) : selRoute.driverName ?? "No bus assigned"}
                </p>
              </div>
              <button onClick={() => setTransportOpen(true)} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2">change</button>
            </div>
          );
        })()}

        {/* GPS Status Bar */}
        <div className="rounded-xl border border-border bg-muted/40 p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Bus Location</p>
            <p className="text-sm font-semibold text-foreground font-mono">
              {driverLoc.isLive
                ? `${driverLoc.lat.toFixed(4)}°N, ${driverLoc.lng.toFixed(4)}°E`
                : "Waiting for GPS…"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className={`text-sm font-bold flex items-center gap-1 justify-end ${driverLoc.isLive ? "text-green-600" : "text-muted-foreground"}`}>
              <span className={`h-2 w-2 rounded-full inline-block ${driverLoc.isLive ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
              {driverLoc.isLive ? "LIVE" : "Offline"}
            </p>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: 280 }}>
          <OsmMap
            mode="tracking"
            route={routeStations.filter((rs) => rs.lat && rs.lng).map((rs) => ({ lat: rs.lat!, lng: rs.lng!, name: rs.stationName ?? `Stop ${rs.id}` }))}
            lat={driverLoc.lat}
            lng={driverLoc.lng}
            isLive={driverLoc.isLive}
            height={280}
          />
        </div>
        {routeStations.length > 0 ? (
          <p className="text-xs text-muted-foreground text-center">
            Your route · {routeStations.length} stop{routeStations.length !== 1 ? "s" : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground text-center">Next stop: Kalanki Chowk</p>
        )}
      </div>

      {/* Route Stops — my stop pinned, rest scrollable */}
      {routeStations.length > 0 && (() => {
        const myStop = routeStations.find(rs => String(rs.stationId) === selectedStationId);
        const otherStops = routeStations.filter(rs => String(rs.stationId) !== selectedStationId);
        const saveStop = async (rs: RouteStationItem) => {
          setSelectedStationId(String(rs.stationId));
          setTransportSaving(true);
          try {
            await updatePassenger.mutateAsync({
              id: me?.id ?? 1,
              data: { routeId: selectedRouteId ? Number(selectedRouteId) : undefined, stationId: rs.stationId },
            });
            queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
            setTransportSaved(true);
            setTimeout(() => setTransportSaved(false), 2500);
          } catch { /* ignore */ }
          finally { setTransportSaving(false); }
        };
        return (
          <div className="space-y-1.5">
            <h2 className="font-semibold text-primary text-sm flex items-center gap-1.5"><Navigation size={14} /> Your Route Stops</h2>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Pinned: user's current stop */}
              {myStop && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800/40">
                  <MapPin size={13} className="shrink-0 text-amber-500" />
                  <p className="flex-1 text-sm font-bold text-amber-700 dark:text-amber-400 truncate">
                    {myStop.stationName ?? `Stop ${myStop.stationId}`}
                  </p>
                  <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">Your stop</span>
                </div>
              )}
              {/* Scrollable: all other stops */}
              {otherStops.length > 0 && (
                <div className="divide-y divide-border max-h-[180px] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-400">
                  {otherStops.map((rs) => (
                    <button
                      key={rs.id}
                      onClick={() => saveStop(rs)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="h-2 w-2 shrink-0 rounded-full border border-border bg-transparent" />
                      <p className="flex-1 text-xs text-foreground truncate">
                        {rs.stationName ?? `Stop ${rs.stationId}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {transportSaved && (
              <p className="text-xs text-green-600 font-medium flex items-center gap-1 px-1">
                <CheckCircle size={11} /> Stop updated
              </p>
            )}
          </div>
        );
      })()}

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
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><MessageSquare size={14} /> Quick Message to Driver</p>
          {sentMsg && (
            <span className="text-xs text-green-600 font-medium">✓ Sent</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_MESSAGES.map((msg) => {
            const isActive = activeQuickMsg === msg.value;
            return (
              <button
                key={msg.value}
                onClick={() => handleQuickMessage(msg.value)}
                className={`rounded-xl border px-3 py-2.5 text-xs font-medium text-left transition-all active:scale-[0.97] ${
                  isActive
                    ? "border-[#ffee47] bg-[#ffee47] text-slate-900 shadow-md scale-[0.98]"
                    : "border-amber-500/60 bg-amber-50 dark:bg-amber-950/40 text-[#ffcd28] dark:text-amber-300 hover:border-[#ffee47] hover:bg-amber-100 dark:hover:bg-amber-950/70"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <msg.Icon size={13} className="shrink-0" />
                  {msg.label}
                </span>
              </button>
            );
          })}
        </div>
      </div></>) : (
        /* Non-paying paywall card */
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-5 py-4 bg-slate-100 dark:bg-slate-800/70 border-b border-border">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-700">
              <ShieldAlert size={18} className="text-slate-500" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">Bus Tracking Unavailable</p>
              <p className="text-xs text-muted-foreground mt-0.5">Activate your subscription to track your bus live</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              {[
                "Live GPS map of your school bus",
                "Real-time arrival alerts at your stop",
                "Driver communication & tracking timeline",
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  {feat}
                </div>
              ))}
            </div>
            <div className="h-32 rounded-xl border border-dashed border-border bg-muted/30 flex items-center justify-center">
              <div className="text-center">
                <Map size={28} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">GPS map locked</p>
              </div>
            </div>
            {me?.routeId ? (
              <button
                onClick={() => setPaymentModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-slate-900 hover:bg-amber-400 transition-colors"
              >
                <CreditCard size={15} />
                Renew Bus Access — NPR 1,500/mo
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">First, select your route below to activate tracking</p>
                <button
                  onClick={() => { setTransportOpen(true); (document.getElementById("transport-config") as HTMLElement)?.scrollIntoView({ behavior: "smooth" }); }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500 bg-amber-50 dark:bg-amber-950/30 py-3 text-sm font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                >
                  <Route size={15} />
                  Select Your Route Below
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
                className="flex-1 rounded-xl py-2.5 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors bg-[#ffee47]"
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
