import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useListStations, useListAnnouncements, useListPassengers, useListDrivers, useListRoutes, useListVehicles, getListPassengersQueryKey, getListDriversQueryKey, getListRoutesQueryKey, getListStationsQueryKey, getListVehiclesQueryKey, getListAnnouncementsQueryKey, useListCalendarEvents, getListCalendarEventsQueryKey, getTenantId } from "@workspace/api-client-react";
import { CheckCircle, MapPin, Home, Bus, Upload, Camera, Pencil, AlertTriangle, Wrench, Send, MessageSquare, Megaphone, Phone, Route, Plus, Trash2, Search, Navigation, ChevronDown, ChevronUp, X, RefreshCw, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Star, Clock, Lock, User, Bell, Droplets, FileText, BarChart3, Gauge, AlertCircle, Settings2 } from "lucide-react";
import StationMapPicker from "@/components/station-map-picker";
import OsmMap, { type RouteStop } from "@/components/osm-map";
import { useLiveLocations } from "@/hooks/use-live-locations";
import { adToBs, bsToAd, getDaysInBsMonth, getFirstWeekdayOfBsMonth, todayBs, bsDateToAd, BS_MONTH_NAMES_NE, AD_MONTH_NAMES } from "@/lib/bs-calendar";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useDriverMessages } from "@/lib/driver-messages";

// 🚀 भर्सलको हल्ला छोडेर सिधै रीप्लिट ब्याकइन्डको ठेगाना हार्डकोड गरिएको
const REPLIT_BACKEND = "https://33c7862f-0438-4adc-83ae-af5ac11d06a3-00-3u2khpqjgrop5.sisko.replit.dev";

function tenantHeaders(): Record<string, string> {
  const id = getTenantId();
  return id !== null ? { "Content-Type": "application/json", "x-tenant-id": String(id) } : { "Content-Type": "application/json" };
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${REPLIT_BACKEND}/api${path}`, { method: "POST", headers: tenantHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${REPLIT_BACKEND}/api${path}`, { method: "PATCH", headers: tenantHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiDelete(path: string) {
  const id = getTenantId();
  const headers: Record<string, string> = id !== null ? { "x-tenant-id": String(id) } : {};
  await fetch(`${REPLIT_BACKEND}/api${path}`, { method: "DELETE", headers });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Live fleet vehicles are derived from real driver DB records + GPS data — no hardcoded arrays.

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

// ── CalendarManager ───────────────────────────────────────────────────────────
type CalendarEvent = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  eventDate: string;
  notified: boolean;
  autoNotify: boolean;
};

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_NE = ["आइत", "सोम", "मङ्गल", "बुध", "बिही", "शुक्र", "शनि"];

function getAdDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function getAdFirstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function CalendarManager() {
  const queryClient = useQueryClient();
  const todayB = todayBs();
  const todayAd = new Date();

  const [calSystem, setCalSystem] = useState<"bs" | "ad">("bs");

  // BS state
  const [bsYear, setBsYear] = useState(todayB.year);
  const [bsMonth, setBsMonth] = useState(todayB.month);

  // AD state
  const [adYear, setAdYear] = useState(todayAd.getFullYear());
  const [adMonth, setAdMonth] = useState(todayAd.getMonth() + 1);

  // API month query (always in AD YYYY-MM format).
  const adMonthStart = useMemo(() => {
    if (calSystem === "bs") return bsToAd(bsYear, bsMonth, 1);
    return { year: adYear, month: adMonth, day: 1 };
  }, [calSystem, bsYear, bsMonth, adYear, adMonth]);

  const adMonthEnd = useMemo(() => {
    if (calSystem === "bs") return bsToAd(bsYear, bsMonth, getDaysInBsMonth(bsYear, bsMonth));
    return { year: adYear, month: adMonth, day: 1 };
  }, [calSystem, bsYear, bsMonth, adYear, adMonth]);

  const queryMonth1 = `${adMonthStart.year}-${String(adMonthStart.month).padStart(2, "0")}`;
  const queryMonth2 = (calSystem === "bs" && adMonthEnd.month !== adMonthStart.month)
    ? `${adMonthEnd.year}-${String(adMonthEnd.month).padStart(2, "0")}`
    : null;

  const { data: eventsA, refetch: refetchA } = useListCalendarEvents({ month: queryMonth1 });
  const { data: eventsB, refetch: refetchB } = useListCalendarEvents({ month: queryMonth2 ?? queryMonth1 });

  const events = useMemo(() => {
    const all = [...(eventsA ?? []), ...(queryMonth2 ? (eventsB ?? []) : [])];
    const seen = new Set<number>();
    return all.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
  }, [eventsA, eventsB, queryMonth2]);

  function refetch() { void refetchA(); if (queryMonth2) void refetchB(); }

  const [showForm, setShowForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eType, setEType] = useState<"event" | "holiday">("event");
  const [eAutoNotify, setEAutoNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  // Switch calendar system and sync the viewed month position
  function switchTo(sys: "bs" | "ad") {
    if (sys === calSystem) return;
    if (sys === "ad") {
      const d = bsToAd(bsYear, bsMonth, 1);
      setAdYear(d.year); setAdMonth(d.month);
    } else {
      const bs = adToBs(adYear, adMonth, 1);
      setBsYear(bs.year); setBsMonth(bs.month);
    }
    setCalSystem(sys);
    setSelectedDay(null);
  }

  function prevMonth() {
    setSelectedDay(null);
    if (calSystem === "bs") {
      if (bsMonth === 1) { setBsYear(y => y - 1); setBsMonth(12); } else setBsMonth(m => m - 1);
    } else {
      if (adMonth === 1) { setAdYear(y => y - 1); setAdMonth(12); } else setAdMonth(m => m - 1);
    }
  }
  function nextMonth() {
    setSelectedDay(null);
    if (calSystem === "bs") {
      if (bsMonth === 12) { setBsYear(y => y + 1); setBsMonth(1); } else setBsMonth(m => m + 1);
    } else {
      if (adMonth === 12) { setAdYear(y => y + 1); setAdMonth(1); } else setAdMonth(m => m + 1);
    }
  }

  const daysInMonth = calSystem === "bs" ? getDaysInBsMonth(bsYear, bsMonth) : getAdDaysInMonth(adYear, adMonth);
  const firstWeekday = calSystem === "bs" ? getFirstWeekdayOfBsMonth(bsYear, bsMonth) : getAdFirstWeekday(adYear, adMonth);

  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const ev of events ?? []) {
    const parts = ev.eventDate.split("-").map(Number);
    if (calSystem === "bs") {
      const bs = adToBs(parts[0]!, parts[1]!, parts[2]!);
      if (bs.year === bsYear && bs.month === bsMonth) {
        const list = eventsByDay.get(bs.day) ?? [];
        list.push(ev as CalendarEvent);
        eventsByDay.set(bs.day, list);
      }
    } else {
      if (parts[0] === adYear && parts[1] === adMonth) {
        const list = eventsByDay.get(parts[2]!) ?? [];
        list.push(ev as CalendarEvent);
        eventsByDay.set(parts[2]!, list);
      }
    }
  }

  function isTodayCell(day: number) {
    if (calSystem === "bs") return day === todayB.day && bsMonth === todayB.month && bsYear === todayB.year;
    return day === todayAd.getDate() && adMonth === todayAd.getMonth() + 1 && adYear === todayAd.getFullYear();
  }

  const WEEKDAYS = calSystem === "bs" ? WEEKDAYS_NE : WEEKDAYS_EN;
  const headerTitle = calSystem === "bs" ? `${BS_MONTH_NAMES_NE[bsMonth - 1]} ${bsYear}` : `${AD_MONTH_NAMES[adMonth - 1]} ${adYear}`;
  const headerSubtitle = calSystem === "bs" ? `${queryMonth1.replace("-", " / ")} AD` : (() => { const bs = adToBs(adYear, adMonth, 1); return `${BS_MONTH_NAMES_NE[bs.month - 1]} ${bs.year} BS`; })();

  const selectedDayLabel = selectedDay ? calSystem === "bs" ? `${selectedDay} ${BS_MONTH_NAMES_NE[bsMonth - 1]} ${bsYear} BS` : `${selectedDay} ${AD_MONTH_NAMES[adMonth - 1]} ${adYear} AD` : "";

  function openAddForm(day: number) {
    setSelectedDay(day);
    setETitle(""); setEDesc(""); setEType("event"); setEAutoNotify(true); setFormErr("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!eTitle.trim() || !selectedDay) return;
    setFormErr(""); setSaving(true);
    try {
      const adDateStr = calSystem === "bs" ? bsDateToAd(bsYear, bsMonth, selectedDay) : `${adYear}-${String(adMonth).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
      const res = await fetch(`${REPLIT_BACKEND}/api/calendar-events`, {
        method: "POST",
        headers: tenantHeaders(),
        body: JSON.stringify({ title: eTitle.trim(), description: eDesc.trim() || undefined, type: eType, eventDate: adDateStr, autoNotify: eAutoNotify }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      queryClient.invalidateQueries({ queryKey: getListCalendarEventsQueryKey() });
      refetch();
      setShowForm(false);
    } catch (e: unknown) { setFormErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const _tid = getTenantId();
    await fetch(`${REPLIT_BACKEND}/api/calendar-events/${id}`, { method: "DELETE", headers: _tid !== null ? { "x-tenant-id": String(_tid) } : {} });
    queryClient.invalidateQueries({ queryKey: getListCalendarEventsQueryKey() });
    refetch();
  }

  const selectedDayEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-[#FFF078]" />
          <div>
            <h2 className="font-semibold text-primary">विद्यालय क्यालेन्डर</h2>
            <p className="text-xs text-muted-foreground mt-0.5">School Calendar · Events & Holidays</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-0.5 text-xs font-semibold">
          <button onClick={() => switchTo("bs")} className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "bs" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>BS</button>
          <button onClick={() => switchTo("ad")} className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "ad" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>AD</button>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors"><ChevronLeft size={16} /></button>
        <div className="text-center">
          <p className="font-bold text-sm text-foreground">{headerTitle}</p>
          <p className="text-[10px] text-muted-foreground">{headerSubtitle}</p>
        </div>
        <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors"><ChevronRight size={16} /></button>
      </div>

      <div className="flex items-center justify-center gap-2 px-5 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Today</span>
        <span className="text-xs font-bold text-foreground">{BS_MONTH_NAMES_NE[todayB.month - 1]} {todayB.day}, {todayB.year} BS</span>
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className="text-xs font-bold text-foreground">{AD_MONTH_NAMES[todayAd.getMonth()]} {todayAd.getDate()}, {todayAd.getFullYear()} AD</span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            return (
              <button key={day} onClick={() => setSelectedDay(day)} className={`relative flex flex-col items-center rounded-xl py-1.5 transition-all text-xs ${isTodayCell(day) ? "bg-amber-400 dark:bg-amber-500 text-white font-extrabold ring-2 ring-amber-500" : "hover:bg-muted text-foreground font-medium"}`}>
                <span className={isTodayCell(day) ? "text-sm" : ""}>{day}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 85 ? "text-green-600 bg-green-100 dark:bg-green-950/40 border-green-200 dark:border-green-800" : score >= 70 ? "text-amber-600 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" : "text-red-600 bg-red-100 dark:bg-red-950/40 border-red-200 dark:border-red-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}>{score}/100</span>;
}

function PhotoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  async function handleFile(file: File) { if (file) onChange(await fileToDataUrl(file)); }
  return (
    <div>
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="preview" className="h-12 w-12 rounded-full object-cover border border-border shrink-0" />
          <button onClick={() => onChange("")} className="text-xs text-red-500 hover:text-red-400">Remove</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => galleryRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors"><Upload size={13} /> Upload Photo</button>
          <button onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors"><Camera size={13} /> Take Photo</button>
        </div>
      )}
    </div>
  );
}

type Modal = "add-passenger" | "add-driver" | null;
type StatsFilter = "boarded" | "live" | "leave" | "buses" | null;
type Tenant = { id: number; name: string; address?: string | null; contactPhone?: string | null; bannerUrl?: string | null; schoolCode?: string | null; };
type LiveFleetVehicle = { id: number; plate: string; driver: string; lat: number | null; lng: number | null; status: "on-route" | "depot"; isLive: boolean; };
type Passenger = { id: number; name: string; phone?: string | null; role: string; status: string; liveToday: number; stationId: number; stationName?: string | null; quickMessage?: string | null; photoUrl?: string | null; };

function PassengerDetailCard({ p, onClose }: { p: Passenger; onClose: () => void }) {
  const initials = p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden">
        <div className="relative bg-gradient-to-br from-amber-400/20 to-amber-600/10 px-6 pt-8 pb-6 flex flex-col items-center gap-3 border-b border-border">
          <button onClick={onClose} className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground text-sm">✕</button>
          {p.photoUrl ? <img src={p.photoUrl} alt={p.name} className="h-20 w-20 rounded-full object-cover border-4 border-background shadow-2xl" /> : <div className="h-20 w-20 rounded-full border-4 border-background shadow-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center"><span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{initials}</span></div>}
          <div className="text-center"><h3 className="text-lg font-bold text-foreground">{p.name}</h3><span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-xs text-muted-foreground capitalize">{p.role}</span></div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[p.status] ?? STATUS_STYLES.pending}`}>{STATUS_LABELS[p.status] ?? p.status}</span>
        </div>
        <div className="divide-y divide-border">
          {p.phone && <div className="flex items-center gap-3 px-5 py-3"><Phone size={14} className="text-muted-foreground shrink-0" /><div><p className="text-sm font-medium text-foreground">{p.phone}</p></div></div>}
          <div className="flex items-center gap-3 px-5 py-3"><MapPin size={14} className="text-muted-foreground shrink-0" /><div><p className="text-sm font-medium text-foreground">{p.stationName ?? "—"}</p></div></div>
        </div>
      </div>
    </div>
  );
}

function StatsDetailPanel({ filter, passengers, fleetVehicles, onRouteCount, onClose }: { filter: StatsFilter; passengers: Passenger[]; fleetVehicles: LiveFleetVehicle[]; onRouteCount: number; onClose: () => void }) {
  const [selected, setSelected] = useState<Passenger | null>(null);
  const filtered = (() => {
    if (filter === "boarded") return passengers.filter((p) => p.status === "boarded");
    if (filter === "live") return passengers.filter((p) => p.liveToday === 1);
    if (filter === "leave") return passengers.filter((p) => p.quickMessage === "Staying home today");
    return [];
  })();
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl min-h-[50vh] max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <h2 className="text-base font-bold text-primary">{filter}</h2>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground text-sm">✕</button>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors">
                <PassengerAvatar name={p.name} photoUrl={p.photoUrl} />
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground truncate">{p.name}</p></div>
              </button>
            ))}
          </div>
        </div>
      </div>
      {selected && <PassengerDetailCard p={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

type DriverRow = { id: number; name: string; phone: string; vehicleNumber: string; isActive: boolean; isOnline: boolean; photoUrl?: string | null };

function DriverDetailPanel({ driver, vehicles, routes, onClose, onRefresh }: { driver: DriverRow; vehicles: VehicleRow[] | undefined; routes: RouteRow[] | undefined; onClose: () => void; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  const assignedRoutes = (routes ?? []).filter((r) => r.driverId === driver.id);
  const unassignedRoutes = (routes ?? []).filter((r) => r.driverId !== driver.id);

  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(driver.name);
  const [editPhone, setEditPhone] = useState(driver.phone);
  const [localIsActive, setLocalIsActive] = useState(driver.isActive);
  const [activeMsg, setActiveMsg] = useState("");
  const [changingVehicle, setChangingVehicle] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [assigningRoute, setAssigningRoute] = useState(false);
  const [pickRouteId, setPickRouteId] = useState("");
  const [routeErr, setRouteErr] = useState("");
  const [err, setErr] = useState("");

  async function handleSaveInfo() {
    setSaving(true); setErr("");
    try {
      await apiPatch(`/drivers/${driver.id}`, { name: editName.trim(), phone: editPhone.trim() });
      onRefresh(); setEditingName(false);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleToggleActive() {
    setSaving(true); setErr(""); setActiveMsg("");
    const next = !localIsActive;
    try {
      await apiPatch(`/drivers/${driver.id}`, { isActive: next });
      setLocalIsActive(next);
      setActiveMsg(next ? "Driver marked active — they can now log in." : "Driver marked inactive.");
      onRefresh();
    } catch { setErr("Failed to update status"); }
    finally { setSaving(false); }
  }

  async function handleChangeVehicle() {
    if (!selectedVehicleId) return;
    const v = (vehicles ?? []).find((x) => x.id === Number(selectedVehicleId));
    if (!v) return;
    setSaving(true); setErr("");
    try {
      await apiPatch(`/drivers/${driver.id}`, { vehicleNumber: v.plateNumber });
      onRefresh(); setChangingVehicle(false); setSelectedVehicleId("");
    } catch { setErr("Failed"); }
    finally { setSaving(false); }
  }

  async function handleAssignRoute() {
    if (!pickRouteId) return;
    setRouteErr(""); setSaving(true);
    try {
      await apiPatch(`/routes/${pickRouteId}`, { driverId: driver.id });
      queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
      onRefresh(); setAssigningRoute(false); setPickRouteId("");
    } catch { setRouteErr("Failed"); }
    finally { setSaving(false); }
  }

  async function handleRemoveFromRoute(routeId: number) {
    await apiPatch(`/routes/${routeId}`, { driverId: null });
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
    onRefresh();
  }

  async function handleDelete() {
    if (!confirm(`Remove driver ${driver.name}?`)) return;
    await apiDelete(`/drivers/${driver.id}`);
    queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
    onRefresh(); onClose();
  }

  const currentVehicle = (vehicles ?? []).find((v) => v.plateNumber === driver.vehicleNumber);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="h-1 w-10 rounded-full bg-border" /></div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <img src={driver.photoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(driver.name)}`} alt={driver.name} className="h-10 w-10 rounded-full border-2 border-amber-500 object-cover shrink-0" />
            <div>
              <h2 className="text-base font-bold text-foreground">{driver.name}</h2>
              <span className="text-[10px] font-semibold text-muted-foreground">{localIsActive ? "● Active" : "● Inactive"}</span>
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {err && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{err}</p>}
          <button onClick={handleToggleActive} className="w-full bg-amber-500 py-2 text-xs font-bold rounded-xl text-slate-900">{localIsActive ? "Mark Inactive" : "Mark Active"}</button>
          <button onClick={handleDelete} className="w-full bg-red-500 py-2 text-xs font-bold rounded-xl text-white">Remove Driver</button>
        </div>
      </div>
    </div>
  );
}

type PassengerRow = { id: number; name: string; phone?: string | null; photoUrl?: string | null; role: string; stationId: number; stationName?: string | null; routeId?: number | null };
type StationOption = { id: number; name: string };

function PassengerDetailPanel({ passenger, stations, routes, onClose, onRefresh }: { passenger: PassengerRow; stations: StationOption[] | undefined; routes: RouteRow[] | undefined; onClose: () => void; onRefresh: () => void }) {
  const [editName, setEditName] = useState(passenger.name);
  const [editPhone, setEditPhone] = useState(passenger.phone ?? "");
  const [editStationId, setEditStationId] = useState(String(passenger.stationId));
  const [editRouteId, setEditRouteId] = useState(String(passenger.routeId ?? ""));

  type EditRouteStation = { id: number; stationId: number; stationName: string | null; stopLabel: string | null };
  const [editRouteStations, setEditRouteStations] = useState<EditRouteStation[]>([]);
  useEffect(() => {
    if (!editRouteId) { setEditRouteStations([]); return; }
    fetch(`${REPLIT_BACKEND}/api/routes/${editRouteId}/stations`, { headers: tenantHeaders() })
      .then((r) => r.json())
      .then((data: unknown) => {
        const list = Array.isArray(data) ? (data as EditRouteStation[]) : [];
        setEditRouteStations(list);
        const stillValid = list.some((rs) => String(rs.stationId) === editStationId);
        if (!stillValid && list.length > 0) setEditStationId(String(list[0].stationId));
      })
      .catch(() => setEditRouteStations([]));
  }, [editRouteId]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true); setErr("");
    try {
      await apiPatch(`/passengers/${passenger.id}`, { name: editName.trim(), phone: editPhone.trim() || undefined, stationId: Number(editStationId), routeId: editRouteId ? Number(editRouteId) : null });
      onRefresh(); onClose();
    } catch { setErr("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${passenger.name}?`)) return;
    await fetch(`${REPLIT_BACKEND}/api/passengers/${passenger.id}`, { method: "DELETE", headers: getTenantId() !== null ? { "x-tenant-id": String(getTenantId()) } : {} });
    onRefresh(); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl flex flex-col p-5 space-y-3">
        <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full border p-2 rounded-xl bg-muted" />
        <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full border p-2 rounded-xl bg-muted" />
        <button onClick={handleSave} className="w-full bg-amber-500 py-2 rounded-xl text-slate-900 font-bold">Save Changes</button>
        <button onClick={handleDelete} className="w-full bg-red-500 py-2 rounded-xl text-white font-bold">Remove</button>
      </div>
    </div>
  );
}

function BusDetailPanel({ vehicle, onClose }: { vehicle: LiveFleetVehicle; onClose: () => void }) {
  const messages = useDriverMessages(vehicle.plate);
  const bboxLng = 0.012; const bboxLat = 0.008;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-foreground">{vehicle.plate} ({vehicle.driver})</h2>
        {vehicle.lat !== null && vehicle.lng !== null ? (
          <iframe title="map" width="100%" height="180" src={`https://www.openstreetmap.org/export/embed.html?bbox=${vehicle.lng - bboxLng},${vehicle.lat - bboxLat},${vehicle.lng + bboxLng},${vehicle.lat + bboxLat}&layer=mapnik&marker=${vehicle.lat},${vehicle.lng}`} />
        ) : <p className="text-xs italic text-muted-foreground">No GPS signal</p>}
      </div>
    </div>
  );
}

type GeocodeResult = { displayName: string; lat: number; lng: number };
type RouteStation = { id: number; routeId: number; stationId: number; position: number; direction: string; stopLabel: string | null; eta: string | null; stationName: string | null; lat: number | null; lng: number | null; radius: number | null };
type RouteRow = { id: number; name: string; driverId: number | null; vehicleId: number | null; isActive: boolean | null; driverName: string | null; vehiclePlate: string | null; departureTime?: string | null; avgSpeedKmh?: number | null };
type VehicleRow = { id: number; plateNumber: string; model: string; capacity: number; isActive: boolean; tag?: string | null };

function RouteStationsPanel({ routeId, route, vehicles, drivers, onClose, onRouteUpdated }: { routeId: number; route: RouteRow; vehicles: VehicleRow[] | undefined; drivers: Array<{ id: number; name: string }> | undefined; onClose: () => void; onRouteUpdated: () => void }) {
  const queryClient = useQueryClient();
  const { data: stations } = useListStations();
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState("");
  const [addingDir, setAddingDir] = useState<"forward" | "return">("forward");
  const [addingLabel, setAddingLabel] = useState("");
  const [addingErr, setAddingErr] = useState("");
  const [editVehicle, setEditVehicle] = useState(String(route.vehicleId ?? ""));
  const [editDriver, setEditDriver] = useState(String(route.driverId ?? ""));
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSaved, setAssignSaved] = useState(false);
  const [depTime, setDepTime] = useState(route.departureTime ?? "06:00 AM");
  const [speedKmh, setSpeedKmh] = useState(String(route.avgSpeedKmh ?? 25));
  const [etaSaving, setEtaSaving] = useState(false);
  const [etaSaved, setEtaSaved] = useState(false);
  const { data: allPassengers } = useListPassengers();
  const [mapClickPending, setMapClickPending] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [pendingMapName, setPendingMapName] = useState("");
  const [pendingMapRadius, setPendingMapRadius] = useState(100);
  const [pendingMapSaving, setPendingMapSaving] = useState(false);

  useEffect(() => {
    setEditVehicle(String(route.vehicleId ?? ""));
    setEditDriver(String(route.driverId ?? ""));
    setDepTime(route.departureTime ?? "06:00 AM");
    setSpeedKmh(String(route.avgSpeedKmh ?? 25));
  }, [route.vehicleId, route.driverId, route.departureTime, route.avgSpeedKmh]);

  const load = useCallback(async () => {
    setRouteStations([]); setLoading(true);
    try {
      const r = await fetch(`${REPLIT_BACKEND}/api/routes/${routeId}/stations`);
      setRouteStations(await r.json());
    } finally { setLoading(false); }
  }, [routeId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAssign() {
    setAssignSaving(true); setAssignSaved(false);
    try {
      await apiPatch(`/routes/${routeId}`, { vehicleId: editVehicle ? Number(editVehicle) : null, driverId: editDriver ? Number(editDriver) : null });
      onRouteUpdated(); setAssignSaved(true);
    } catch { /* ignore */ }
    finally { setAssignSaving(false); }
  }

  async function handleSaveEta() {
    setEtaSaving(true); setEtaSaved(false);
    try {
      await apiPatch(`/routes/${routeId}`, { departureTime: depTime, avgSpeedKmh: Number(speedKmh) || 25 });
      onRouteUpdated(); await load(); setEtaSaved(true);
    } catch { /* ignore */ }
    finally { setEtaSaving(false); }
  }

  async function handleAdd() {
    if (!addingId) return;
    setAddingErr("");
    const station = (stations ?? []).find((s) => s.id === Number(addingId));
    const autoLabel = addingLabel.trim() || (station ? `${station.name} (${addingDir === "forward" ? "Forward" : "Return"})` : "");
    try {
      await apiPost(`/routes/${routeId}/stations`, { stationId: Number(addingId), direction: addingDir, stopLabel: autoLabel });
      setAddingId(""); setAddingLabel(""); void load();
    } catch { setAddingErr("Failed"); }
  }

  async function handleRemove(rowId: number) {
    await apiDelete(`/routes/${routeId}/stations/${rowId}`); void load();
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
  }

  async function handleAddFromMap() {
    if (!mapClickPending) return;
    const name = pendingMapName.trim() || mapClickPending.name;
    setPendingMapSaving(true);
    try {
      const created = await apiPost("/stations", { name, lat: mapClickPending.lat, lng: mapClickPending.lng, radius: pendingMapRadius }) as { id: number };
      await apiPost(`/routes/${routeId}/stations`, { stationId: created.id, direction: "forward", stopLabel: name });
      setMapClickPending(null); setPendingMapName(""); setPendingMapRadius(100); await load();
      queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
    } catch { /* noop */ }
    finally { setPendingMapSaving(false); }
  }

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between"><p className="text-xs font-semibold">Stops ({routeStations.length})</p><button onClick={onClose}><X size={14} /></button></div>
      <div className="grid grid-cols-2 gap-2">
        <input value={depTime} onChange={e => setDepTime(e.target.value)} className="border p-2 text-xs rounded-lg" />
        <input type="number" value={speedKmh} onChange={e => setSpeedKmh(e.target.value)} className="border p-2 text-xs rounded-lg" />
      </div>
      <button onClick={handleSaveEta} className="w-full bg-amber-500 py-1 rounded-lg text-xs font-bold text-slate-900">Save ETAs</button>
      <button onClick={handleAssign} className="w-full bg-green-600 py-1 rounded-lg text-xs font-bold text-white">Save Assignment</button>
    </div>
  );
}

function VehicleTagGrid({ vehicles, routes, onTagUpdated }: { vehicles: VehicleRow[] | undefined; routes: RouteRow[] | undefined; onTagUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tagValue, setTagValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [aPlate, setAPlate] = useState("");
  const [aModel, setAModel] = useState("");
  const [aCapacity, setACapacity] = useState("40");
  const [aTag, setATag] = useState("");
  const [aErr, setAErr] = useState("");
  const [aSaving, setASaving] = useState(false);

  async function handleAddVehicle() {
    if (!aPlate.trim() || !aModel.trim()) return;
    setAErr(""); setASaving(true);
    try {
      await apiPost("/vehicles", { plateNumber: aPlate.trim(), model: aModel.trim(), capacity: Number(aCapacity) || 40, tag: aTag.trim() || null });
      setAPlate(""); setAModel(""); setACapacity("40"); setATag(""); setAdding(false); onTagUpdated();
    } catch (e: unknown) { setAErr(e instanceof Error ? e.message : "Failed to add vehicle"); }
    finally { setASaving(false); }
  }

  async function handleDeleteVehicle(id: number) {
    if (confirm("Delete vehicle?")) { await apiDelete(`/vehicles/${id}`); onTagUpdated(); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-primary">Fleet Asset Grid</h2>
        <button onClick={() => setAdding(!adding)} className="bg-amber-500 text-xs px-3 py-1 font-bold text-slate-900 rounded-xl">+ Add Vehicle</button>
      </div>
      {adding && (
        <div className="space-y-2 mt-3 p-3 bg-muted rounded-xl">
          <input value={aPlate} onChange={e => setAPlate(e.target.value)} placeholder="Plate Number (BA 1 KHA 1234)" className="w-full border p-2 text-xs rounded-lg" />
          <input value={aModel} onChange={e => setAModel(e.target.value)} placeholder="Model" className="w-full border p-2 text-xs rounded-lg" />
          <button onClick={handleAddVehicle} className="w-full bg-amber-500 text-xs py-2 font-bold rounded-xl text-slate-900">Add Vehicle</button>
        </div>
      )}
    </div>
  );
}

function RouteManager({ drivers, vehicles }: { drivers: Array<{ id: number; name: string }> | undefined; vehicles: VehicleRow[] | undefined }) {
  const queryClient = useQueryClient();
  const { data: routes, refetch } = useListRoutes();
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const editingRoute = editingRouteId != null ? ((routes as RouteRow[] | undefined) ?? []).find((r) => r.id === editingRouteId) ?? null : null;
  const [creating, setCreating] = useState(false);
  const [rName, setRName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!rName.trim()) return;
    setSaving(true);
    try {
      await apiPost("/routes", { name: rName.trim() });
      setRName(""); setCreating(false); refetch();
      queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
    } catch { /* noop */ }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-primary">Route Management</h2>
        <button onClick={() => setCreating(!creating)} className="bg-amber-500 text-xs px-3 py-1 font-bold rounded-xl text-slate-900">New Route</button>
      </div>
      {creating && (
        <div className="space-y-2 mt-3">
          <input value={rName} onChange={e => setRName(e.target.value)} placeholder="Route Name" className="w-full border p-2 text-xs rounded-lg" />
          <button onClick={handleCreate} className="w-full bg-amber-500 text-xs py-2 font-bold rounded-xl text-slate-900">Create</button>
        </div>
      )}
    </div>
  );
}

function SmartStationManager({ stations, onChanged }: { stations: StationRow[] | undefined; onChanged: () => void }) {
  const [pendingName, setPendingName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!pendingName.trim()) return;
    setSaving(true);
    try {
      await apiPost("/stations", { name: pendingName.trim(), lat: 27.7172, lng: 85.3240, radius: 100 });
      onChanged(); setPendingName("");
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-bold text-sm text-primary mb-3">Geofence Stations</h2>
      <div className="flex gap-2">
        <input value={pendingName} onChange={e => setPendingName(e.target.value)} placeholder="New Station Name" className="flex-1 border p-2 text-xs rounded-xl" />
        <button onClick={handleSave} className="bg-amber-500 text-xs px-4 py-2 font-bold rounded-xl text-slate-900">Add</button>
      </div>
    </div>
  );
}

function BoardingLogPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Live Boarding Log</h2>
      <p className="text-xs text-muted-foreground mt-1">Real-time board/absent logs active from drivers.</p>
    </div>
  );
}

function DriverCommunicationsPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Communications Log</h2>
      <p className="text-xs text-muted-foreground mt-1">Driver pings and student status log.</p>
    </div>
  );
}

function FleetFuelPanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [logs, setLogs] = useState<FuelLogRow[]>([]);
  const fetchLogs = useCallback(async () => {
    try {
      const r = await fetch(`${REPLIT_BACKEND}/api/fuel-logs`, { headers: tenantHeaders() });
      setLogs(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  return <div className="p-4 bg-card border rounded-2xl"><h3 className="font-bold text-sm text-primary">Fuel Logs ({logs.length})</h3></div>;
}

function FleetMaintenancePanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [records, setRecords] = useState<MaintenanceRow[]>([]);
  const fetchRecords = useCallback(async () => {
    try {
      const r = await fetch(`${REPLIT_BACKEND}/api/maintenance-records`, { headers: tenantHeaders() });
      setRecords(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void fetchRecords(); }, [fetchRecords]);
  return <div className="p-4 bg-card border rounded-2xl"><h3 className="font-bold text-sm text-primary">Service Records ({records.length})</h3></div>;
}

function FleetDocumentsPanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [docs, setDocs] = useState<VehicleDocRow[]>([]);
  const fetchDocs = useCallback(async () => {
    try {
      const r = await fetch(`${REPLIT_BACKEND}/api/vehicle-documents`, { headers: tenantHeaders() });
      setDocs(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void fetchDocs(); }, [fetchDocs]);
  return <div className="p-4 bg-card border rounded-2xl"><h3 className="font-bold text-sm text-primary">Statutory Documents ({docs.length})</h3></div>;
}

export default function AdminPortal() {
  const { user, login } = useAuth();
  const { data: stations, refetch: refetchStations } = useListStations();
  const { data: announcements, refetch: refetchAnnouncements } = useListAnnouncements();
  const { data: passengers, refetch: refetchPassengers } = useListPassengers();
  const { data: drivers, refetch: refetchDrivers } = useListDrivers();
  const { data: vehicles, refetch: refetchVehicles } = useListVehicles();
  const { data: adminRoutes } = useListRoutes();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<Modal>(null);
  const [adminTab, setAdminTab] = useState<"dashboard" | "fleet-fuel" | "fleet-maintenance" | "fleet-documents">("dashboard");
  const [selectedVehicle, setSelectedVehicle] = useState<LiveFleetVehicle | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverRow | null>(null);
  const [selectedPassenger, setSelectedPassenger] = useState<PassengerRow | null>(null);
  const [statsFilter, setStatsFilter] = useState<StatsFilter>(null);
  const [tenant, setTenant] = useState<Tenant | null>(user?.tenant ?? null);

  const [pName, setPName] = useState("");
  const [pRole, setPRole] = useState("student");
  const [pStation, setPStation] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pRouteId, setPRouteId] = useState("");

  const tenantId = user?.tenantId ?? 1;

  useEffect(() => {
    if (!tenant) {
      fetch(`${REPLIT_BACKEND}/api/tenants/${tenantId}`)
        .then((r) => r.json())
        .then((data: Tenant) => setTenant(data))
        .catch(() => {});
    }
  }, [tenantId, tenant]);

  const handleAddPassenger = useCallback(async () => {
    try {
      await apiPost("/passengers", { name: pName, role: pRole, stationId: Number(pStation), phone: pPhone.trim() || undefined });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() }); refetchPassengers(); setModal(null);
    } catch { /* ignore */ }
  }, [pName, pRole, pStation, pPhone, queryClient, refetchPassengers]);

  return (
    <div className="mx-auto w-full max-w-[860px] p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1><p className="text-xs text-muted-foreground">import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useListStations, useListAnnouncements, useListPassengers, useListDrivers, useListRoutes, useListVehicles, getListPassengersQueryKey, getListDriversQueryKey, getListRoutesQueryKey, getListStationsQueryKey, getListVehiclesQueryKey, getListAnnouncementsQueryKey, useListCalendarEvents, getListCalendarEventsQueryKey, getTenantId } from "@workspace/api-client-react";
import { CheckCircle, MapPin, Home, Bus, Upload, Camera, Pencil, AlertTriangle, Wrench, Send, MessageSquare, Megaphone, Phone, Route, Plus, Trash2, Search, Navigation, ChevronDown, ChevronUp, X, RefreshCw, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Star, Clock, Lock, User, Bell, Droplets, FileText, BarChart3, Gauge, AlertCircle, Settings2 } from "lucide-react";
import StationMapPicker from "@/components/station-map-picker";
import OsmMap, { type RouteStop } from "@/components/osm-map";
import { useLiveLocations } from "@/hooks/use-live-locations";
import { adToBs, bsToAd, getDaysInBsMonth, getFirstWeekdayOfBsMonth, todayBs, bsDateToAd, BS_MONTH_NAMES_NE, AD_MONTH_NAMES } from "@/lib/bs-calendar";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useDriverMessages } from "@/lib/driver-messages";

// 🚀 भर्सलको हल्ला छोडेर सिधै रीप्लिट ब्याकइन्डको ठेगाना हार्डकोड गरिएको
const REPLIT_BACKEND = "https://33c7862f-0438-4adc-83ae-af5ac11d06a3-00-3u2khpqjgrop5.sisko.replit.dev";

function tenantHeaders(): Record<string, string> {
  const id = getTenantId();
  return id !== null ? { "Content-Type": "application/json", "x-tenant-id": String(id) } : { "Content-Type": "application/json" };
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${REPLIT_BACKEND}/api${path}`, { method: "POST", headers: tenantHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${REPLIT_BACKEND}/api${path}`, { method: "PATCH", headers: tenantHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiDelete(path: string) {
  const id = getTenantId();
  const headers: Record<string, string> = id !== null ? { "x-tenant-id": String(id) } : {};
  await fetch(`${REPLIT_BACKEND}/api${path}`, { method: "DELETE", headers });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Live fleet vehicles are derived from real driver DB records + GPS data — no hardcoded arrays.

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

// ── CalendarManager ───────────────────────────────────────────────────────────
type CalendarEvent = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  eventDate: string;
  notified: boolean;
  autoNotify: boolean;
};

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_NE = ["आइत", "सोम", "मङ्गल", "बुध", "बिही", "शुक्र", "शनि"];

function getAdDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function getAdFirstWeekday(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function CalendarManager() {
  const queryClient = useQueryClient();
  const todayB = todayBs();
  const todayAd = new Date();

  const [calSystem, setCalSystem] = useState<"bs" | "ad">("bs");

  // BS state
  const [bsYear, setBsYear] = useState(todayB.year);
  const [bsMonth, setBsMonth] = useState(todayB.month);

  // AD state
  const [adYear, setAdYear] = useState(todayAd.getFullYear());
  const [adMonth, setAdMonth] = useState(todayAd.getMonth() + 1);

  // API month query (always in AD YYYY-MM format).
  const adMonthStart = useMemo(() => {
    if (calSystem === "bs") return bsToAd(bsYear, bsMonth, 1);
    return { year: adYear, month: adMonth, day: 1 };
  }, [calSystem, bsYear, bsMonth, adYear, adMonth]);

  const adMonthEnd = useMemo(() => {
    if (calSystem === "bs") return bsToAd(bsYear, bsMonth, getDaysInBsMonth(bsYear, bsMonth));
    return { year: adYear, month: adMonth, day: 1 };
  }, [calSystem, bsYear, bsMonth, adYear, adMonth]);

  const queryMonth1 = `${adMonthStart.year}-${String(adMonthStart.month).padStart(2, "0")}`;
  const queryMonth2 = (calSystem === "bs" && adMonthEnd.month !== adMonthStart.month)
    ? `${adMonthEnd.year}-${String(adMonthEnd.month).padStart(2, "0")}`
    : null;

  const { data: eventsA, refetch: refetchA } = useListCalendarEvents({ month: queryMonth1 });
  const { data: eventsB, refetch: refetchB } = useListCalendarEvents({ month: queryMonth2 ?? queryMonth1 });

  const events = useMemo(() => {
    const all = [...(eventsA ?? []), ...(queryMonth2 ? (eventsB ?? []) : [])];
    const seen = new Set<number>();
    return all.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
  }, [eventsA, eventsB, queryMonth2]);

  function refetch() { void refetchA(); if (queryMonth2) void refetchB(); }

  const [showForm, setShowForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eType, setEType] = useState<"event" | "holiday">("event");
  const [eAutoNotify, setEAutoNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  // Switch calendar system and sync the viewed month position
  function switchTo(sys: "bs" | "ad") {
    if (sys === calSystem) return;
    if (sys === "ad") {
      const d = bsToAd(bsYear, bsMonth, 1);
      setAdYear(d.year); setAdMonth(d.month);
    } else {
      const bs = adToBs(adYear, adMonth, 1);
      setBsYear(bs.year); setBsMonth(bs.month);
    }
    setCalSystem(sys);
    setSelectedDay(null);
  }

  function prevMonth() {
    setSelectedDay(null);
    if (calSystem === "bs") {
      if (bsMonth === 1) { setBsYear(y => y - 1); setBsMonth(12); } else setBsMonth(m => m - 1);
    } else {
      if (adMonth === 1) { setAdYear(y => y - 1); setAdMonth(12); } else setAdMonth(m => m - 1);
    }
  }
  function nextMonth() {
    setSelectedDay(null);
    if (calSystem === "bs") {
      if (bsMonth === 12) { setBsYear(y => y + 1); setBsMonth(1); } else setBsMonth(m => m + 1);
    } else {
      if (adMonth === 12) { setAdYear(y => y + 1); setAdMonth(1); } else setAdMonth(m => m + 1);
    }
  }

  const daysInMonth = calSystem === "bs" ? getDaysInBsMonth(bsYear, bsMonth) : getAdDaysInMonth(adYear, adMonth);
  const firstWeekday = calSystem === "bs" ? getFirstWeekdayOfBsMonth(bsYear, bsMonth) : getAdFirstWeekday(adYear, adMonth);

  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const ev of events ?? []) {
    const parts = ev.eventDate.split("-").map(Number);
    if (calSystem === "bs") {
      const bs = adToBs(parts[0]!, parts[1]!, parts[2]!);
      if (bs.year === bsYear && bs.month === bsMonth) {
        const list = eventsByDay.get(bs.day) ?? [];
        list.push(ev as CalendarEvent);
        eventsByDay.set(bs.day, list);
      }
    } else {
      if (parts[0] === adYear && parts[1] === adMonth) {
        const list = eventsByDay.get(parts[2]!) ?? [];
        list.push(ev as CalendarEvent);
        eventsByDay.set(parts[2]!, list);
      }
    }
  }

  function isTodayCell(day: number) {
    if (calSystem === "bs") return day === todayB.day && bsMonth === todayB.month && bsYear === todayB.year;
    return day === todayAd.getDate() && adMonth === todayAd.getMonth() + 1 && adYear === todayAd.getFullYear();
  }

  const WEEKDAYS = calSystem === "bs" ? WEEKDAYS_NE : WEEKDAYS_EN;
  const headerTitle = calSystem === "bs" ? `${BS_MONTH_NAMES_NE[bsMonth - 1]} ${bsYear}` : `${AD_MONTH_NAMES[adMonth - 1]} ${adYear}`;
  const headerSubtitle = calSystem === "bs" ? `${queryMonth1.replace("-", " / ")} AD` : (() => { const bs = adToBs(adYear, adMonth, 1); return `${BS_MONTH_NAMES_NE[bs.month - 1]} ${bs.year} BS`; })();

  const selectedDayLabel = selectedDay ? calSystem === "bs" ? `${selectedDay} ${BS_MONTH_NAMES_NE[bsMonth - 1]} ${bsYear} BS` : `${selectedDay} ${AD_MONTH_NAMES[adMonth - 1]} ${adYear} AD` : "";

  function openAddForm(day: number) {
    setSelectedDay(day);
    setETitle(""); setEDesc(""); setEType("event"); setEAutoNotify(true); setFormErr("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!eTitle.trim() || !selectedDay) return;
    setFormErr(""); setSaving(true);
    try {
      const adDateStr = calSystem === "bs" ? bsDateToAd(bsYear, bsMonth, selectedDay) : `${adYear}-${String(adMonth).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
      const res = await fetch(`${REPLIT_BACKEND}/api/calendar-events`, {
        method: "POST",
        headers: tenantHeaders(),
        body: JSON.stringify({ title: eTitle.trim(), description: eDesc.trim() || undefined, type: eType, eventDate: adDateStr, autoNotify: eAutoNotify }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      queryClient.invalidateQueries({ queryKey: getListCalendarEventsQueryKey() });
      refetch();
      setShowForm(false);
    } catch (e: unknown) { setFormErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    const _tid = getTenantId();
    await fetch(`${REPLIT_BACKEND}/api/calendar-events/${id}`, { method: "DELETE", headers: _tid !== null ? { "x-tenant-id": String(_tid) } : {} });
    queryClient.invalidateQueries({ queryKey: getListCalendarEventsQueryKey() });
    refetch();
  }

  const selectedDayEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-[#FFF078]" />
          <div>
            <h2 className="font-semibold text-primary">विद्यालय क्यालेन्डर</h2>
            <p className="text-xs text-muted-foreground mt-0.5">School Calendar · Events & Holidays</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-0.5 text-xs font-semibold">
          <button onClick={() => switchTo("bs")} className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "bs" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>BS</button>
          <button onClick={() => switchTo("ad")} className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "ad" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>AD</button>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors"><ChevronLeft size={16} /></button>
        <div className="text-center">
          <p className="font-bold text-sm text-foreground">{headerTitle}</p>
          <p className="text-[10px] text-muted-foreground">{headerSubtitle}</p>
        </div>
        <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors"><ChevronRight size={16} /></button>
      </div>

      <div className="flex items-center justify-center gap-2 px-5 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Today</span>
        <span className="text-xs font-bold text-foreground">{BS_MONTH_NAMES_NE[todayB.month - 1]} {todayB.day}, {todayB.year} BS</span>
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className="text-xs font-bold text-foreground">{AD_MONTH_NAMES[todayAd.getMonth()]} {todayAd.getDate()}, {todayAd.getFullYear()} AD</span>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            return (
              <button key={day} onClick={() => setSelectedDay(day)} className={`relative flex flex-col items-center rounded-xl py-1.5 transition-all text-xs ${isTodayCell(day) ? "bg-amber-400 dark:bg-amber-500 text-white font-extrabold ring-2 ring-amber-500" : "hover:bg-muted text-foreground font-medium"}`}>
                <span className={isTodayCell(day) ? "text-sm" : ""}>{day}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 85 ? "text-green-600 bg-green-100 dark:bg-green-950/40 border-green-200 dark:border-green-800" : score >= 70 ? "text-amber-600 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" : "text-red-600 bg-red-100 dark:bg-red-950/40 border-red-200 dark:border-red-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}>{score}/100</span>;
}

function PhotoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  async function handleFile(file: File) { if (file) onChange(await fileToDataUrl(file)); }
  return (
    <div>
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="preview" className="h-12 w-12 rounded-full object-cover border border-border shrink-0" />
          <button onClick={() => onChange("")} className="text-xs text-red-500 hover:text-red-400">Remove</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => galleryRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors"><Upload size={13} /> Upload Photo</button>
          <button onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors"><Camera size={13} /> Take Photo</button>
        </div>
      )}
    </div>
  );
}

type Modal = "add-passenger" | "add-driver" | null;
type StatsFilter = "boarded" | "live" | "leave" | "buses" | null;
type Tenant = { id: number; name: string; address?: string | null; contactPhone?: string | null; bannerUrl?: string | null; schoolCode?: string | null; };
type LiveFleetVehicle = { id: number; plate: string; driver: string; lat: number | null; lng: number | null; status: "on-route" | "depot"; isLive: boolean; };
type Passenger = { id: number; name: string; phone?: string | null; role: string; status: string; liveToday: number; stationId: number; stationName?: string | null; quickMessage?: string | null; photoUrl?: string | null; };

function PassengerDetailCard({ p, onClose }: { p: Passenger; onClose: () => void }) {
  const initials = p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden">
        <div className="relative bg-gradient-to-br from-amber-400/20 to-amber-600/10 px-6 pt-8 pb-6 flex flex-col items-center gap-3 border-b border-border">
          <button onClick={onClose} className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground text-sm">✕</button>
          {p.photoUrl ? <img src={p.photoUrl} alt={p.name} className="h-20 w-20 rounded-full object-cover border-4 border-background shadow-2xl" /> : <div className="h-20 w-20 rounded-full border-4 border-background shadow-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center"><span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{initials}</span></div>}
          <div className="text-center"><h3 className="text-lg font-bold text-foreground">{p.name}</h3><span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-xs text-muted-foreground capitalize">{p.role}</span></div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[p.status] ?? STATUS_STYLES.pending}`}>{STATUS_LABELS[p.status] ?? p.status}</span>
        </div>
        <div className="divide-y divide-border">
          {p.phone && <div className="flex items-center gap-3 px-5 py-3"><Phone size={14} className="text-muted-foreground shrink-0" /><div><p className="text-sm font-medium text-foreground">{p.phone}</p></div></div>}
          <div className="flex items-center gap-3 px-5 py-3"><MapPin size={14} className="text-muted-foreground shrink-0" /><div><p className="text-sm font-medium text-foreground">{p.stationName ?? "—"}</p></div></div>
        </div>
      </div>
    </div>
  );
}

function StatsDetailPanel({ filter, passengers, fleetVehicles, onRouteCount, onClose }: { filter: StatsFilter; passengers: Passenger[]; fleetVehicles: LiveFleetVehicle[]; onRouteCount: number; onClose: () => void }) {
  const [selected, setSelected] = useState<Passenger | null>(null);
  const filtered = (() => {
    if (filter === "boarded") return passengers.filter((p) => p.status === "boarded");
    if (filter === "live") return passengers.filter((p) => p.liveToday === 1);
    if (filter === "leave") return passengers.filter((p) => p.quickMessage === "Staying home today");
    return [];
  })();
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl min-h-[50vh] max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <h2 className="text-base font-bold text-primary">{filter}</h2>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground text-sm">✕</button>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors">
                <PassengerAvatar name={p.name} photoUrl={p.photoUrl} />
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground truncate">{p.name}</p></div>
              </button>
            ))}
          </div>
        </div>
      </div>
      {selected && <PassengerDetailCard p={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

type DriverRow = { id: number; name: string; phone: string; vehicleNumber: string; isActive: boolean; isOnline: boolean; photoUrl?: string | null };

function DriverDetailPanel({ driver, vehicles, routes, onClose, onRefresh }: { driver: DriverRow; vehicles: VehicleRow[] | undefined; routes: RouteRow[] | undefined; onClose: () => void; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  const assignedRoutes = (routes ?? []).filter((r) => r.driverId === driver.id);
  const unassignedRoutes = (routes ?? []).filter((r) => r.driverId !== driver.id);

  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(driver.name);
  const [editPhone, setEditPhone] = useState(driver.phone);
  const [localIsActive, setLocalIsActive] = useState(driver.isActive);
  const [activeMsg, setActiveMsg] = useState("");
  const [changingVehicle, setChangingVehicle] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [assigningRoute, setAssigningRoute] = useState(false);
  const [pickRouteId, setPickRouteId] = useState("");
  const [routeErr, setRouteErr] = useState("");
  const [err, setErr] = useState("");

  async function handleSaveInfo() {
    setSaving(true); setErr("");
    try {
      await apiPatch(`/drivers/${driver.id}`, { name: editName.trim(), phone: editPhone.trim() });
      onRefresh(); setEditingName(false);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleToggleActive() {
    setSaving(true); setErr(""); setActiveMsg("");
    const next = !localIsActive;
    try {
      await apiPatch(`/drivers/${driver.id}`, { isActive: next });
      setLocalIsActive(next);
      setActiveMsg(next ? "Driver marked active — they can now log in." : "Driver marked inactive.");
      onRefresh();
    } catch { setErr("Failed to update status"); }
    finally { setSaving(false); }
  }

  async function handleChangeVehicle() {
    if (!selectedVehicleId) return;
    const v = (vehicles ?? []).find((x) => x.id === Number(selectedVehicleId));
    if (!v) return;
    setSaving(true); setErr("");
    try {
      await apiPatch(`/drivers/${driver.id}`, { vehicleNumber: v.plateNumber });
      onRefresh(); setChangingVehicle(false); setSelectedVehicleId("");
    } catch { setErr("Failed"); }
    finally { setSaving(false); }
  }

  async function handleAssignRoute() {
    if (!pickRouteId) return;
    setRouteErr(""); setSaving(true);
    try {
      await apiPatch(`/routes/${pickRouteId}`, { driverId: driver.id });
      queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
      onRefresh(); setAssigningRoute(false); setPickRouteId("");
    } catch { setRouteErr("Failed"); }
    finally { setSaving(false); }
  }

  async function handleRemoveFromRoute(routeId: number) {
    await apiPatch(`/routes/${routeId}`, { driverId: null });
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
    onRefresh();
  }

  async function handleDelete() {
    if (!confirm(`Remove driver ${driver.name}?`)) return;
    await apiDelete(`/drivers/${driver.id}`);
    queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
    onRefresh(); onClose();
  }

  const currentVehicle = (vehicles ?? []).find((v) => v.plateNumber === driver.vehicleNumber);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="h-1 w-10 rounded-full bg-border" /></div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <img src={driver.photoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(driver.name)}`} alt={driver.name} className="h-10 w-10 rounded-full border-2 border-amber-500 object-cover shrink-0" />
            <div>
              <h2 className="text-base font-bold text-foreground">{driver.name}</h2>
              <span className="text-[10px] font-semibold text-muted-foreground">{localIsActive ? "● Active" : "● Inactive"}</span>
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {err && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">{err}</p>}
          <button onClick={handleToggleActive} className="w-full bg-amber-500 py-2 text-xs font-bold rounded-xl text-slate-900">{localIsActive ? "Mark Inactive" : "Mark Active"}</button>
          <button onClick={handleDelete} className="w-full bg-red-500 py-2 text-xs font-bold rounded-xl text-white">Remove Driver</button>
        </div>
      </div>
    </div>
  );
}

type PassengerRow = { id: number; name: string; phone?: string | null; photoUrl?: string | null; role: string; stationId: number; stationName?: string | null; routeId?: number | null };
type StationOption = { id: number; name: string };

function PassengerDetailPanel({ passenger, stations, routes, onClose, onRefresh }: { passenger: PassengerRow; stations: StationOption[] | undefined; routes: RouteRow[] | undefined; onClose: () => void; onRefresh: () => void }) {
  const [editName, setEditName] = useState(passenger.name);
  const [editPhone, setEditPhone] = useState(passenger.phone ?? "");
  const [editStationId, setEditStationId] = useState(String(passenger.stationId));
  const [editRouteId, setEditRouteId] = useState(String(passenger.routeId ?? ""));

  type EditRouteStation = { id: number; stationId: number; stationName: string | null; stopLabel: string | null };
  const [editRouteStations, setEditRouteStations] = useState<EditRouteStation[]>([]);
  useEffect(() => {
    if (!editRouteId) { setEditRouteStations([]); return; }
    fetch(`${REPLIT_BACKEND}/api/routes/${editRouteId}/stations`, { headers: tenantHeaders() })
      .then((r) => r.json())
      .then((data: unknown) => {
        const list = Array.isArray(data) ? (data as EditRouteStation[]) : [];
        setEditRouteStations(list);
        const stillValid = list.some((rs) => String(rs.stationId) === editStationId);
        if (!stillValid && list.length > 0) setEditStationId(String(list[0].stationId));
      })
      .catch(() => setEditRouteStations([]));
  }, [editRouteId]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true); setErr("");
    try {
      await apiPatch(`/passengers/${passenger.id}`, { name: editName.trim(), phone: editPhone.trim() || undefined, stationId: Number(editStationId), routeId: editRouteId ? Number(editRouteId) : null });
      onRefresh(); onClose();
    } catch { setErr("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${passenger.name}?`)) return;
    await fetch(`${REPLIT_BACKEND}/api/passengers/${passenger.id}`, { method: "DELETE", headers: getTenantId() !== null ? { "x-tenant-id": String(getTenantId()) } : {} });
    onRefresh(); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl flex flex-col p-5 space-y-3">
        <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full border p-2 rounded-xl bg-muted" />
        <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full border p-2 rounded-xl bg-muted" />
        <button onClick={handleSave} className="w-full bg-amber-500 py-2 rounded-xl text-slate-900 font-bold">Save Changes</button>
        <button onClick={handleDelete} className="w-full bg-red-500 py-2 rounded-xl text-white font-bold">Remove</button>
      </div>
    </div>
  );
}

function BusDetailPanel({ vehicle, onClose }: { vehicle: LiveFleetVehicle; onClose: () => void }) {
  const messages = useDriverMessages(vehicle.plate);
  const bboxLng = 0.012; const bboxLat = 0.008;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-foreground">{vehicle.plate} ({vehicle.driver})</h2>
        {vehicle.lat !== null && vehicle.lng !== null ? (
          <iframe title="map" width="100%" height="180" src={`https://www.openstreetmap.org/export/embed.html?bbox=${vehicle.lng - bboxLng},${vehicle.lat - bboxLat},${vehicle.lng + bboxLng},${vehicle.lat + bboxLat}&layer=mapnik&marker=${vehicle.lat},${vehicle.lng}`} />
        ) : <p className="text-xs italic text-muted-foreground">No GPS signal</p>}
      </div>
    </div>
  );
}

type GeocodeResult = { displayName: string; lat: number; lng: number };
type RouteStation = { id: number; routeId: number; stationId: number; position: number; direction: string; stopLabel: string | null; eta: string | null; stationName: string | null; lat: number | null; lng: number | null; radius: number | null };
type RouteRow = { id: number; name: string; driverId: number | null; vehicleId: number | null; isActive: boolean | null; driverName: string | null; vehiclePlate: string | null; departureTime?: string | null; avgSpeedKmh?: number | null };
type VehicleRow = { id: number; plateNumber: string; model: string; capacity: number; isActive: boolean; tag?: string | null };

function RouteStationsPanel({ routeId, route, vehicles, drivers, onClose, onRouteUpdated }: { routeId: number; route: RouteRow; vehicles: VehicleRow[] | undefined; drivers: Array<{ id: number; name: string }> | undefined; onClose: () => void; onRouteUpdated: () => void }) {
  const queryClient = useQueryClient();
  const { data: stations } = useListStations();
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState("");
  const [addingDir, setAddingDir] = useState<"forward" | "return">("forward");
  const [addingLabel, setAddingLabel] = useState("");
  const [addingErr, setAddingErr] = useState("");
  const [editVehicle, setEditVehicle] = useState(String(route.vehicleId ?? ""));
  const [editDriver, setEditDriver] = useState(String(route.driverId ?? ""));
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSaved, setAssignSaved] = useState(false);
  const [depTime, setDepTime] = useState(route.departureTime ?? "06:00 AM");
  const [speedKmh, setSpeedKmh] = useState(String(route.avgSpeedKmh ?? 25));
  const [etaSaving, setEtaSaving] = useState(false);
  const [etaSaved, setEtaSaved] = useState(false);
  const { data: allPassengers } = useListPassengers();
  const [mapClickPending, setMapClickPending] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [pendingMapName, setPendingMapName] = useState("");
  const [pendingMapRadius, setPendingMapRadius] = useState(100);
  const [pendingMapSaving, setPendingMapSaving] = useState(false);

  useEffect(() => {
    setEditVehicle(String(route.vehicleId ?? ""));
    setEditDriver(String(route.driverId ?? ""));
    setDepTime(route.departureTime ?? "06:00 AM");
    setSpeedKmh(String(route.avgSpeedKmh ?? 25));
  }, [route.vehicleId, route.driverId, route.departureTime, route.avgSpeedKmh]);

  const load = useCallback(async () => {
    setRouteStations([]); setLoading(true);
    try {
      const r = await fetch(`${REPLIT_BACKEND}/api/routes/${routeId}/stations`);
      setRouteStations(await r.json());
    } finally { setLoading(false); }
  }, [routeId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAssign() {
    setAssignSaving(true); setAssignSaved(false);
    try {
      await apiPatch(`/routes/${routeId}`, { vehicleId: editVehicle ? Number(editVehicle) : null, driverId: editDriver ? Number(editDriver) : null });
      onRouteUpdated(); setAssignSaved(true);
    } catch { /* ignore */ }
    finally { setAssignSaving(false); }
  }

  async function handleSaveEta() {
    setEtaSaving(true); setEtaSaved(false);
    try {
      await apiPatch(`/routes/${routeId}`, { departureTime: depTime, avgSpeedKmh: Number(speedKmh) || 25 });
      onRouteUpdated(); await load(); setEtaSaved(true);
    } catch { /* ignore */ }
    finally { setEtaSaving(false); }
  }

  async function handleAdd() {
    if (!addingId) return;
    setAddingErr("");
    const station = (stations ?? []).find((s) => s.id === Number(addingId));
    const autoLabel = addingLabel.trim() || (station ? `${station.name} (${addingDir === "forward" ? "Forward" : "Return"})` : "");
    try {
      await apiPost(`/routes/${routeId}/stations`, { stationId: Number(addingId), direction: addingDir, stopLabel: autoLabel });
      setAddingId(""); setAddingLabel(""); void load();
    } catch { setAddingErr("Failed"); }
  }

  async function handleRemove(rowId: number) {
    await apiDelete(`/routes/${routeId}/stations/${rowId}`); void load();
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
  }

  async function handleAddFromMap() {
    if (!mapClickPending) return;
    const name = pendingMapName.trim() || mapClickPending.name;
    setPendingMapSaving(true);
    try {
      const created = await apiPost("/stations", { name, lat: mapClickPending.lat, lng: mapClickPending.lng, radius: pendingMapRadius }) as { id: number };
      await apiPost(`/routes/${routeId}/stations`, { stationId: created.id, direction: "forward", stopLabel: name });
      setMapClickPending(null); setPendingMapName(""); setPendingMapRadius(100); await load();
      queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
    } catch { /* noop */ }
    finally { setPendingMapSaving(false); }
  }

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between"><p className="text-xs font-semibold">Stops ({routeStations.length})</p><button onClick={onClose}><X size={14} /></button></div>
      <div className="grid grid-cols-2 gap-2">
        <input value={depTime} onChange={e => setDepTime(e.target.value)} className="border p-2 text-xs rounded-lg" />
        <input type="number" value={speedKmh} onChange={e => setSpeedKmh(e.target.value)} className="border p-2 text-xs rounded-lg" />
      </div>
      <button onClick={handleSaveEta} className="w-full bg-amber-500 py-1 rounded-lg text-xs font-bold text-slate-900">Save ETAs</button>
      <button onClick={handleAssign} className="w-full bg-green-600 py-1 rounded-lg text-xs font-bold text-white">Save Assignment</button>
    </div>
  );
}

function VehicleTagGrid({ vehicles, routes, onTagUpdated }: { vehicles: VehicleRow[] | undefined; routes: RouteRow[] | undefined; onTagUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tagValue, setTagValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [aPlate, setAPlate] = useState("");
  const [aModel, setAModel] = useState("");
  const [aCapacity, setACapacity] = useState("40");
  const [aTag, setATag] = useState("");
  const [aErr, setAErr] = useState("");
  const [aSaving, setASaving] = useState(false);

  async function handleAddVehicle() {
    if (!aPlate.trim() || !aModel.trim()) return;
    setAErr(""); setASaving(true);
    try {
      await apiPost("/vehicles", { plateNumber: aPlate.trim(), model: aModel.trim(), capacity: Number(aCapacity) || 40, tag: aTag.trim() || null });
      setAPlate(""); setAModel(""); setACapacity("40"); setATag(""); setAdding(false); onTagUpdated();
    } catch (e: unknown) { setAErr(e instanceof Error ? e.message : "Failed to add vehicle"); }
    finally { setASaving(false); }
  }

  async function handleDeleteVehicle(id: number) {
    if (confirm("Delete vehicle?")) { await apiDelete(`/vehicles/${id}`); onTagUpdated(); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-primary">Fleet Asset Grid</h2>
        <button onClick={() => setAdding(!adding)} className="bg-amber-500 text-xs px-3 py-1 font-bold text-slate-900 rounded-xl">+ Add Vehicle</button>
      </div>
      {adding && (
        <div className="space-y-2 mt-3 p-3 bg-muted rounded-xl">
          <input value={aPlate} onChange={e => setAPlate(e.target.value)} placeholder="Plate Number (BA 1 KHA 1234)" className="w-full border p-2 text-xs rounded-lg" />
          <input value={aModel} onChange={e => setAModel(e.target.value)} placeholder="Model" className="w-full border p-2 text-xs rounded-lg" />
          <button onClick={handleAddVehicle} className="w-full bg-amber-500 text-xs py-2 font-bold rounded-xl text-slate-900">Add Vehicle</button>
        </div>
      )}
    </div>
  );
}

function RouteManager({ drivers, vehicles }: { drivers: Array<{ id: number; name: string }> | undefined; vehicles: VehicleRow[] | undefined }) {
  const queryClient = useQueryClient();
  const { data: routes, refetch } = useListRoutes();
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const editingRoute = editingRouteId != null ? ((routes as RouteRow[] | undefined) ?? []).find((r) => r.id === editingRouteId) ?? null : null;
  const [creating, setCreating] = useState(false);
  const [rName, setRName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!rName.trim()) return;
    setSaving(true);
    try {
      await apiPost("/routes", { name: rName.trim() });
      setRName(""); setCreating(false); refetch();
      queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
    } catch { /* noop */ }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-primary">Route Management</h2>
        <button onClick={() => setCreating(!creating)} className="bg-amber-500 text-xs px-3 py-1 font-bold rounded-xl text-slate-900">New Route</button>
      </div>
      {creating && (
        <div className="space-y-2 mt-3">
          <input value={rName} onChange={e => setRName(e.target.value)} placeholder="Route Name" className="w-full border p-2 text-xs rounded-lg" />
          <button onClick={handleCreate} className="w-full bg-amber-500 text-xs py-2 font-bold rounded-xl text-slate-900">Create</button>
        </div>
      )}
    </div>
  );
}

function SmartStationManager({ stations, onChanged }: { stations: StationRow[] | undefined; onChanged: () => void }) {
  const [pendingName, setPendingName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!pendingName.trim()) return;
    setSaving(true);
    try {
      await apiPost("/stations", { name: pendingName.trim(), lat: 27.7172, lng: 85.3240, radius: 100 });
      onChanged(); setPendingName("");
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-bold text-sm text-primary mb-3">Geofence Stations</h2>
      <div className="flex gap-2">
        <input value={pendingName} onChange={e => setPendingName(e.target.value)} placeholder="New Station Name" className="flex-1 border p-2 text-xs rounded-xl" />
        <button onClick={handleSave} className="bg-amber-500 text-xs px-4 py-2 font-bold rounded-xl text-slate-900">Add</button>
      </div>
    </div>
  );
}

function BoardingLogPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Live Boarding Log</h2>
      <p className="text-xs text-muted-foreground mt-1">Real-time board/absent logs active from drivers.</p>
    </div>
  );
}

function DriverCommunicationsPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Communications Log</h2>
      <p className="text-xs text-muted-foreground mt-1">Driver pings and student status log.</p>
    </div>
  );
}

function FleetFuelPanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [logs, setLogs] = useState<FuelLogRow[]>([]);
  const fetchLogs = useCallback(async () => {
    try {
      const r = await fetch(`${REPLIT_BACKEND}/api/fuel-logs`, { headers: tenantHeaders() });
      setLogs(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  return <div className="p-4 bg-card border rounded-2xl"><h3 className="font-bold text-sm text-primary">Fuel Logs ({logs.length})</h3></div>;
}

function FleetMaintenancePanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [records, setRecords] = useState<MaintenanceRow[]>([]);
  const fetchRecords = useCallback(async () => {
    try {
      const r = await fetch(`${REPLIT_BACKEND}/api/maintenance-records`, { headers: tenantHeaders() });
      setRecords(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void fetchRecords(); }, [fetchRecords]);
  return <div className="p-4 bg-card border rounded-2xl"><h3 className="font-bold text-sm text-primary">Service Records ({records.length})</h3></div>;
}

function FleetDocumentsPanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [docs, setDocs] = useState<VehicleDocRow[]>([]);
  const fetchDocs = useCallback(async () => {
    try {
      const r = await fetch(`${REPLIT_BACKEND}/api/vehicle-documents`, { headers: tenantHeaders() });
      setDocs(await r.json());
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void fetchDocs(); }, [fetchDocs]);
  return <div className="p-4 bg-card border rounded-2xl"><h3 className="font-bold text-sm text-primary">Statutory Documents ({docs.length})</h3></div>;
}

export default function AdminPortal() {
  const { user, login } = useAuth();
  const { data: stations, refetch: refetchStations } = useListStations();
  const { data: announcements, refetch: refetchAnnouncements } = useListAnnouncements();
  const { data: passengers, refetch: refetchPassengers } = useListPassengers();
  const { data: drivers, refetch: refetchDrivers } = useListDrivers();
  const { data: vehicles, refetch: refetchVehicles } = useListVehicles();
  const { data: adminRoutes } = useListRoutes();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<Modal>(null);
  const [adminTab, setAdminTab] = useState<"dashboard" | "fleet-fuel" | "fleet-maintenance" | "fleet-documents">("dashboard");
  const [selectedVehicle, setSelectedVehicle] = useState<LiveFleetVehicle | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverRow | null>(null);
  const [selectedPassenger, setSelectedPassenger] = useState<PassengerRow | null>(null);
  const [statsFilter, setStatsFilter] = useState<StatsFilter>(null);
  const [tenant, setTenant] = useState<Tenant | null>(user?.tenant ?? null);

  const [pName, setPName] = useState("");
  const [pRole, setPRole] = useState("student");
  const [pStation, setPStation] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pRouteId, setPRouteId] = useState("");

  const tenantId = user?.tenantId ?? 1;

  useEffect(() => {
    if (!tenant) {
      fetch(`${REPLIT_BACKEND}/api/tenants/${tenantId}`)
        .then((r) => r.json())
        .then((data: Tenant) => setTenant(data))
        .catch(() => {});
    }
  }, [tenantId, tenant]);

  const handleAddPassenger = useCallback(async () => {
    try {
      await apiPost("/passengers", { name: pName, role: pRole, stationId: Number(pStation), phone: pPhone.trim() || undefined });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() }); refetchPassengers(); setModal(null);
    } catch { /* ignore */ }
  }, [pName, pRole, pStation, pPhone, queryClient, refetchPassengers]);

  return (
    <div className="mx-auto w-full max-w-[860px] p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1><p className="text-xs text-muted-foreground">{tenant?.name}</p></div>
      </header>

      <nav className="rounded-xl border border-border bg-card shadow-sm flex overflow-x-auto p-1 gap-2 text-xs font-semibold">
        <button onClick={() => setAdminTab("dashboard")} className={`px-4 py-2 rounded-lg ${adminTab === "dashboard" ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}>Dashboard</button>
        <button onClick={() => setAdminTab("fleet-fuel")} className={`px-4 py-2 rounded-lg ${adminTab === "fleet-fuel" ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}>Fuel Logs</button>
        <button onClick={() => setAdminTab("fleet-maintenance")} className={`px-4 py-2 rounded-lg ${adminTab === "fleet-maintenance" ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}>Service</button>
        <button onClick={() => setAdminTab("fleet-documents")} className={`px-4 py-2 rounded-lg ${adminTab === "fleet-documents" ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}>Documents</button>
      </nav>

      {adminTab === "dashboard" && (
        <>
          <BoardingLogPanel />
          <DriverCommunicationsPanel />
          <SmartStationManager stations={stations as StationRow[] | undefined} onChanged={() => queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() })} />
          <VehicleTagGrid vehicles={vehicles as VehicleRow[] | undefined} routes={adminRoutes as RouteRow[] | undefined} onTagUpdated={() => queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() })} />
          <RouteManager drivers={drivers} vehicles={vehicles as VehicleRow[] | undefined} />
          <CalendarManager />
        </>
      )}

      {adminTab === "fleet-fuel" && <FleetFuelPanel vehicles={[]} />}
      {adminTab === "fleet-maintenance" && <FleetMaintenancePanel vehicles={[]} />}
      {adminTab === "fleet-documents" && <FleetDocumentsPanel vehicles={[]} />}
    </div>
  );
}{tenant?.name}</p></div>
      </header>

      <nav className="rounded-xl border border-border bg-card shadow-sm flex overflow-x-auto p-1 gap-2 text-xs font-semibold">
        <button onClick={() => setAdminTab("dashboard")} className={`px-4 py-2 rounded-lg ${adminTab === "dashboard" ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}>Dashboard</button>
        <button onClick={() => setAdminTab("fleet-fuel")} className={`px-4 py-2 rounded-lg ${adminTab === "fleet-fuel" ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}>Fuel Logs</button>
        <button onClick={() => setAdminTab("fleet-maintenance")} className={`px-4 py-2 rounded-lg ${adminTab === "fleet-maintenance" ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}>Service</button>
        <button onClick={() => setAdminTab("fleet-documents")} className={`px-4 py-2 rounded-lg ${adminTab === "fleet-documents" ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}>Documents</button>
      </nav>

      {adminTab === "dashboard" && (
        <>
          <BoardingLogPanel />
          <DriverCommunicationsPanel />
          <SmartStationManager stations={stations as StationRow[] | undefined} onChanged={() => queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() })} />
          <VehicleTagGrid vehicles={vehicles as VehicleRow[] | undefined} routes={adminRoutes as RouteRow[] | undefined} onTagUpdated={() => queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() })} />
          <RouteManager drivers={drivers} vehicles={vehicles as VehicleRow[] | undefined} />
          <CalendarManager />
        </>
      )}

      {adminTab === "fleet-fuel" && <FleetFuelPanel vehicles={[]} />}
      {adminTab === "fleet-maintenance" && <FleetMaintenancePanel vehicles={[]} />}
      {adminTab === "fleet-documents" && <FleetDocumentsPanel vehicles={[]} />}
    </div>
  );
}