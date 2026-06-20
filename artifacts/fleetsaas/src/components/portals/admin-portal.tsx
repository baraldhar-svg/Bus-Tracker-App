import { useListStations, useListAnnouncements, useListPassengers } from "@workspace/api-client-react";

const STATUS_STYLES: Record<string, string> = {
  boarded: "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  leave: "bg-gray-100 text-gray-600 border-gray-200",
};
const STATUS_LABELS: Record<string, string> = {
  boarded: "✓ Boarded",
  pending: "Pending",
  leave: "Not riding",
};

function PassengerAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const src =
    photoUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0F172A&textColor=D97706&fontSize=36`;
  return (
    <img
      src={src}
      alt={name}
      className="h-9 w-9 rounded-full border border-border object-cover shrink-0"
    />
  );
}

export default function AdminPortal() {
  const { data: stations } = useListStations();
  const { data: announcements } = useListAnnouncements();
  const { data: passengers } = useListPassengers();

  const boardedCount = passengers?.filter((p) => p.status === "boarded").length ?? 0;
  const liveTodayCount = passengers?.filter((p) => p.liveToday === 1).length ?? 0;
  const messageCount = passengers?.filter((p) => p.quickMessage).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[800px] p-4 sm:p-6">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
          Himalayan Edu Bus
        </span>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-primary">{boardedCount}</p>
          <p className="text-xs text-muted-foreground mt-1">On Board</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{liveTodayCount}</p>
          <p className="text-xs text-green-600 mt-1">Live Today</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{messageCount}</p>
          <p className="text-xs text-blue-600 mt-1">Messages</p>
        </div>
      </div>

      {/* Passenger Status Table */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm mb-6">
        <h2 className="mb-4 text-lg font-semibold text-primary">Passenger Status</h2>
        <div className="space-y-2">
          {passengers?.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
            >
              <PassengerAvatar name={p.name} photoUrl={p.photoUrl} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground capitalize">
                    {p.role}
                  </span>
                  {p.liveToday === 1 && (
                    <span className="rounded-full bg-green-100 border border-green-300 px-2 py-0.5 text-[10px] text-green-700 font-semibold">
                      ✅ Live Today
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{p.stationName}</p>
                {p.quickMessage && (
                  <p className="text-xs text-blue-600 italic mt-0.5">💬 "{p.quickMessage}"</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  STATUS_STYLES[p.status] ?? STATUS_STYLES.pending
                }`}
              >
                {STATUS_LABELS[p.status] ?? p.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Geofence Stations */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-primary">Geofence Stations</h2>
          <div className="space-y-2">
            {stations?.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md bg-muted p-2">
                <span className="text-amber-500">📍</span>
                <span className="text-sm font-medium">{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Announcements */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-primary">Announcements</h2>
          <div className="space-y-2">
            {announcements?.map((a) => (
              <div key={a.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900">
                <p className="text-sm">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
