import { useState, useEffect } from "react";
import { useListAnnouncements, useGetTripTimeline, useUpdatePassenger, useListPassengers, getListPassengersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import BusMap from "@/components/bus-map";

const DEMO_PASSENGER_ID = 1;

const QUICK_MESSAGES = [
  { label: "🚶 I'm on my way", value: "I'm on my way" },
  { label: "⏳ Wait, I'm coming!", value: "Wait, I'm coming!" },
  { label: "🏠 Staying home today", value: "Staying home today" },
  { label: "🏫 At the stop now", value: "At the stop now" },
  { label: "🤒 Sick, not coming", value: "Sick, not coming" },
  { label: "👍 On the bus", value: "On the bus" },
];

// Simulated bus GPS coordinates around Kathmandu route
const BUS_POSITIONS = [
  { lat: 27.6726, lng: 85.3130 },
  { lat: 27.6857, lng: 85.3176 },
  { lat: 27.6922, lng: 85.3206 },
  { lat: 27.7010, lng: 85.3171 },
  { lat: 27.7089, lng: 85.3208 },
  { lat: 27.7172, lng: 85.3240 },
  { lat: 27.7244, lng: 85.3291 },
  { lat: 27.7315, lng: 85.3250 },
];

export default function StudentPortal() {
  const { data: announcements } = useListAnnouncements();
  const { data: timeline } = useGetTripTimeline(1);
  const { data: passengers } = useListPassengers();
  const updatePassenger = useUpdatePassenger();
  const queryClient = useQueryClient();

  const [posIdx, setPosIdx] = useState(0);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [liveToday, setLiveToday] = useState(false);

  const me = passengers?.find((p) => p.id === DEMO_PASSENGER_ID);

  useEffect(() => {
    if (me?.liveToday === 1) setLiveToday(true);
    if (me?.quickMessage) setSentMsg(me.quickMessage);
  }, [me]);

  // Animate bus position every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPosIdx((i) => (i + 1) % BUS_POSITIONS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const pos = BUS_POSITIONS[posIdx];

  const handleLiveToday = async () => {
    const next = !liveToday;
    setLiveToday(next);
    await updatePassenger.mutateAsync({
      id: DEMO_PASSENGER_ID,
      data: { liveToday: next ? 1 : 0 },
    });
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  };

  const handleQuickMessage = async (msg: string) => {
    setSentMsg(msg);
    await updatePassenger.mutateAsync({
      id: DEMO_PASSENGER_ID,
      data: { quickMessage: msg },
    });
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
  };

  return (
    <div className="mx-auto w-full max-w-[480px] bg-card p-4 shadow-md sm:my-8 sm:rounded-xl flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">Student / Staff</h1>
          <p className="text-xs text-muted-foreground">Aayush Shrestha · Route B4</p>
        </div>
        <img
          src={`https://api.dicebear.com/7.x/initials/svg?seed=Aayush+Shrestha&backgroundColor=0F172A&textColor=D97706`}
          alt="avatar"
          className="h-10 w-10 rounded-full border-2 border-amber-500"
        />
      </div>

      {/* Uniform photo notice */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
        <p className="text-xs font-medium text-amber-800">
          📸 Please upload uniform photos only! (कृपया युनिफर्म सहितको फोटोमात्र मान्य हुने छ !)
        </p>
      </div>

      {/* Live Today + Quick status */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Riding Today?</p>
            <p className="text-xs text-muted-foreground">Let the driver & admin know</p>
          </div>
          <button
            onClick={handleLiveToday}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
              liveToday
                ? "bg-green-600 text-white shadow-md"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            {liveToday ? "✅ Live Today" : "📍 Live Today"}
          </button>
        </div>
        {sentMsg && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-xs text-blue-800">
            Last sent: <span className="font-semibold">"{sentMsg}"</span>
          </div>
        )}
      </div>

      {/* Announcements */}
      {announcements?.length ? (
        <div className="space-y-2">
          <h2 className="font-semibold text-primary text-sm">📢 Notices</h2>
          {announcements.map((a) => (
            <div key={a.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
              <p className="text-sm">{a.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Live Bus Map */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-primary text-sm">🗺️ Live Bus Location</h2>
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            LIVE
          </span>
        </div>
        <div className="rounded-xl overflow-hidden border border-border" style={{ height: 220 }}>
          <BusMap lat={pos.lat} lng={pos.lng} />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          ETA: ~12 min · Next stop: Kalanki Chowk
        </p>
      </div>

      {/* Tracking Timeline */}
      <div className="space-y-2">
        <h2 className="font-semibold text-primary text-sm">🕐 Tracking Timeline</h2>
        {timeline ? (
          <div className="space-y-3">
            {timeline.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                    event.status === "completed" ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
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

      {/* Quick Message Bar */}
      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">💬 Quick Message to Driver</p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_MESSAGES.map((msg) => (
            <button
              key={msg.value}
              onClick={() => handleQuickMessage(msg.value)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium text-left transition-all ${
                sentMsg === msg.value
                  ? "border-amber-500 bg-amber-50 text-amber-800"
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
