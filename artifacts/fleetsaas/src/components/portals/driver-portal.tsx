import { useState } from "react";
import { useListStations, useListPassengers, useBoardPassenger, getListPassengersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// Safety score data (simulated)
const SAFETY_SCORE = 91;
const SPEED_KMH = 38;
const DISTANCE_KM = 12.4;
const TRIPS_TODAY = 2;

function Avatar({ name, photoUrl, size = "md" }: { name: string; photoUrl?: string | null; size?: "sm" | "md" }) {
  const src =
    photoUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1e293b&textColor=f59e0b&fontSize=36`;
  const cls = size === "sm" ? "h-9 w-9" : "h-12 w-12";
  return (
    <img
      src={src}
      alt={name}
      className={`${cls} rounded-full border-2 border-slate-600 object-cover shrink-0`}
    />
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 85 ? "#22c55e" : score >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#1e293b" strokeWidth="5" />
      <circle
        cx="32" cy="32" r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
      <text x="32" y="36" textAnchor="middle" fontSize="13" fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

export default function DriverPortal() {
  const { data: stations } = useListStations();
  const { data: passengers, refetch } = useListPassengers();
  const boardPassenger = useBoardPassenger();
  const queryClient = useQueryClient();

  const [stationIdx, setStationIdx] = useState(0);
  const [boardingId, setBoardingId] = useState<number | null>(null);
  const [sosActive, setSosActive] = useState(false);

  const currentStation = stations?.[stationIdx];
  const boardedCount = passengers?.filter((p) => p.status === "boarded").length ?? 0;
  const totalCount = passengers?.length ?? 0;
  const liveTodayPassengers = passengers?.filter((p) => p.liveToday === 1) ?? [];
  const withMessages = passengers?.filter((p) => p.quickMessage) ?? [];
  const onLeavePassengers = passengers?.filter((p) => p.quickMessage === "Staying home today") ?? [];

  const handleBoard = async (id: number) => {
    setBoardingId(id);
    try {
      await boardPassenger.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
      refetch();
    } finally {
      setBoardingId(null);
    }
  };

  return (
    <div className="min-h-full w-full bg-[#0F172A] text-white flex flex-col">

      {/* Header */}
      <header className="px-4 py-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-100">Driver Portal</h1>
            <p className="text-xs text-slate-400">Ram Bahadur · BA 1 KHA 1234</p>
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
              <span className="text-green-400">✓</span>
              <span className="text-slate-300">No harsh braking</span>
            </div>
            <div className="flex-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs flex items-center gap-1.5">
              <span className="text-green-400">✓</span>
              <span className="text-slate-300">Speed within limit</span>
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
            <button
              onClick={() => setStationIdx((i) => Math.max(0, i - 1))}
              disabled={stationIdx === 0}
              className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-600 disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <div className="text-center flex-1">
              <p className="font-bold text-amber-400 text-base">{currentStation?.name || "—"}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Tap Next when departing</p>
            </div>
            <button
              onClick={() => setStationIdx((i) => Math.min((stations?.length ?? 1) - 1, i + 1))}
              disabled={stationIdx === (stations?.length ?? 1) - 1}
              className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-600 disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
          {/* Route progress dots */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {stations?.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i < stationIdx ? "w-4 bg-green-500" :
                  i === stationIdx ? "w-6 bg-amber-500" : "w-1.5 bg-slate-600"
                }`}
              />
            ))}
          </div>
        </div>

        {/* DND Notice when driving */}
        {SPEED_KMH > 20 && (
          <div className="rounded-xl bg-red-900/20 border border-red-700/30 px-4 py-2.5 flex items-center gap-2">
            <span className="text-sm">🔕</span>
            <p className="text-xs text-red-300 font-medium">DND Active — Vehicle in motion. Messages queued as voice notes.</p>
          </div>
        )}

        {/* Live Today Alerts */}
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
                <span key={p.id} className="rounded-full bg-slate-700 px-3 py-1 text-xs text-slate-400">
                  {p.name.split(" ")[0]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Student Messages */}
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
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-2xl p-3 border transition-all ${
                  p.status === "boarded"
                    ? "bg-emerald-900/20 border-emerald-700/30"
                    : p.quickMessage === "Staying home today"
                    ? "bg-slate-800/40 border-slate-700/40 opacity-60"
                    : "bg-slate-800 border-slate-700"
                }`}
              >
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
                  {p.quickMessage && (
                    <p className="text-[10px] text-blue-400 italic mt-0.5 truncate">"{p.quickMessage}"</p>
                  )}
                </div>
                {p.status === "boarded" ? (
                  <span className="shrink-0 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">
                    ✓ Boarded
                  </span>
                ) : p.quickMessage === "Staying home today" ? (
                  <span className="shrink-0 rounded-xl bg-slate-700 px-3 py-1.5 text-xs text-slate-400">
                    On Leave
                  </span>
                ) : (
                  <button
                    onClick={() => handleBoard(p.id)}
                    disabled={boardingId === p.id}
                    className="shrink-0 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 active:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {boardingId === p.id ? "…" : "Board ✓"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SOS Button */}
      <div className="p-4 border-t border-slate-700 bg-slate-900/50">
        <button
          onClick={() => setSosActive((v) => !v)}
          className={`w-full rounded-2xl py-4 text-center font-bold text-white transition-all ${
            sosActive
              ? "bg-red-800 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse"
              : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-lg"
          }`}
        >
          {sosActive ? "🚨 SOS SENT — Admin & Parents Alerted" : "🆘 SOS EMERGENCY"}
        </button>
      </div>
    </div>
  );
}
