import { useGetDashboardStats, useListTenants } from "@workspace/api-client-react";

const TIER_COLORS: Record<string, string> = {
  silver: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600",
  gold: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700",
  platinum: "bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700",
};

export default function SuperadminPortal() {
  const { data: stats } = useGetDashboardStats();
  const { data: tenants } = useListTenants();

  return (
    <div className="mx-auto w-full max-w-[700px] p-4 sm:p-6 space-y-5">
      {/* Dark themed card */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1e293b] p-6 text-white shadow-2xl border border-slate-700">

        <header className="mb-6 flex items-center gap-3 border-b border-slate-700 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-900 font-bold text-lg shadow">
            🛡️
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">SuperAdmin</h1>
            <p className="text-xs text-slate-400">Global Platform Overview</p>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          {[
            { label: "Tenants", value: stats?.totalTenants ?? 0, icon: "🏫", color: "text-slate-100" },
            { label: "Passengers", value: stats?.totalPassengers ?? 0, icon: "👥", color: "text-blue-300" },
            { label: "API Pings", value: stats?.whatsappSmsPings ?? 0, icon: "📡", color: "text-amber-300" },
            { label: "MRR (NPR)", value: `${(stats?.monthlyMrr ?? 0).toLocaleString()}`, icon: "💰", color: "text-emerald-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-800/70 border border-slate-700 p-4">
              <p className="text-xl mb-1">{s.icon}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Subscription breakdown */}
        {stats?.subscriptionBreakdown && (
          <div className="mb-6 rounded-xl bg-slate-800/50 border border-slate-700 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Subscription Tiers</p>
            <div className="flex gap-4">
              {Object.entries(stats.subscriptionBreakdown).map(([tier, count]) => (
                <div key={tier} className="flex-1 text-center">
                  <p className="text-lg font-bold text-slate-100">{count as number}</p>
                  <p className="text-xs text-slate-400 capitalize">{tier}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tenant Table */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Active Tenants</p>
          <div className="space-y-2">
            {tenants?.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl bg-slate-800/60 border border-slate-700 p-3.5 hover:bg-slate-800 transition-colors">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-amber-400 font-bold text-sm">
                  {t.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-200 text-sm truncate">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.vehicleCount} vehicles · {t.passengerCount} passengers</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${TIER_COLORS[t.subscriptionTier] ?? TIER_COLORS.silver}`}>
                  {t.subscriptionTier}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
