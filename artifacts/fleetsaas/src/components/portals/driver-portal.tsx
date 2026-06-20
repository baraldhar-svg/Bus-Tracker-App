import { useState } from "react";
import { useListStations, useListPassengers, useBoardPassenger, useUpdatePassenger, getListPassengersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { sendDriverMessage } from "@/lib/driver-messages";

const DRIVER_NAME = "Ram Bahadur";
const DRIVER_PLATE = "BA 1 KHA 1234";

const QUICK_MESSAGES = [
  { emoji: "🚦", text: "Traffic jam on route" },
  { emoji: "🚧", text: "Road is under construction" },
  { emoji: "🔧", text: "Tire is punctured" },
  { emoji: "⛽", text: "Fuel is low" },
  { emoji: "🕐", text: "Running late" },
  { emoji: "🚌", text: "Bus breakdown" },
  { emoji: "✅", text: "All clear, back on route" },
  { emoji: "🌧️", text: "Bad weather conditions" },
];

const SAFETY_SCORE = 91;
const SPEED_KMH = 38;
const DISTANCE_KM = 12.4;
const TRIPS_TODAY = 2;

function Avatar({ name, photoUrl, size = "md" }: { name: string; photoUrl?: string | null; size?: "sm" | "md" }) {
  const src = photoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1e293b&textColor=f59e0b&fontSize=36`;
  const cls = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  return <img src={src} alt={name} className={`${cls} rounded-full border-2 border-slate-600 object-cover shrink-0`} />;
}

function ScoreRing({ score }: { score: number }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 85 ? "#22c55e" : score >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#1e293b" strokeWidth="5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dasharray 1s ease" }} />
      <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

export default function DriverPortal() {
  const { data: stations } = useListStations();
  const { data: passengers, refetch } = useListPassengers();
  const boardPassenger = useBoardPassenger();
  const updatePassenger = useUpdatePassenger();
  const queryClient = useQueryClient();

  const [stationIdx, setStationIdx] = useState(0);
  const [boardingId, setBoardingId] = useState<number | null>(null);
  const [unboardingId, setUnboardingId] = useState<number | null>(null);
  const [sosActive, setSosActive] = useState(false);
  const [journeyStarted, setJourneyStarted] = useState(false);
  const [journeyTime, setJourneyTime] = useState<string | null>(null);
  const [journeyCompleted, setJourneyCompleted] = useState(false);
  const [completedTime, setCompletedTime] = useState<string | null>(null);
  const [quickMsgOpen, setQuickMsgOpen] = useState(false);
  const [customMsg, setCustomMsg] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);

  const currentStation = stations?.[stationIdx];
  const boardedCount = passengers?.filter((p) => p.status === "boarded").length ?? 0;
  const totalCount = passengers?.length ?? 0;
  const liveTodayPassengers = passengers?.filter((p) => p.liveToday === 1) ?? [];
  const withMessages = passengers?.filter((p) => p.quickMessage) ?? [];
  const onLeavePassengers = passengers?.filter((p) => p.quickMessage === "Staying home today") ?? [];

  // Bus is "near school" when driver reaches the last station (≤ 200 m perimeter)
  const nearSchool = stations != null && stationIdx === stations.length - 1;

  const handleBoard = async (id: number) => {
    setBoardingId(id);
    try {
      await boardPassenger.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
      refetch();
    } finally { setBoardingId(null); }
  };

  const handleUnboard = async (id: number) => {
    setUnboardingId(id);
    try {
      await updatePassenger.mutateAsync({ id, data: { status: "pending" } });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
      refetch();
    } finally { setUnboardingId(null); }
  };

  function handleStartJourney() {
    setJourneyStarted(true);
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    setJourneyTime(timeStr);
  }

  function handleJourneyComplete() {
    if (!nearSchool || journeyCompleted) return;
    setJourneyCompleted(true);
    const now = new Date();
    setCompletedTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }));
  }

  return (
    <div className="min-h-full w-full bg-[#0F172A] text-white flex flex-col">

      {/* Header */}
      <header className="px-4 py-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-100">Driver Portal</h1>
            <p className="text-xs text-slate-400">{DRIVER_NAME} · {DRIVER_PLATE}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-green-500/15 border border-green-500/30 px-3 py-1 text-xs font-semibold text-green-400">
              ● LIVE
            </div>
            <div className="rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200">
              {boardedCount}/{totalCount}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Start Journey Button */}
        <div>
          {!journeyStarted ? (
            <button
              onClick={handleStartJourney}
              className="w-full rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 py-4 text-center font-bold text-white shadow-lg shadow-green-900/40 transition-all active:scale-[0.98]"
            >
              <span className="text-xl mr-2">🚦</span>
              Start Journey
            </button>
          ) : (
            <div className="space-y-3">
              {/* Journey Started card */}
              <div className="rounded-2xl bg-green-900/30 border border-green-700/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-white text-lg font-bold">
                    ✓
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-green-300">Journey Started · {journeyTime}</p>
                    <p className="text-xs text-green-500/80">Students, staff & admin have been notified</p>
                  </div>
                </div>
                {/* Who was notified */}
                <div className="mt-3 pt-3 border-t border-green-800/40">
                  <p className="text-[10px] text-green-600 uppercase tracking-wider font-semibold mb-2">Notifications sent to</p>
                  <div className="flex flex-wrap gap-1.5">
                    {passengers?.slice(0, 6).map((p) => (
                      <div key={p.id} className="flex items-center gap-1 rounded-full bg-green-900/40 border border-green-700/30 px-2 py-0.5">
                        <Avatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                        <span className="text-[10px] text-green-200">{p.name.split(" ")[0]}</span>
                        <span className="text-[9px] text-green-500">✓</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1 rounded-full bg-blue-900/40 border border-blue-700/30 px-2.5 py-0.5">
                      <span className="text-[10px] text-blue-300">🏫 Admin ✓</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Journey Completed — locked until bus is within 200 m of school */}
              {!journeyCompleted ? (
                <div className="space-y-1">
                  <button
                    onClick={handleJourneyComplete}
                    disabled={!nearSchool}
                    className={`w-full rounded-2xl py-4 text-center font-bold text-white shadow-lg transition-all active:scale-[0.98] ${
                      nearSchool
                        ? "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-900/40"
                        : "bg-slate-700 cursor-not-allowed opacity-50"
                    }`}
                  >
                    <span className="text-xl mr-2">🏁</span>
                    Journey Completed
                  </button>
                  {!nearSchool && (
                    <p className="text-center text-[10px] text-slate-500">
                      🔒 Unlocks within 200 m of school — navigate to the last stop
                    </p>
                  )}
                </div>
              ) : (
                /* Completion confirmed card */
                <div className="rounded-2xl bg-red-900/20 border border-red-700/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white text-lg font-bold">
                      🏁
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-red-300">Journey Completed · {completedTime}</p>
                      <p className="text-xs text-red-500/80">All passengers & admin notified</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-red-800/40">
                    <p className="text-[10px] text-red-500 uppercase tracking-wider font-semibold mb-2">Arrival notification sent to</p>
                    <div className="flex flex-wrap gap-1.5">
                      {passengers?.filter((p) => p.status === "boarded").slice(0, 6).map((p) => (
                        <div key={p.id} className="flex items-center gap-1 rounded-full bg-red-900/30 border border-red-700/30 px-2 py-0.5">
                          <Avatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                          <span className="text-[10px] text-red-200">{p.name.split(" ")[0]}</span>
                          <span className="text-[9px] text-red-400">✓</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-1 rounded-full bg-blue-900/40 border border-blue-700/30 px-2.5 py-0.5">
                        <span className="text-[10px] text-blue-300">🏫 Admin ✓</span>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-purple-900/40 border border-purple-700/30 px-2.5 py-0.5">
                        <span className="text-[10px] text-purple-300">👨‍👩‍👧 Parents ✓</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Safety Scorecard */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Driver Safety Score</p>
          <div className="flex items-center gap-4">
            <ScoreRing score={SAFETY_SCORE} />
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-800 p-2.5 text-center">
                <p className="text-xs text-slate-400">Speed</p>
                <p className="text-base font-bold text-slate-100">{SPEED_KMH}</p>
                <p className="text-[9px] text-slate-500">km/h</p>
              </div>
              <div className="rounded-xl bg-slate-800 p-2.5 text-center">
                <p className="text-xs text-slate-400">Distance</p>
                <p className="text-base font-bold text-slate-100">{DISTANCE_KM}</p>
                <p className="text-[9px] text-slate-500">km today</p>
              </div>
              <div className="rounded-xl bg-slate-800 p-2.5 text-center">
                <p className="text-xs text-slate-400">Trips</p>
                <p className="text-base font-bold text-slate-100">{TRIPS_TODAY}</p>
                <p className="text-[9px] text-slate-500">done</p>
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="flex-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs flex items-center gap-1.5">
              <span className="text-green-400">✓</span><span className="text-slate-300">No harsh braking</span>
            </div>
            <div className="flex-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs flex items-center gap-1.5">
              <span className="text-green-400">✓</span><span className="text-slate-300">Speed within limit</span>
            </div>
          </div>
        </div>

        {/* Route Navigator */}
        <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Route Navigator</p>
            <span className="text-xs text-amber-400 font-medium">Stop {stationIdx + 1}/{stations?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setStationIdx((i) => Math.max(0, i - 1))} disabled={stationIdx === 0}
              className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-600 disabled:opacity-30 transition-colors">
              ← Prev
            </button>
            <div className="text-center flex-1">
              <p className="font-bold text-amber-400 text-base">{currentStation?.name || "—"}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Tap Next when departing</p>
            </div>
            <button onClick={() => setStationIdx((i) => Math.min((stations?.length ?? 1) - 1, i + 1))}
              disabled={stationIdx === (stations?.length ?? 1) - 1}
              className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-600 disabled:opacity-30 transition-colors">
              Next →
            </button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {stations?.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${
                i < stationIdx ? "w-4 bg-green-500" : i === stationIdx ? "w-6 bg-amber-500" : "w-1.5 bg-slate-600"
              }`} />
            ))}
          </div>
        </div>

        {/* DND */}
        {SPEED_KMH > 20 && (
          <div className="rounded-xl bg-red-900/20 border border-red-700/30 px-4 py-2.5 flex items-center gap-2">
            <span className="text-sm">🔕</span>
            <p className="text-xs text-red-300 font-medium">DND Active — Vehicle in motion. Messages queued as voice notes.</p>
          </div>
        )}

        {/* Live Today */}
        {liveTodayPassengers.length > 0 && (
          <div className="rounded-2xl bg-green-900/20 border border-green-700/30 p-3">
            <p className="text-xs font-semibold text-green-400 mb-2 uppercase tracking-wider">✅ Confirmed Riding Today</p>
            <div className="flex flex-wrap gap-2">
              {liveTodayPassengers.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5 rounded-full bg-green-900/40 px-2.5 py-1 border border-green-700/30">
                  <Avatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                  <span className="text-xs text-green-200 font-medium">{p.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* On Leave */}
        {onLeavePassengers.length > 0 && (
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700 p-3">
            <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">🏠 Not Riding Today</p>
            <div className="flex flex-wrap gap-2">
              {onLeavePassengers.map((p) => (
                <span key={p.id} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-400">{p.name.split(" ")[0]}</span>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {withMessages.filter(p => p.quickMessage !== "Staying home today").length > 0 && (
          <div className="rounded-2xl bg-blue-900/10 border border-blue-700/20 p-3">
            <p className="text-xs font-semibold text-blue-400 mb-2 uppercase tracking-wider">💬 Messages</p>
            <div className="space-y-2">
              {withMessages.filter(p => p.quickMessage !== "Staying home today").map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Avatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{p.name}</p>
                    <p className="text-xs text-blue-300">"{p.quickMessage}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Passenger Checklist */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Passenger Checklist</p>
          <div className="space-y-2">
            {passengers?.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 rounded-2xl p-3 border transition-all ${
                p.status === "boarded" ? "bg-emerald-900/20 border-emerald-700/30"
                  : p.quickMessage === "Staying home today" ? "bg-slate-800/40 border-slate-700/40 opacity-60"
                  : "bg-slate-800 border-slate-700"
              }`}>
                <Avatar name={p.name} photoUrl={p.photoUrl} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-100 text-sm">{p.name}</p>
                    {p.liveToday === 1 && (
                      <span className="rounded-full bg-green-800/50 border border-green-700/40 px-1.5 py-0.5 text-[9px] text-green-300 font-bold">LIVE</span>
                    )}
                    <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] text-slate-400 capitalize">{p.role}</span>
                  </div>
                  <p className="text-xs text-slate-400">{p.stationName}</p>
                  {p.quickMessage && <p className="text-[10px] text-blue-400 italic mt-0.5 truncate">"{p.quickMessage}"</p>}
                </div>
                {p.status === "boarded" ? (
                  <button
                    onClick={() => handleUnboard(p.id)}
                    disabled={unboardingId === p.id}
                    title="Tap to unboard"
                    className="shrink-0 rounded-xl bg-emerald-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 transition-colors group"
                  >
                    {unboardingId === p.id ? "…" : <span><span className="group-hover:hidden">✓ Boarded</span><span className="hidden group-hover:inline">✕ Unboard</span></span>}
                  </button>
                ) : p.quickMessage === "Staying home today" ? (
                  <span className="shrink-0 rounded-xl bg-slate-700 px-3 py-1.5 text-xs text-slate-400">On Leave</span>
                ) : (
                  <button onClick={() => handleBoard(p.id)} disabled={boardingId === p.id}
                    className="shrink-0 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50 transition-colors">
                    {boardingId === p.id ? "…" : "Board ✓"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Message + SOS footer */}
      <div className="p-4 border-t border-slate-700 bg-slate-900/50 space-y-2">

        {/* Last sent confirmation */}
        {lastSent && (
          <div className="flex items-center gap-2 rounded-xl bg-blue-900/30 border border-blue-700/30 px-3 py-2">
            <span className="text-sm">📨</span>
            <p className="text-xs text-blue-300 flex-1 truncate">Sent: "{lastSent}"</p>
            <button onClick={() => setLastSent(null)} className="text-slate-500 text-xs hover:text-slate-400">✕</button>
          </div>
        )}

        {/* Report to Admin button */}
        <button onClick={() => setQuickMsgOpen(true)}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 py-3.5 text-center font-bold text-white shadow-lg transition-all active:scale-[0.98]">
          <span className="text-lg mr-2">📢</span>
          Report to Admin
        </button>

        <button onClick={() => setSosActive((v) => !v)}
          className={`w-full rounded-2xl py-4 text-center font-bold text-white transition-all ${
            sosActive ? "bg-red-800 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse"
              : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-lg"
          }`}>
          {sosActive ? "🚨 SOS SENT — Admin & Parents Alerted" : "🆘 SOS EMERGENCY"}
        </button>
      </div>

      {/* Quick Message Sheet */}
      {quickMsgOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setQuickMsgOpen(false); }}>
          <div className="w-full max-w-md rounded-t-3xl bg-[#1e293b] border-t border-slate-700 shadow-2xl">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-slate-600" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
              <div>
                <h2 className="text-base font-bold text-slate-100">📢 Report to Admin</h2>
                <p className="text-xs text-slate-400">Tap a message or write your own</p>
              </div>
              <button onClick={() => setQuickMsgOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-slate-400 hover:bg-slate-600 text-sm">
                ✕
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Preset chips */}
              <div className="grid grid-cols-2 gap-2">
                {QUICK_MESSAGES.map((m) => (
                  <button key={m.text}
                    onClick={() => {
                      sendDriverMessage({ driverName: DRIVER_NAME, vehiclePlate: DRIVER_PLATE, text: m.text, isCustom: false });
                      setLastSent(m.text);
                      setQuickMsgOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors active:bg-slate-500">
                    <span className="text-base shrink-0">{m.emoji}</span>
                    <span className="leading-snug">{m.text}</span>
                  </button>
                ))}
              </div>

              {/* Custom message */}
              <div>
                <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Custom Message</p>
                <div className="flex gap-2">
                  <input
                    value={customMsg}
                    onChange={(e) => setCustomMsg(e.target.value)}
                    placeholder="Describe the issue…"
                    className="flex-1 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customMsg.trim()) {
                        sendDriverMessage({ driverName: DRIVER_NAME, vehiclePlate: DRIVER_PLATE, text: customMsg.trim(), isCustom: true });
                        setLastSent(customMsg.trim());
                        setCustomMsg("");
                        setQuickMsgOpen(false);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!customMsg.trim()) return;
                      sendDriverMessage({ driverName: DRIVER_NAME, vehiclePlate: DRIVER_PLATE, text: customMsg.trim(), isCustom: true });
                      setLastSent(customMsg.trim());
                      setCustomMsg("");
                      setQuickMsgOpen(false);
                    }}
                    disabled={!customMsg.trim()}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40 transition-colors">
                    Send
                  </button>
                </div>
              </div>
            </div>
            <div className="pb-6" />
          </div>
        </div>
      )}
    </div>
  );
}
