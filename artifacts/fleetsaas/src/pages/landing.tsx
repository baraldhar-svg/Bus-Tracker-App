import { useState } from "react";
import { useLocation } from "wouter";
import { useListVehicles } from "@workspace/api-client-react";

export default function Landing() {
  const [, navigate] = useLocation();
  const { data: vehicles } = useListVehicles();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = vehicles?.find((v) => v.id === selectedId);

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#0F172A]">
      {/* Top Nav */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center">
            <div className="bus-logo-bounce text-3xl">🚌</div>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">
              Orbit<span className="text-amber-400">Track</span>
            </h1>
            <p className="text-[10px] font-medium text-slate-400 -mt-0.5">Nepal's Smart Bus Platform</p>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-8 text-center">
        {/* Big animated bus */}
        <div className="mb-6 flex items-center justify-center">
          <div className="relative">
            <div className="bus-float text-[96px] drop-shadow-2xl">🚌</div>
            <div className="absolute -right-3 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-xs animate-pulse shadow-lg shadow-green-500/50">
              📍
            </div>
          </div>
        </div>

        <h2 className="mb-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
          Track Every Bus.
          <br />
          <span className="text-amber-400">Every Stop. In Real Time.</span>
        </h2>
        <p className="mb-8 max-w-md text-base text-slate-400 leading-relaxed">
          OrbitTrack connects students, drivers and school admins with live GPS tracking, OTP boarding, geofencing alerts and smart fleet management — built for Nepal.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => navigate("/auth?mode=register")}
            className="rounded-2xl bg-amber-500 px-8 py-3.5 text-base font-bold text-slate-900 shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-all hover:scale-105"
          >
            Get Started Free
          </button>
          <button
            onClick={() => navigate("/auth?mode=login")}
            className="rounded-2xl border border-slate-600 px-8 py-3.5 text-base font-semibold text-slate-200 hover:border-amber-500 hover:text-amber-400 transition-colors"
          >
            Sign In
          </button>
        </div>
      </main>

      {/* Fleet Picker */}
      {vehicles && vehicles.length > 0 && (
        <div className="relative z-10 px-4 pb-6">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
            Live Fleet · {vehicles.length} Buses
          </p>

          {/* Scrolling bus cards */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory px-1">
            {vehicles.map((v) => {
              const isSelected = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(isSelected ? null : v.id)}
                  className={`snap-center shrink-0 w-44 rounded-2xl border p-4 text-left transition-all duration-200 ${
                    isSelected
                      ? "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/20"
                      : "border-slate-700 bg-slate-800/60 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">🚌</span>
                    <span className={`h-2 w-2 rounded-full ${v.isActive ? "bg-green-500 animate-pulse" : "bg-slate-600"}`} />
                  </div>
                  {v.tag && (
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isSelected ? "text-amber-400" : "text-slate-500"}`}>
                      {v.tag}
                    </p>
                  )}
                  <p className="text-xs font-bold text-white leading-tight">{v.plateNumber}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{v.model}</p>
                  <p className={`text-[10px] mt-1.5 font-semibold ${v.isActive ? "text-green-400" : "text-slate-500"}`}>
                    {v.isActive ? "● On Route" : "● At Depot"}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Selected bus detail card */}
          {selected && (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-slate-800/80 backdrop-blur p-4 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="text-4xl">🚌</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {selected.tag && <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">{selected.tag}</span>}
                  <span className={`text-[10px] font-semibold ${selected.isActive ? "text-green-400" : "text-slate-400"}`}>
                    {selected.isActive ? "● Active" : "● Inactive"}
                  </span>
                </div>
                <p className="text-sm font-bold text-white">{selected.plateNumber}</p>
                <p className="text-xs text-slate-400">{selected.model} · {selected.capacity} seats</p>
              </div>
              <button
                onClick={() => navigate("/auth?mode=login")}
                className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 transition-colors"
              >
                Track →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Feature strip */}
      <div className="relative z-10 border-t border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
          {[
            { icon: "🗺️", label: "Live GPS Tracking" },
            { icon: "🔔", label: "Geofencing Alerts" },
            { icon: "📋", label: "Boarding Checklist" },
            { icon: "🛡️", label: "Driver Safety Score" },
          ].map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-1.5 border-r border-slate-800 px-4 py-5 last:border-r-0 sm:flex-row sm:gap-3">
              <span className="text-2xl">{f.icon}</span>
              <p className="text-xs font-semibold text-slate-300 text-center sm:text-left">{f.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Animated road + bus at the bottom */}
      <div className="absolute bottom-[72px] left-0 right-0 overflow-hidden pointer-events-none">
        <div className="road-line h-0.5 w-full bg-slate-700/60" />
        <div className="absolute bottom-0 bus-drive text-4xl">🚌</div>
        <div className="absolute bottom-3 bus-drive2 text-2xl opacity-40">🚗</div>
      </div>
    </div>
  );
}
