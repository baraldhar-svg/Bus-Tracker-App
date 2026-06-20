import { useLocation } from "wouter";
import AppFooter from "@/components/app-footer";

export default function Landing() {
  const [, navigate] = useLocation();

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-y-scroll bg-[#0F172A] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-900 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
      {/* Top Nav */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center">
            <div className="bus-logo-bounce text-3xl">🚌</div>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">
              Orbit<span className="text-[#ffee47]">Track</span>
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
          Track Every School Bus.
          <br />
          <span className="text-[#ffee47]">Every Stop. In Real Time.</span>
        </h2>
        <p className="mb-8 max-w-md text-base text-slate-400 leading-relaxed">
          OrbitTrack connects students, drivers and school admins with live GPS tracking, OTP boarding, geofencing alerts and smart fleet management — built for Nepal.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => navigate("/auth?mode=register")}
            className="rounded-2xl px-8 py-3.5 text-base font-bold text-slate-900 shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-all hover:scale-105 bg-[#ffee47]"
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
      <AppFooter variant="dark" />
    </div>
  );
}
