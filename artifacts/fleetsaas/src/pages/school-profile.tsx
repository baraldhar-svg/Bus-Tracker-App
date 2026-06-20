import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tenant = {
  id: number;
  name: string;
  bannerUrl?: string | null;
  address?: string | null;
  contactPhone?: string | null;
  schoolCode?: string | null;
};

const MOCK_PROFILES: Record<string, Partial<Tenant>> = {
  "2": { name: "Kathmandu University", address: "Dhulikhel, Kavre", contactPhone: "+977 011-661399", bannerUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&auto=format&fit=crop&q=80" },
  "3": { name: "Rato Bangala School", address: "Patan, Lalitpur", contactPhone: "+977 01-5522446", bannerUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&auto=format&fit=crop&q=80" },
  "4": { name: "St. Xavier's College", address: "Maitighar, Kathmandu", contactPhone: "+977 01-4220760", bannerUrl: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80" },
  "5": { name: "Little Angels' School", address: "Jawalakhel, Lalitpur", contactPhone: "+977 01-5521155", bannerUrl: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&auto=format&fit=crop&q=80" },
};

export default function SchoolProfile() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [tenant, setTenant] = useState<Partial<Tenant> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id;
    if (id === "1") {
      fetch(`${BASE}/api/tenants`)
        .then((r) => r.json())
        .then((data: Tenant[]) => {
          setTenant(data.find((t) => t.id === 1) ?? null);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (MOCK_PROFILES[id]) {
      setTenant({ id: Number(id), ...MOCK_PROFILES[id] });
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [params.id]);

  return (
    <div className="min-h-[100dvh] bg-[#0F172A]">
      {/* Nav */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <button onClick={() => window.history.back()} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <div className="flex items-center gap-2">
          <span className="text-lg">🚌</span>
          <span className="font-black text-white text-sm">Orbit<span className="text-[#ffd000]">Track</span></span>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>
      ) : !tenant ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <p className="text-slate-400 text-sm">School not found</p>
          <button onClick={() => navigate("/")} className="text-amber-400 text-sm hover:text-amber-300">← Go Home</button>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl">
          {/* Banner */}
          {tenant.bannerUrl ? (
            <img src={tenant.bannerUrl} alt={tenant.name} className="w-full h-48 object-cover" />
          ) : (
            <div className="w-full h-48 bg-gradient-to-br from-amber-600 to-amber-900 flex items-center justify-center">
              <span className="text-6xl">🏫</span>
            </div>
          )}

          <div className="p-6 space-y-5">
            <div>
              <h1 className="text-2xl font-black text-white">{tenant.name}</h1>
              {tenant.address && <p className="text-sm text-slate-400 mt-1">📍 {tenant.address}</p>}
              {tenant.contactPhone && <p className="text-sm text-slate-400">📞 {tenant.contactPhone}</p>}
            </div>

            {tenant.schoolCode && (
              <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 p-4">
                <p className="text-xs font-semibold text-amber-400 mb-1">School Code</p>
                <p className="font-mono text-xl font-bold text-amber-300">{tenant.schoolCode}</p>
                <p className="text-xs text-slate-400 mt-1">Use this code when registering to join this school's fleet</p>
              </div>
            )}

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-sm font-semibold text-slate-200 mb-3">Transport Services</p>
              <div className="grid grid-cols-2 gap-2">
                {["🗺️ Live Bus Tracking", "🔔 Geofencing Alerts", "📋 Digital Attendance", "🛡️ Driver Safety"].map((f) => (
                  <div key={f} className="rounded-lg bg-slate-700/50 px-3 py-2 text-xs text-slate-300">{f}</div>
                ))}
              </div>
            </div>

            <button onClick={() => navigate("/auth?mode=register")}
              className="w-full rounded-2xl bg-amber-500 py-4 font-bold text-slate-900 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/25">
              Register with This School →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
