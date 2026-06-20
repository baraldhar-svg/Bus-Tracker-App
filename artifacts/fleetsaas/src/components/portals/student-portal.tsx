import { useState, useEffect, useCallback, useRef } from "react";
import {
  useListAnnouncements,
  useGetTripTimeline,
  useUpdatePassenger,
  useListPassengers,
  getListPassengersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import BusMap from "@/components/bus-map";
import { useT } from "@/lib/i18n";

const DEMO_PASSENGER_ID = 1;

const QUICK_MESSAGES = [
  { label: "🚶 I'm on my way", value: "I'm on my way" },
  { label: "⏳ Wait, I'm coming!", value: "Wait, I'm coming!" },
  { label: "🏠 Staying home today", value: "Staying home today" },
  { label: "🏫 At the stop now", value: "At the stop now" },
  { label: "🤒 Sick, not coming", value: "Sick, not coming" },
  { label: "👍 On the bus", value: "On the bus" },
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

export default function StudentPortal() {
  const t = useT();
  const { data: announcements } = useListAnnouncements();
  const { data: timeline } = useGetTripTimeline(1);
  const { data: passengers } = useListPassengers();
  const updatePassenger = useUpdatePassenger();
  const queryClient = useQueryClient();

  const [posIdx, setPosIdx] = useState(0);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [liveToday, setLiveToday] = useState(false);
  const [onLeave, setOnLeave] = useState(false);
  const [geoAlertDismissed, setGeoAlertDismissed] = useState(false);
  const [leaveConfirming, setLeaveConfirming] = useState(false);
  const leaveClickRef = useRef(0);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const me = passengers?.find((p) => p.id === DEMO_PASSENGER_ID);

  useEffect(() => {
    if (me?.liveToday === 1) setLiveToday(true);
    if (me?.quickMessage) setSentMsg(me.quickMessage);
  }, [me]);

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
    setLeaveConfirming(false);
    leaveClickRef.current = 0;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (next) {
      setLiveToday(false);
      setSentMsg("Staying home today");
      await updatePassenger.mutateAsync({
        id: DEMO_PASSENGER_ID,
        data: { liveToday: 0, quickMessage: "Staying home today" },
      });
    } else {
      setSentMsg(null);
      await updatePassenger.mutateAsync({ id: DEMO_PASSENGER_ID, data: { liveToday: 0 } });
    }
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  }, [onLeave, updatePassenger, queryClient]);

  const handleLeaveClick = useCallback(() => {
    if (!onLeave) {
      handleLeave();
      return;
    }
    // When already on leave, require two taps within 500ms to cancel
    leaveClickRef.current += 1;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (leaveClickRef.current >= 2) {
      handleLeave();
    } else {
      setLeaveConfirming(true);
      leaveTimerRef.current = setTimeout(() => {
        leaveClickRef.current = 0;
        setLeaveConfirming(false);
      }, 500);
    }
  }, [onLeave, handleLeave]);

  const handleQuickMessage = useCallback(async (msg: string) => {
    setSentMsg(msg);
    await updatePassenger.mutateAsync({ id: DEMO_PASSENGER_ID, data: { quickMessage: msg } });
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  }, [updatePassenger, queryClient]);

  const etaProgress = Math.max(0, 100 - (pos.eta / 18) * 100);

  return (
    <div className="mx-auto w-full max-w-[480px] bg-card px-4 pb-8 pt-4 shadow-md sm:my-8 sm:rounded-2xl flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">{t.studentStaff}</h1>
          <p className="text-xs text-muted-foreground">Aayush Shrestha · Route B4 · Koteshwor</p>
        </div>
        <img
          src="https://api.dicebear.com/7.x/initials/svg?seed=Aayush+Shrestha&backgroundColor=0F172A&textColor=D97706"
          alt="avatar"
          className="h-11 w-11 rounded-full border-2 border-amber-500 shadow"
        />
      </div>
      {/* Geofencing Alert */}
      {nearbyAlert && (
        <div className="relative rounded-xl border border-amber-400 bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-lg animate-pulse-once">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🚌</span>
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
            {liveToday && !onLeave ? `✅ ${t.ridingToday}` : `📍 ${t.markLive}`}
          </button>
          <button
            onClick={handleLeaveClick}
            className={`rounded-xl py-3 text-sm font-semibold transition-all select-none ${
              onLeave
                ? leaveConfirming
                  ? "bg-red-400 text-white shadow-md scale-95"
                  : "bg-red-600 text-white shadow-md"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            {onLeave ? (
              <span className="flex flex-col items-center leading-tight">
                <span>❌ {t.onLeave}</span>
                <span className="text-[9px] font-normal text-red-200 mt-0.5">
                  {leaveConfirming ? t.tapAgainToCancel : t.tapTwiceToCancel}
                </span>
              </span>
            ) : `🏠 ${t.takeLeave}`}
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
        <div className="flex items-center gap-2 bg-amber-500 px-4 py-3">
          <span className="text-lg">📋</span>
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
              <p className="text-xs text-amber-600/60 dark:text-amber-500/50 mt-0.5">Check back later for updates from your school</p>
            </div>
          )}
        </div>
      </div>
      {/* Live Bus Map */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-primary text-sm">🗺️ Live Bus Location</h2>
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
        <h2 className="font-semibold text-primary text-sm">🕐 Tracking Timeline</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {timeline ? (
            <div className="divide-y divide-border">
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
          <p className="text-sm font-semibold text-foreground">💬 Quick Message to Driver</p>
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
              {msg.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
