import { useListStations, useListPassengers } from "@workspace/api-client-react";

export default function DriverPortal() {
  const { data: stations } = useListStations();
  const { data: passengers } = useListPassengers();

  return (
    <div className="min-h-full w-full bg-[#0F172A] text-white p-4">
      <header className="mb-6 flex items-center justify-between border-b border-slate-700 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Driver Portal</h1>
          <p className="text-sm text-slate-400">Vehicle: BA 1 KHA 1234</p>
        </div>
        <div className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-400">
          ● LIVE
        </div>
      </header>

      <div className="mb-6 rounded-xl bg-slate-800 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Next Station</h2>
        <div className="flex items-center justify-between">
          <button className="rounded-md bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600">Prev</button>
          <span className="font-medium text-amber-500">{stations?.[0]?.name || "Loading..."}</span>
          <button className="rounded-md bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600">Next</button>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Passengers</h2>
        <div className="space-y-2">
          {passengers?.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-800 p-3">
              <div>
                <p className="font-medium text-slate-200">{p.name}</p>
                <p className="text-xs text-slate-400">{p.stationName}</p>
              </div>
              <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                ✓ Boarded
              </button>
            </div>
          ))}
        </div>
      </div>

      <button className="mt-8 w-full rounded-xl bg-red-600 py-4 text-center font-bold text-white hover:bg-red-500 active:bg-red-700">
        SOS EMERGENCY
      </button>
    </div>
  );
}
