import { useState } from "react";
import { useListStations, useListPassengers, useBoardPassenger } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPassengersQueryKey } from "@workspace/api-client-react";

function PassengerPhoto({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const src =
    photoUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1e293b&textColor=f59e0b&fontSize=36`;
  return (
    <img
      src={src}
      alt={name}
      className="h-12 w-12 rounded-full border-2 border-slate-600 object-cover shrink-0"
    />
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

  const boardedCount = passengers?.filter((p) => p.status === "boarded").length ?? 0;
  const totalCount = passengers?.length ?? 0;

  // Passengers with live today or quick message get highlighted
  const liveTodayPassengers = passengers?.filter((p) => p.liveToday === 1) ?? [];
  const withMessages = passengers?.filter((p) => p.quickMessage) ?? [];

  return (
    <div className="min-h-full w-full bg-[#0F172A] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-700 px-4 py-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Driver Portal</h1>
          <p className="text-sm text-slate-400">Vehicle: BA 1 KHA 1234 · Ram Bahadur</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-400">
            ● LIVE
          </div>
          <div className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
            {boardedCount}/{totalCount} aboard
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Station Navigator */}
        <div className="rounded-xl bg-slate-800 p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Current Station</h2>
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setStationIdx((i) => Math.max(0, i - 1))}
              disabled={stationIdx === 0}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-40"
            >
              ← Prev
            </button>
            <div className="text-center">
              <p className="font-semibold text-amber-400 text-lg">{currentStation?.name || "—"}</p>
              <p className="text-xs text-slate-400">Stop {stationIdx + 1} of {stations?.length ?? 0}</p>
            </div>
            <button
              onClick={() => setStationIdx((i) => Math.min((stations?.length ?? 1) - 1, i + 1))}
              disabled={stationIdx === (stations?.length ?? 1) - 1}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Live Today Alerts */}
        {liveTodayPassengers.length > 0 && (
          <div className="rounded-xl bg-green-900/30 border border-green-700/50 p-3">
            <p className="text-xs font-semibold text-green-400 mb-2">✅ Confirmed Riding Today</p>
            <div className="flex flex-wrap gap-2">
              {liveTodayPassengers.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5 rounded-full bg-green-800/50 px-2 py-1">
                  <PassengerPhoto name={p.name} photoUrl={p.photoUrl} />
                  <span className="text-xs text-green-200 font-medium">{p.name.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Messages from students */}
        {withMessages.length > 0 && (
          <div className="rounded-xl bg-blue-900/20 border border-blue-700/40 p-3">
            <p className="text-xs font-semibold text-blue-400 mb-2">💬 Student Messages</p>
            <div className="space-y-2">
              {withMessages.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <PassengerPhoto name={p.name} photoUrl={p.photoUrl} />
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Passenger Checklist</h2>
          <div className="space-y-2">
            {passengers?.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
                  p.status === "boarded"
                    ? "bg-emerald-900/30 border border-emerald-700/40"
                    : "bg-slate-800"
                }`}
              >
                {/* Photo */}
                <PassengerPhoto name={p.name} photoUrl={p.photoUrl} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-100 text-sm truncate">{p.name}</p>
                    {p.liveToday === 1 && (
                      <span className="shrink-0 rounded-full bg-green-700/50 px-1.5 py-0.5 text-[10px] text-green-300">
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">{p.stationName}</p>
                  {p.quickMessage && (
                    <p className="text-[10px] text-blue-400 italic truncate">"{p.quickMessage}"</p>
                  )}
                </div>

                {/* Status / Board button */}
                {p.status === "boarded" ? (
                  <span className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">
                    ✓ Boarded
                  </span>
                ) : (
                  <button
                    onClick={() => handleBoard(p.id)}
                    disabled={boardingId === p.id}
                    className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 active:bg-amber-700 disabled:opacity-60 transition-colors"
                  >
                    {boardingId === p.id ? "…" : "Mark Boarded"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SOS Button */}
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={() => setSosActive(true)}
          className={`w-full rounded-xl py-4 text-center font-bold text-white transition-colors ${
            sosActive ? "bg-red-800 animate-pulse" : "bg-red-600 hover:bg-red-500 active:bg-red-700"
          }`}
        >
          {sosActive ? "🚨 SOS SENT — Help on the way" : "🆘 SOS EMERGENCY"}
        </button>
      </div>
    </div>
  );
}
