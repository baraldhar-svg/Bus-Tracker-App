import { useState, useCallback } from "react";
import { useListStations, useListAnnouncements, useListPassengers, useListDrivers, getListPassengersQueryKey, getListDriversQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiDelete(path: string) {
  const res = await fetch(`${BASE}/api${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed");
}

// Simulated fleet data
const FLEET_VEHICLES = [
  { id: 1, plate: "BA 1 KHA 1234", driver: "Ram Bahadur", speed: 38, route: "B4 - Koteshwor", status: "on-route", fuel: 72, nextService: 3200 },
  { id: 2, plate: "BA 2 CHA 5678", driver: "Hari Prasad", speed: 0, route: "B2 - Kalanki", status: "depot", fuel: 45, nextService: 800 },
  { id: 3, plate: "BA 3 JA 9012", driver: "Sita Rai", speed: 29, route: "B7 - Patan", status: "on-route", fuel: 88, nextService: 5100 },
];

const DRIVER_SCORES = [
  { name: "Ram Bahadur", score: 91, trips: 14, harsh: 0 },
  { name: "Hari Prasad", score: 74, trips: 11, harsh: 3 },
  { name: "Sita Rai", score: 97, trips: 16, harsh: 0 },
];

const STATUS_STYLES: Record<string, string> = {
  boarded: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  pending: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  leave: "bg-gray-100 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
};
const STATUS_LABELS: Record<string, string> = { boarded: "✓ Boarded", pending: "Pending", leave: "On Leave" };

function PassengerAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const src = photoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0F172A&textColor=D97706&fontSize=36`;
  return <img src={src} alt={name} className="h-9 w-9 rounded-full border border-border object-cover shrink-0" />;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 85 ? "text-green-600 bg-green-100 dark:bg-green-950/40 border-green-200 dark:border-green-800"
    : score >= 70 ? "text-amber-600 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"
    : "text-red-600 bg-red-100 dark:bg-red-950/40 border-red-200 dark:border-red-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}>{score}/100</span>;
}

type Modal = "add-passenger" | "add-driver" | "edit-passenger" | "edit-driver" | null;

export default function AdminPortal() {
  const { data: stations } = useListStations();
  const { data: announcements } = useListAnnouncements();
  const { data: passengers, refetch: refetchPassengers } = useListPassengers();
  const { data: drivers, refetch: refetchDrivers } = useListDrivers();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Add Passenger form
  const [pName, setPName] = useState("");
  const [pRole, setPRole] = useState("student");
  const [pStation, setPStation] = useState("1");
  const [pPhoto, setPPhoto] = useState("");

  // Add Driver form
  const [dName, setDName] = useState("");
  const [dPhone, setDPhone] = useState("");
  const [dVehicle, setDVehicle] = useState("");

  const boardedCount = passengers?.filter((p) => p.status === "boarded").length ?? 0;
  const liveTodayCount = passengers?.filter((p) => p.liveToday === 1).length ?? 0;
  const onLeaveCount = passengers?.filter((p) => p.quickMessage === "Staying home today").length ?? 0;
  const onRouteCount = FLEET_VEHICLES.filter(v => v.status === "on-route").length;

  const handleAddPassenger = useCallback(async () => {
    setErr(""); setLoading(true);
    try {
      await apiPost("/passengers", { name: pName, role: pRole, stationId: Number(pStation), photoUrl: pPhoto || undefined });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
      refetchPassengers();
      setModal(null); setPName(""); setPRole("student"); setPPhoto("");
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [pName, pRole, pStation, pPhoto, queryClient, refetchPassengers]);

  const handleAddDriver = useCallback(async () => {
    setErr(""); setLoading(true);
    try {
      await apiPost("/drivers", { name: dName, phone: dPhone, vehicleNumber: dVehicle });
      queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
      refetchDrivers();
      setModal(null); setDName(""); setDPhone(""); setDVehicle("");
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [dName, dPhone, dVehicle, queryClient, refetchDrivers]);

  return (
    <div className="mx-auto w-full max-w-[860px] p-4 sm:p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Himalayan Edu Transport · Real-time Overview</p>
        </div>
        <span className="rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
          Gold Plan
        </span>
      </header>

      {/* Key Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "On Board", value: boardedCount, color: "text-primary", bg: "bg-card" },
          { label: "Live Today", value: liveTodayCount, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
          { label: "On Leave", value: onLeaveCount, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/20" },
          { label: "Buses Active", value: onRouteCount, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-border ${s.bg} p-4 text-center shadow-sm`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Passengers Management */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-primary">Passengers</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{passengers?.length ?? 0} students & staff</p>
          </div>
          <button onClick={() => { setModal("add-passenger"); setErr(""); }}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400 transition-colors">
            + Add Student/Staff
          </button>
        </div>
        <div className="divide-y divide-border">
          {passengers?.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <PassengerAvatar name={p.name} photoUrl={p.photoUrl} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <span className="rounded-full bg-muted border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground capitalize">{p.role}</span>
                  {p.liveToday === 1 && (
                    <span className="rounded-full bg-green-100 dark:bg-green-950/40 border border-green-300 dark:border-green-700 px-1.5 py-0.5 text-[9px] text-green-700 dark:text-green-400 font-bold">LIVE</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{p.stationName}</p>
                {p.quickMessage && <p className="text-[10px] text-blue-500 italic truncate">💬 "{p.quickMessage}"</p>}
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[p.status] ?? STATUS_STYLES.pending}`}>
                {STATUS_LABELS[p.status] ?? p.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Drivers Management */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-primary">Drivers</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{drivers?.length ?? 0} registered drivers</p>
          </div>
          <button onClick={() => { setModal("add-driver"); setErr(""); }}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
            + Add Driver
          </button>
        </div>
        <div className="divide-y divide-border">
          {drivers?.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <img
                src={d.photoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(d.name)}&backgroundColor=0F172A&textColor=D97706`}
                alt={d.name}
                className="h-10 w-10 rounded-full border border-border object-cover shrink-0"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.phone} · {d.vehicleNumber}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                d.isActive
                  ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                  : "bg-muted text-muted-foreground border-border"
              }`}>
                {d.isActive ? "● Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Fleet Status */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">Fleet Status</h2>
          <span className="text-xs text-muted-foreground">{onRouteCount} of {FLEET_VEHICLES.length} on route</span>
        </div>
        <div className="divide-y divide-border">
          {FLEET_VEHICLES.map((v) => (
            <div key={v.id} className="flex items-center gap-4 px-5 py-3">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${v.status === "on-route" ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{v.plate}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${v.status === "on-route" ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" : "bg-muted text-muted-foreground border-border"}`}>
                    {v.status === "on-route" ? "On Route" : "At Depot"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{v.driver} · {v.route}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-right">
                <div>
                  <p className="text-xs text-muted-foreground">Speed</p>
                  <p className={`text-sm font-bold ${v.speed > 50 ? "text-red-500" : "text-foreground"}`}>{v.speed} km/h</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fuel</p>
                  <div className="flex items-center gap-1">
                    <div className="w-12 h-1.5 rounded-full bg-border overflow-hidden">
                      <div className={`h-full rounded-full ${v.fuel < 30 ? "bg-red-500" : v.fuel < 60 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${v.fuel}%` }} />
                    </div>
                    <p className="text-xs font-medium text-foreground">{v.fuel}%</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Driver Safety Scores */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">Driver Safety Scores</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Monthly monitoring · AI-analyzed driving behavior</p>
        </div>
        <div className="divide-y divide-border">
          {DRIVER_SCORES.map((d) => (
            <div key={d.name} className="flex items-center gap-4 px-5 py-3">
              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(d.name)}&backgroundColor=0F172A&textColor=D97706&fontSize=36`} alt={d.name} className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{d.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground">{d.trips} trips</span>
                  {d.harsh > 0 ? <span className="text-[10px] text-red-500 font-semibold">⚠️ {d.harsh} harsh events</span> : <span className="text-[10px] text-green-500 font-semibold">✓ Clean</span>}
                </div>
              </div>
              <ScoreBadge score={d.score} />
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">Maintenance & Fuel Reminders</h2>
        </div>
        <div className="divide-y divide-border">
          {FLEET_VEHICLES.map((v) => (
            <div key={v.id} className="flex items-center gap-4 px-5 py-3">
              <span className="text-xl shrink-0">{v.nextService < 1000 ? "🔧" : "🚗"}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{v.plate}</p>
                <p className="text-xs text-muted-foreground">Next service in {v.nextService.toLocaleString()} km</p>
              </div>
              <div className="flex items-center gap-2">
                {v.nextService < 1000 && <span className="rounded-full bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">Due Soon</span>}
                {v.fuel < 50 && <span className="rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">Low Fuel</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom two-column */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Stations */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border"><h2 className="font-semibold text-primary">Geofence Stations</h2></div>
          <div className="divide-y divide-border">
            {stations?.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-amber-500 shrink-0">📍</span>
                <p className="text-sm text-foreground">{s.name}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Announcements */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border"><h2 className="font-semibold text-primary">Announcements</h2></div>
          <div className="p-4 space-y-2">
            {announcements?.map((a) => (
              <div key={a.id} className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-3 text-red-900 dark:text-red-300">
                <p className="text-sm">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL: Add Passenger */}
      {modal === "add-passenger" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-primary">Add Student / Staff</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Full Name</label>
              <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Priya Maharjan"
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Role</label>
                <select value={pRole} onChange={(e) => setPRole(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Station</label>
                <select value={pStation} onChange={(e) => setPStation(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                  {stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Photo URL (optional)</label>
              <input value={pPhoto} onChange={(e) => setPPhoto(e.target.value)} placeholder="https://..."
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleAddPassenger} disabled={!pName || loading}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                {loading ? "Adding…" : "Add Member"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Driver */}
      {modal === "add-driver" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-primary">Add Driver</h3>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Driver Name</label>
              <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Ramesh Tamang"
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Phone Number</label>
              <input value={dPhone} onChange={(e) => setDPhone(e.target.value)} placeholder="+977 98XXXXXXXX"
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Vehicle / Plate Number</label>
              <input value={dVehicle} onChange={(e) => setDVehicle(e.target.value)} placeholder="BA 4 KHA 5678"
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleAddDriver} disabled={!dName || !dPhone || !dVehicle || loading}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {loading ? "Adding…" : "Add Driver"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
