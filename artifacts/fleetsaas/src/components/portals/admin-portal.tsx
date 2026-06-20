import { useListStations, useListAnnouncements } from "@workspace/api-client-react";

export default function AdminPortal() {
  const { data: stations } = useListStations();
  const { data: announcements } = useListAnnouncements();

  return (
    <div className="mx-auto w-full max-w-[800px] p-4 sm:p-6 lg:p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Client Admin Domain</span>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-primary">Geofence Stations</h2>
          <div className="space-y-2">
            {stations?.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md bg-muted p-2">
                <span className="text-sm font-medium">{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-primary">Announcements</h2>
          <div className="space-y-2">
            {announcements?.map((a) => (
              <div key={a.id} className="rounded-md bg-red-50 p-3 text-red-900">
                <p className="text-sm">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
