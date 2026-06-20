import { useGetDashboardStats, useListTenants } from "@workspace/api-client-react";

export default function SuperadminPortal() {
  const { data: stats } = useGetDashboardStats();
  const { data: tenants } = useListTenants();

  return (
    <div className="mx-auto w-full max-w-[700px] p-4 sm:p-6">
      <div className="rounded-2xl bg-[#0F172A] p-6 text-white shadow-lg">
        <header className="mb-8 flex items-center gap-3 border-b border-slate-700 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-slate-900">
            🛡️
          </div>
          <h1 className="text-2xl font-bold text-slate-100">SuperAdmin</h1>
        </header>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-xs font-medium text-slate-400">Total Tenants</p>
            <p className="mt-1 text-2xl font-bold text-slate-100">{stats?.totalTenants || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-xs font-medium text-slate-400">Total Passengers</p>
            <p className="mt-1 text-2xl font-bold text-slate-100">{stats?.totalPassengers || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-xs font-medium text-slate-400">API Pings</p>
            <p className="mt-1 text-2xl font-bold text-slate-100">{stats?.whatsappSmsPings || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-xs font-medium text-slate-400">Monthly MRR</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">NPR {stats?.monthlyMrr || 0}</p>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-200">Active Tenants</h2>
          <div className="space-y-3">
            {tenants?.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-slate-800 p-4">
                <div>
                  <p className="font-medium text-slate-200">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.vehicleCount} vehicles • {t.passengerCount} passengers</p>
                </div>
                <span className="rounded-full bg-slate-700 px-2 py-1 text-xs font-semibold text-amber-500 uppercase">
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
