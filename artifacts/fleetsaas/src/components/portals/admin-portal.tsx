import { useState, useCallback, useEffect, useRef } from "react";
import { useListStations, useListAnnouncements, useListPassengers, useListDrivers, useListRoutes, useListVehicles, getListPassengersQueryKey, getListDriversQueryKey, getListRoutesQueryKey, getListStationsQueryKey, useListCalendarEvents, getListCalendarEventsQueryKey } from "@workspace/api-client-react";
import { CheckCircle, MapPin, Home, Bus, Upload, Camera, Pencil, AlertTriangle, Wrench, Send, MessageSquare, Megaphone, Phone, Route, Plus, Trash2, Search, Navigation, ChevronDown, ChevronUp, X, RefreshCw, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { adToBs, bsToAd, getDaysInBsMonth, getFirstWeekdayOfBsMonth, todayBs, bsDateToAd, formatBsDate, BS_MONTH_NAMES_EN } from "@/lib/bs-calendar";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useDriverMessages } from "@/lib/driver-messages";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}
async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}
async function apiDelete(path: string) {
  await fetch(`${BASE}/api${path}`, { method: "DELETE" });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FLEET_VEHICLES = [
  { id: 1, plate: "BA 1 KHA 1234", driver: "Ram Bahadur", speed: 38, route: "B4 - Koteshwor", status: "on-route", fuel: 72, nextService: 3200, lat: 27.6939, lng: 85.3440 },
  { id: 2, plate: "BA 2 CHA 5678", driver: "Hari Prasad", speed: 0, route: "B2 - Kalanki Depot", status: "depot", fuel: 45, nextService: 800, lat: 27.7054, lng: 85.2814 },
  { id: 3, plate: "BA 3 JA 9012", driver: "Sita Rai", speed: 29, route: "B7 - Patan", status: "on-route", fuel: 88, nextService: 5100, lat: 27.6755, lng: 85.3216 },
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarManager() {
  const queryClient = useQueryClient();
  const todayB = todayBs();
  const [calSystem, setCalSystem] = useState<"bs" | "ad">("bs");
  const [bsYear, setBsYear] = useState(todayB.year);
  const [bsMonth, setBsMonth] = useState(todayB.month);

  // Derive AD month prefix from BS month for the API query
  const adMonthStr = (() => {
    const d = bsToAd(bsYear, bsMonth, 1);
    return `${d.year}-${String(d.month).padStart(2, "0")}`;
  })();

  const { data: events, refetch } = useListCalendarEvents({ month: adMonthStr });

  const [showForm, setShowForm] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eType, setEType] = useState<"event" | "holiday">("event");
  const [eAutoNotify, setEAutoNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

  const daysInMonth = getDaysInBsMonth(bsYear, bsMonth);
  const firstWeekday = getFirstWeekdayOfBsMonth(bsYear, bsMonth);

  // Map events by BS day
  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const ev of events ?? []) {
    // Convert AD eventDate "YYYY-MM-DD" to BS
    const parts = ev.eventDate.split("-").map(Number);
    const bs = adToBs(parts[0]!, parts[1]!, parts[2]!);
    if (bs.year === bsYear && bs.month === bsMonth) {
      const list = eventsByDay.get(bs.day) ?? [];
      list.push(ev as CalendarEvent);
      eventsByDay.set(bs.day, list);
    }
  }

  function prevMonth() {
    if (bsMonth === 1) { setBsYear(y => y - 1); setBsMonth(12); }
    else setBsMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (bsMonth === 12) { setBsYear(y => y + 1); setBsMonth(1); }
    else setBsMonth(m => m + 1);
    setSelectedDay(null);
  }

  function openAddForm(day: number) {
    setSelectedDay(day);
    setETitle(""); setEDesc(""); setEType("event"); setEAutoNotify(true); setFormErr("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!eTitle.trim() || !selectedDay) return;
    setFormErr(""); setSaving(true);
    try {
      const adDateStr = bsDateToAd(bsYear, bsMonth, selectedDay);
      const res = await fetch(`${BASE_URL}/api/calendar-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    await fetch(`${BASE_URL}/api/calendar-events/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: getListCalendarEventsQueryKey() });
    refetch();
  }

  const selectedDayEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-amber-500" />
          <div>
            <h2 className="font-semibold text-primary">School Calendar</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Events, holidays & auto-notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-0.5 text-xs font-semibold">
          <button onClick={() => setCalSystem("bs")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "bs" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>
            BS
          </button>
          <button onClick={() => setCalSystem("ad")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "ad" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>
            AD
          </button>
        </div>
      </div>

      {/* Month Nav */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="font-bold text-sm text-foreground">
            {BS_MONTH_NAMES_EN[bsMonth - 1]} {bsYear}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {adMonthStr.replace("-", " / ")} AD
          </p>
        </div>
        <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {/* Empty cells before first day */}
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = eventsByDay.get(day) ?? [];
            const isToday = day === todayB.day && bsMonth === todayB.month && bsYear === todayB.year;
            const isSelected = day === selectedDay;
            const hasHoliday = dayEvents.some(e => e.type === "holiday");
            const hasEvent = dayEvents.some(e => e.type === "event");
            return (
              <button key={day} onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`relative flex flex-col items-center rounded-xl py-1.5 transition-all text-xs font-medium
                  ${isSelected ? "bg-amber-500 text-slate-900 shadow-sm" : isToday ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" : "hover:bg-muted text-foreground"}
                `}>
                <span>{day}</span>
                <div className="flex gap-0.5 mt-0.5">
                  {hasHoliday && <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-slate-900" : "bg-red-500"}`} />}
                  {hasEvent && <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-slate-900" : "bg-blue-500"}`} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 px-1">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />Holiday
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />Event
          </span>
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDay && (
        <div className="border-t border-border mx-4 mb-4 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {formatBsDate({ year: bsYear, month: bsMonth, day: selectedDay })}
            </p>
            <button onClick={() => openAddForm(selectedDay)}
              className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-400 transition-colors">
              <Plus size={12} />Add
            </button>
          </div>
          {selectedDayEvents.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No events — tap Add to create one</p>
          )}
          {selectedDayEvents.map(ev => (
            <div key={ev.id} className={`flex items-start gap-3 rounded-xl border p-3
              ${ev.type === "holiday" ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20" : "border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${ev.type === "holiday" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>
                    {ev.type}
                  </span>
                  {ev.autoNotify && <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold">🔔 T-1 alert</span>}
                </div>
                <p className="text-sm font-medium text-foreground mt-1">{ev.title}</p>
                {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
              </div>
              <button onClick={() => handleDelete(ev.id)} className="text-muted-foreground hover:text-red-500 transition-colors mt-0.5">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Event Form */}
      {showForm && selectedDay && (
        <div className="border-t border-border mx-4 mb-4 pt-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New entry for {formatBsDate({ year: bsYear, month: bsMonth, day: selectedDay })}</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Title</label>
            <input value={eTitle} onChange={e => setETitle(e.target.value)} placeholder="e.g. Saraswati Puja, Parent Meeting…"
              className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Description (optional)</label>
            <input value={eDesc} onChange={e => setEDesc(e.target.value)} placeholder="Additional details…"
              className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Type</label>
              <select value={eType} onChange={e => setEType(e.target.value as "event" | "holiday")}
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                <option value="event">Event</option>
                <option value="holiday">Holiday</option>
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={eAutoNotify} onChange={e => setEAutoNotify(e.target.checked)}
                  className="h-4 w-4 rounded accent-amber-500" />
                <span className="text-xs font-medium text-foreground">Auto-notify day before</span>
              </label>
            </div>
          </div>
          {formErr && <p className="text-xs text-red-500">{formErr}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={handleSave} disabled={!eTitle.trim() || saving}
              className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
              {saving ? "Saving…" : "Save Event"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 85 ? "text-green-600 bg-green-100 dark:bg-green-950/40 border-green-200 dark:border-green-800"
    : score >= 70 ? "text-amber-600 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"
    : "text-red-600 bg-red-100 dark:bg-red-950/40 border-red-200 dark:border-red-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}>{score}/100</span>;
}

function PhotoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    onChange(dataUrl);
  }

  return (
    <div>
      <input ref={galleryRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="preview" className="h-12 w-12 rounded-full object-cover border border-border shrink-0" />
          <button onClick={() => onChange("")} className="text-xs text-red-500 hover:text-red-400">Remove</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => galleryRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-amber-500 transition-colors">
            <Upload size={13} className="shrink-0" /> Upload Photo
          </button>
          <button onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-amber-500 transition-colors">
            <Camera size={13} className="shrink-0" /> Take Photo
          </button>
        </div>
      )}
    </div>
  );
}

type Modal = "add-passenger" | "add-driver" | null;
type StatsFilter = "boarded" | "live" | "leave" | "buses" | null;
type Tenant = { id: number; name: string; address?: string | null; contactPhone?: string | null; bannerUrl?: string | null; };
type FleetVehicle = typeof FLEET_VEHICLES[number];

type Passenger = {
  id: number; name: string; role: string; status: string;
  liveToday: number; stationName?: string | null; quickMessage?: string | null; photoUrl?: string | null;
};

function StatsDetailPanel({
  filter, passengers, onClose,
}: {
  filter: StatsFilter;
  passengers: Passenger[];
  onClose: () => void;
}) {
  const filtered = (() => {
    if (filter === "boarded") return passengers.filter((p) => p.status === "boarded");
    if (filter === "live") return passengers.filter((p) => p.liveToday === 1);
    if (filter === "leave") return passengers.filter((p) => p.quickMessage === "Staying home today");
    return [];
  })();

  const META: Record<NonNullable<Exclude<StatsFilter, "buses">>, { title: string; empty: string }> = {
    boarded: { title: "On Board",       empty: "No passengers boarded yet" },
    live:    { title: "Live Today",      empty: "No passengers marked live" },
    leave:   { title: "On Leave Today", empty: "No passengers on leave" },
  };

  const isBuses = filter === "buses";
  const meta = isBuses ? null : META[filter as keyof typeof META];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-1.5">
              {isBuses ? <><Bus size={15} className="text-foreground" />Active Buses</> : meta!.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isBuses
                ? `${FLEET_VEHICLES.filter((v) => v.status === "on-route").length} of ${FLEET_VEHICLES.length} on route`
                : `${filtered.length} ${filtered.length === 1 ? "person" : "people"}`}
            </p>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 text-sm">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-border">
          {isBuses ? (
            FLEET_VEHICLES.filter((v) => v.status === "on-route").map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-950/40 border border-green-300 dark:border-green-700 flex items-center justify-center shrink-0"><Bus size={18} className="text-green-600 dark:text-green-400" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{v.plate}</p>
                  <p className="text-xs text-muted-foreground truncate">{v.driver} · {v.route}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="rounded-full bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 px-2 py-0.5 text-[10px] font-bold">
                    ● On Route
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{v.speed} km/h · {v.fuel}% fuel</p>
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">{meta!.empty}</p>
            </div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                <PassengerAvatar name={p.name} photoUrl={p.photoUrl} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                    <span className="rounded-full bg-muted border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground capitalize">{p.role}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.stationName ?? "—"}</p>
                  {p.quickMessage && (
                    <p className="text-[10px] text-blue-500 italic truncate flex items-center gap-1"><MessageSquare size={9} />"{p.quickMessage}"</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[p.status] ?? STATUS_STYLES.pending}`}>
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="pb-6 shrink-0" />
      </div>
    </div>
  );
}

function BusDetailPanel({ vehicle, onClose }: { vehicle: FleetVehicle; onClose: () => void }) {
  const messages = useDriverMessages(vehicle.plate);
  const score = DRIVER_SCORES.find((d) => d.name === vehicle.driver);
  const avatarSrc = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(vehicle.driver)}&backgroundColor=0F172A&textColor=D97706&fontSize=36`;
  const [zoomLevel, setZoomLevel] = useState(0);
  const bboxFactor = Math.pow(1.6, -zoomLevel);
  const bboxLng = 0.012 * bboxFactor;
  const bboxLat = 0.008 * bboxFactor;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full shrink-0 ${vehicle.status === "on-route" ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
            <div>
              <h2 className="text-base font-bold text-foreground">{vehicle.plate}</h2>
              <span className={`text-[10px] font-semibold ${vehicle.status === "on-route" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                {vehicle.status === "on-route" ? "● On Route" : "● At Depot"}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 text-sm">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Driver info */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <img src={avatarSrc} alt={vehicle.driver} className="h-14 w-14 rounded-full border-2 border-amber-500 object-cover shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-foreground">{vehicle.driver}</p>
              <p className="text-xs text-muted-foreground">{vehicle.route}</p>
              {score && (
                <div className="flex items-center gap-2 mt-1">
                  <ScoreBadge score={score.score} />
                  <span className="text-[10px] text-muted-foreground">{score.trips} trips · {score.harsh > 0 ? `${score.harsh} harsh events` : "✓ Clean"}</span>
                </div>
              )}
            </div>
          </div>

          {/* Live stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Speed</p>
              <p className={`text-lg font-bold ${vehicle.speed > 50 ? "text-red-500" : "text-foreground"}`}>{vehicle.speed}</p>
              <p className="text-[9px] text-muted-foreground">km/h</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Fuel</p>
              <p className={`text-lg font-bold ${vehicle.fuel < 30 ? "text-red-500" : vehicle.fuel < 60 ? "text-amber-500" : "text-green-600"}`}>{vehicle.fuel}%</p>
              <p className="text-[9px] text-muted-foreground">level</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Service</p>
              <p className={`text-lg font-bold ${vehicle.nextService < 1000 ? "text-red-500" : "text-foreground"}`}>{(vehicle.nextService / 1000).toFixed(1)}k</p>
              <p className="text-[9px] text-muted-foreground">km away</p>
            </div>
          </div>

          {/* Live Map Location */}
          <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
            {/* Map header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-card border-b border-border">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{vehicle.route}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {vehicle.status === "on-route"
                      ? `Moving · ${vehicle.speed} km/h · GPS live`
                      : "Stationary · At depot"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => window.open(`https://www.google.com/maps?q=${vehicle.lat},${vehicle.lng}`, "_blank", "noopener,noreferrer")}
                className="flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2.5 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors"
              >
                Open in Maps ↗
              </button>
            </div>

            {/* OpenStreetMap embedded iframe */}
            <div className="relative w-full" style={{ height: 180 }}>
              <iframe
                title="Bus location map"
                width="100%"
                height="180"
                style={{ border: 0, display: "block" }}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${vehicle.lng - bboxLng},${vehicle.lat - bboxLat},${vehicle.lng + bboxLng},${vehicle.lat + bboxLat}&layer=mapnik&marker=${vehicle.lat},${vehicle.lng}`}
              />

              {/* Live pulse indicator */}
              {vehicle.status === "on-route" ? (
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-green-600/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white shadow pointer-events-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  LIVE GPS
                </div>
              ) : (
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-slate-600/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-bold text-white shadow pointer-events-none">
                  DEPOT
                </div>
              )}

              {/* Zoom controls */}
              <div className="absolute bottom-2 right-2 flex flex-col gap-1">
                <button
                  onClick={() => setZoomLevel((z) => Math.min(z + 1, 5))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-border text-sm font-bold text-foreground shadow hover:bg-white dark:hover:bg-slate-700 transition-colors"
                  title="Zoom in"
                >
                  +
                </button>
                <button
                  onClick={() => setZoomLevel((z) => Math.max(z - 1, -3))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-border text-sm font-bold text-foreground shadow hover:bg-white dark:hover:bg-slate-700 transition-colors"
                  title="Zoom out"
                >
                  −
                </button>
              </div>
            </div>

            {/* Coords footer */}
            <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between">
              <p className="text-[10px] font-mono text-muted-foreground">{vehicle.lat.toFixed(4)}°N, {vehicle.lng.toFixed(4)}°E</p>
              <p className="text-[10px] text-muted-foreground">Use +/− to zoom</p>
            </div>
          </div>

          {/* Alerts */}
          {(vehicle.fuel < 30 || vehicle.nextService < 1000 || vehicle.speed > 50) && (
            <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle size={12} /> Alerts</p>
              {vehicle.fuel < 30 && <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1"><Wrench size={10} /> Fuel critically low ({vehicle.fuel}%)</p>}
              {vehicle.nextService < 1000 && <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1"><Wrench size={10} /> Service due in {vehicle.nextService} km</p>}
              {vehicle.speed > 50 && <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1"><AlertTriangle size={10} /> Speeding — {vehicle.speed} km/h</p>}
            </div>
          )}

          {/* Driver messages */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5"><Send size={12} /> Driver Reports {messages.length > 0 && <span className="rounded-full bg-blue-100 dark:bg-blue-950/40 px-1.5 text-blue-700 dark:text-blue-400">{messages.length}</span>}</span>
            </p>
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1">No reports from driver</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 px-3 py-2.5">
                    {m.isCustom ? <MessageSquare size={15} className="shrink-0 text-blue-500" /> : <Megaphone size={15} className="shrink-0 text-blue-500" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">"{m.text}"</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{m.driverName} · {m.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="pb-6 shrink-0" />
      </div>
    </div>
  );
}

type GeocodeResult = { displayName: string; lat: number; lng: number };
type RouteStation = { id: number; routeId: number; stationId: number; position: number; stationName: string | null; lat: number | null; lng: number | null; radius: number | null };
type RouteRow = { id: number; name: string; driverId: number | null; vehicleId: number | null; isActive: boolean | null; driverName: string | null; vehiclePlate: string | null };

function RouteStationsPanel({ routeId, onClose }: { routeId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: stations } = useListStations();
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/routes/${routeId}/stations`);
      const data = await r.json();
      setRouteStations(data);
    } finally { setLoading(false); }
  }, [routeId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!addingId) return;
    await apiPost(`/routes/${routeId}/stations`, { stationId: Number(addingId) });
    setAddingId("");
    load();
  }

  async function handleRemove(stationId: number) {
    await apiDelete(`/routes/${routeId}/stations/${stationId}`);
    load();
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
  }

  const assignedIds = new Set(routeStations.map((rs) => rs.stationId));
  const available = (stations ?? []).filter((s) => !assignedIds.has(s.id));

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Stations on this route ({routeStations.length})</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1">
          {routeStations.length === 0 && <p className="text-xs text-muted-foreground italic">No stations assigned yet</p>}
          {routeStations.map((rs, idx) => (
            <div key={rs.id} className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2">
              <span className="text-[10px] font-bold text-amber-500 w-4 shrink-0">{idx + 1}</span>
              <Navigation size={11} className="text-muted-foreground shrink-0" />
              <p className="flex-1 text-xs text-foreground">{rs.stationName ?? `Station #${rs.stationId}`}</p>
              {rs.radius && <span className="text-[9px] text-muted-foreground">{rs.radius}m</span>}
              <button onClick={() => handleRemove(rs.stationId)} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <div className="flex gap-2">
          <select value={addingId} onChange={(e) => setAddingId(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus:border-amber-500">
            <option value="">Add a station…</option>
            {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={handleAdd} disabled={!addingId}
            className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-900 disabled:opacity-50 hover:bg-amber-400">
            <Plus size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function RouteManager({ drivers, vehicles }: { drivers: Array<{ id: number; name: string }> | undefined; vehicles: Array<{ id: number; plateNumber: string }> | undefined }) {
  const queryClient = useQueryClient();
  const { data: routes, refetch } = useListRoutes();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [rName, setRName] = useState("");
  const [rDriver, setRDriver] = useState("");
  const [rVehicle, setRVehicle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleCreate() {
    if (!rName.trim()) return;
    setErr(""); setSaving(true);
    try {
      await apiPost("/routes", { name: rName.trim(), driverId: rDriver ? Number(rDriver) : undefined, vehicleId: rVehicle ? Number(rVehicle) : undefined });
      setRName(""); setRDriver(""); setRVehicle(""); setCreating(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleToggleActive(r: RouteRow) {
    await apiPatch(`/routes/${r.id}`, { isActive: !r.isActive });
    refetch();
  }

  async function handleDelete(id: number) {
    await apiDelete(`/routes/${id}`);
    refetch();
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-primary flex items-center gap-2"><Route size={15} />Route Management</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{(routes ?? []).length} route{(routes ?? []).length !== 1 ? "s" : ""} configured</p>
        </div>
        <button onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400 transition-colors">
          <Plus size={12} />New Route
        </button>
      </div>

      {creating && (
        <div className="px-5 py-4 border-b border-border bg-muted/30 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Route Name</label>
            <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="e.g. Route B4 – Koteshwor"
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Assign Driver</label>
              <select value={rDriver} onChange={(e) => setRDriver(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                <option value="">Unassigned</option>
                {(drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Assign Vehicle</label>
              <select value={rVehicle} onChange={(e) => setRVehicle(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                <option value="">Unassigned</option>
                {(vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
              </select>
            </div>
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setCreating(false); setRName(""); setErr(""); }}
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={handleCreate} disabled={!rName.trim() || saving}
              className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
              {saving ? "Creating…" : "Create Route"}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        {(routes ?? []).length === 0 && !creating && (
          <p className="px-5 py-6 text-center text-xs text-muted-foreground">No routes yet — create one above</p>
        )}
        {(routes as RouteRow[] ?? []).map((r) => (
          <div key={r.id} className="px-5 py-3">
            <div className="flex items-center gap-3">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${r.isActive ? "bg-green-500" : "bg-gray-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {r.driverName ?? "No driver"} · {r.vehiclePlate ?? "No vehicle"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => handleToggleActive(r)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border transition-colors ${r.isActive ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" : "bg-muted text-muted-foreground border-border hover:border-amber-500"}`}>
                  {r.isActive ? "Active" : "Inactive"}
                </button>
                <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                  {expandedId === r.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
              </div>
            </div>
            {expandedId === r.id && (
              <RouteStationsPanel routeId={r.id} onClose={() => setExpandedId(null)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GeocodeStationCreator({ onCreated }: { onCreated: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [stationName, setStationName] = useState("");
  const [radius, setRadius] = useState("200");
  const [picked, setPicked] = useState<GeocodeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  async function handleSearch() {
    if (!query.trim()) return;
    setSearchErr(""); setSearching(true); setResults([]); setPicked(null);
    try {
      const r = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(query)}`);
      const data: GeocodeResult[] = await r.json();
      if (data.length === 0) setSearchErr("No locations found — try a different search term");
      setResults(data);
    } catch { setSearchErr("Geocode search failed"); }
    finally { setSearching(false); }
  }

  async function handleSave() {
    if (!picked || !stationName.trim()) return;
    setSaving(true);
    try {
      await apiPost("/stations", { name: stationName.trim(), lat: picked.lat, lng: picked.lng, radius: Number(radius) || 200 });
      setQuery(""); setResults([]); setPicked(null); setStationName(""); setRadius("200");
      onCreated();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Search size={11} />Add Geofence Station (address lookup)</p>
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Koteshwor, Kathmandu"
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
        <button onClick={handleSearch} disabled={!query.trim() || searching}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
          {searching ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
        </button>
      </div>
      {searchErr && <p className="text-xs text-red-500">{searchErr}</p>}
      {results.length > 0 && !picked && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">Pick a location:</p>
          {results.map((r, i) => (
            <button key={i} onClick={() => { setPicked(r); setStationName(r.displayName.split(",")[0]?.trim() ?? ""); }}
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-left hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors">
              <p className="text-xs font-medium text-foreground line-clamp-1">{r.displayName}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</p>
            </button>
          ))}
        </div>
      )}
      {picked && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">Selected location</p>
              <p className="text-xs text-foreground mt-0.5 line-clamp-2">{picked.displayName}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}</p>
            </div>
            <button onClick={() => { setPicked(null); setResults([]); }} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"><X size={13} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Station Name</label>
              <input value={stationName} onChange={(e) => setStationName(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Geofence Radius</label>
              <div className="flex items-center gap-1">
                <input type="number" min="50" max="2000" value={radius} onChange={(e) => setRadius(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-amber-500" />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">m</span>
              </div>
            </div>
          </div>
          <button onClick={handleSave} disabled={!stationName.trim() || saving}
            className="w-full rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
            {saving ? "Saving…" : "Save Station"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminPortal() {
  const { user, login } = useAuth();
  const { data: stations, refetch: refetchStations } = useListStations();
  const { data: announcements, refetch: refetchAnnouncements } = useListAnnouncements();
  const { data: passengers, refetch: refetchPassengers } = useListPassengers();
  const { data: drivers, refetch: refetchDrivers } = useListDrivers();
  const { data: vehicles } = useListVehicles();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
  const [statsFilter, setStatsFilter] = useState<StatsFilter>(null);

  const [tenant, setTenant] = useState<Tenant | null>(user?.tenant ?? null);
  const [editingSchool, setEditingSchool] = useState(false);
  const bannerGalleryRef = useRef<HTMLInputElement>(null);
  const bannerCameraRef = useRef<HTMLInputElement>(null);
  const bannerEditGalleryRef = useRef<HTMLInputElement>(null);
  const bannerEditCameraRef = useRef<HTMLInputElement>(null);

  const [sName, setSName] = useState("");
  const [sAddress, setSAddress] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [sBanner, setSBanner] = useState("");
  const [schoolSaving, setSchoolSaving] = useState(false);
  const [schoolErr, setSchoolErr] = useState("");

  // Inline banner editor
  const [bannerEditing, setBannerEditing] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(100);
  const [bannerPositionY, setBannerPositionY] = useState(50);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerSaving, setBannerSaving] = useState(false);

  const [newNotice, setNewNotice] = useState("");
  const [noticeSaving, setNoticeSaving] = useState(false);

  const [pName, setPName] = useState("");
  const [pRole, setPRole] = useState("student");
  const [pStation, setPStation] = useState("1");
  const [pPhoto, setPPhoto] = useState("");

  const [dName, setDName] = useState("");
  const [dPhone, setDPhone] = useState("");
  const [dVehicle, setDVehicle] = useState("");
  const [dPhoto, setDPhoto] = useState("");

  const tenantId = user?.tenantId ?? 1;

  useEffect(() => {
    if (!tenant) {
      fetch(`${BASE}/api/tenants/${tenantId}`)
        .then((r) => r.json())
        .then((data: Tenant) => setTenant(data))
        .catch(() => {});
    }
  }, [tenantId, tenant]);

  function openEditSchool() {
    setSName(tenant?.name ?? "");
    setSAddress(tenant?.address ?? "");
    setSPhone(tenant?.contactPhone ?? "");
    setSBanner(tenant?.bannerUrl ?? "");
    setSchoolErr("");
    setEditingSchool(true);
  }

  async function handleSaveBanner() {
    setBannerSaving(true);
    try {
      const newUrl = bannerPreview ?? tenant?.bannerUrl ?? null;
      const updated = await apiPatch(`/tenants/${tenantId}`, { bannerUrl: newUrl });
      setTenant(updated);
      if (user) login({ ...user, tenant: { id: updated.id, name: updated.name, bannerUrl: updated.bannerUrl, address: updated.address } });
      setBannerEditing(false);
      setBannerPreview(null);
    } catch { /* ignore */ }
    finally { setBannerSaving(false); }
  }

  async function handleSaveSchool() {
    setSchoolErr(""); setSchoolSaving(true);
    try {
      const updated = await apiPatch(`/tenants/${tenantId}`, {
        name: sName, address: sAddress, contactPhone: sPhone, bannerUrl: sBanner || null,
      });
      setTenant(updated);
      if (user) login({ ...user, tenant: { id: updated.id, name: updated.name, bannerUrl: updated.bannerUrl, address: updated.address } });
      setEditingSchool(false);
    } catch (e: unknown) { setSchoolErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSchoolSaving(false); }
  }

  async function handleAddNotice() {
    if (!newNotice.trim()) return;
    setNoticeSaving(true);
    try {
      await apiPost("/announcements", { message: newNotice.trim(), severity: "info" });
      setNewNotice("");
      refetchAnnouncements();
    } catch { /* ignore */ }
    finally { setNoticeSaving(false); }
  }

  async function handleDeleteNotice(id: number) {
    await apiDelete(`/announcements/${id}`);
    refetchAnnouncements();
  }

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
      await apiPost("/drivers", { name: dName, phone: dPhone, vehicleNumber: dVehicle, photoUrl: dPhoto || undefined });
      queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
      refetchDrivers();
      setModal(null); setDName(""); setDPhone(""); setDVehicle(""); setDPhoto("");
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [dName, dPhone, dVehicle, dPhoto, queryClient, refetchDrivers]);

  const boardedCount = passengers?.filter((p) => p.status === "boarded").length ?? 0;
  const liveTodayCount = passengers?.filter((p) => p.liveToday === 1).length ?? 0;
  const onLeaveCount = passengers?.filter((p) => p.quickMessage === "Staying home today").length ?? 0;
  const onRouteCount = FLEET_VEHICLES.filter(v => v.status === "on-route").length;

  return (
    <div className="mx-auto w-full max-w-[860px] p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{tenant?.name ?? "School"} · Real-time Overview</p>
        </div>
        <span className="rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
          Gold Plan
        </span>
      </header>
      {/* Key Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "On Board", value: boardedCount, color: "text-primary", bg: "bg-card", filter: "boarded" as StatsFilter },
          { label: "Live Today", value: liveTodayCount, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20", filter: "live" as StatsFilter },
          { label: "On Leave", value: onLeaveCount, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/20", filter: "leave" as StatsFilter },
          { label: "Buses Active", value: onRouteCount, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20", filter: "buses" as StatsFilter },
        ].map((s) => (
          <button key={s.label} onClick={() => setStatsFilter(s.filter)}
            className={`rounded-2xl border border-border ${s.bg} p-4 text-center shadow-sm hover:ring-2 hover:ring-amber-500/40 active:scale-95 transition-all cursor-pointer`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">tap to view ›</p>
          </button>
        ))}
      </div>
      {/* School Settings */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-primary">School Settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Banner · Contact · Notices shown to students & staff</p>
          </div>
          {!editingSchool && (
            <button onClick={openEditSchool}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
              <Pencil size={12} className="inline mr-1" />Edit
            </button>
          )}
        </div>
        {!editingSchool ? (
          <div className="p-5 space-y-3">
            {/* Hidden inputs for inline banner editor */}
            <input ref={bannerEditGalleryRef} type="file" accept="image/*" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setBannerPreview(await fileToDataUrl(f)); }} />
            <input ref={bannerEditCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setBannerPreview(await fileToDataUrl(f)); }} />

            {(tenant?.bannerUrl || bannerPreview) ? (
              <div className="space-y-2">
                {/* Banner preview with live crop/height */}
                <div className="relative rounded-xl overflow-hidden border border-border"
                  style={{ height: bannerHeight }}>
                  <img
                    src={bannerPreview ?? tenant!.bannerUrl!}
                    alt="banner"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: `center ${bannerPositionY}%` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-end p-3">
                    <p className="text-sm font-bold text-white">{tenant?.name}</p>
                  </div>
                  {/* Edit overlay button */}
                  {!bannerEditing && (
                    <button
                      onClick={() => setBannerEditing(true)}
                      className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-black/50 hover:bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm transition-colors"
                    >
                      <Pencil size={11} className="inline mr-1" />Edit Banner
                    </button>
                  )}
                </div>

                {/* Inline editor controls */}
                {bannerEditing && (
                  <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-muted-foreground">Height</label>
                        <span className="text-xs text-muted-foreground">{bannerHeight}px</span>
                      </div>
                      <input type="range" min={60} max={220} value={bannerHeight}
                        onChange={(e) => setBannerHeight(Number(e.target.value))}
                        className="w-full accent-amber-500" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-muted-foreground">Crop Position</label>
                        <span className="text-xs text-muted-foreground">{bannerPositionY === 0 ? "Top" : bannerPositionY === 100 ? "Bottom" : "Middle"}</span>
                      </div>
                      <input type="range" min={0} max={100} value={bannerPositionY}
                        onChange={(e) => setBannerPositionY(Number(e.target.value))}
                        className="w-full accent-amber-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => bannerEditGalleryRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-xs font-medium text-foreground hover:border-amber-500 hover:text-amber-500 transition-colors">
                        <Upload size={13} className="inline mr-1" />Change Photo
                      </button>
                      <button onClick={() => bannerEditCameraRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-xs font-medium text-foreground hover:border-amber-500 hover:text-amber-500 transition-colors">
                        <Camera size={13} className="inline mr-1" />Take Photo
                      </button>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setBannerEditing(false); setBannerPreview(null); setBannerHeight(100); setBannerPositionY(50); }}
                        className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
                        Cancel
                      </button>
                      <button onClick={handleSaveBanner} disabled={bannerSaving}
                        className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                        {bannerSaving ? "Saving…" : "Save Banner"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-border p-6 text-center">
                <p className="text-xs text-muted-foreground">No banner set — click Edit to add a school banner image</p>
              </div>
            )}
            <div className="flex items-center gap-4 text-sm">
              {tenant?.address && <span className="text-muted-foreground flex items-center gap-1"><MapPin size={12} />{tenant.address}</span>}
              {tenant?.contactPhone && <span className="text-muted-foreground flex items-center gap-1"><Phone size={12} />{tenant.contactPhone}</span>}
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">School Name</label>
              <input value={sName} onChange={(e) => setSName(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Address</label>
                <input value={sAddress} onChange={(e) => setSAddress(e.target.value)} placeholder="Koteshwor, Kathmandu"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Contact Phone</label>
                <input value={sPhone} onChange={(e) => setSPhone(e.target.value)} placeholder="+977 01-XXXXXXX"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">School Banner (shown at the top of all dashboards)</label>
              {sBanner ? (
                <div className="space-y-2">
                  <img src={sBanner} alt="banner preview" className="h-24 w-full rounded-xl object-cover border border-border"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  <button onClick={() => setSBanner("")}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors">
                    Remove banner
                  </button>
                </div>
              ) : (
                <>
                  <input ref={bannerGalleryRef} type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setSBanner(await fileToDataUrl(file));
                    }} />
                  <input ref={bannerCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setSBanner(await fileToDataUrl(file));
                    }} />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => bannerGalleryRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-3 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-amber-500 transition-colors">
                      <Upload size={13} className="inline mr-1" />Upload Photo
                    </button>
                    <button onClick={() => bannerCameraRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-3 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-amber-500 transition-colors">
                      <Camera size={13} className="inline mr-1" />Take Photo
                    </button>
                  </div>
                </>
              )}
            </div>
            {schoolErr && <p className="text-xs text-red-500">{schoolErr}</p>}
            <div className="flex gap-2">
              <button onClick={() => setEditingSchool(false)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleSaveSchool} disabled={!sName || schoolSaving}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                {schoolSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Notices */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border border-t-[#ffb900] border-r-[#ffb900] border-b-[#ffb900] border-l-[#ffb900] bg-[#ffb900] rounded-tl-[12px] rounded-tr-[12px] rounded-br-[12px] rounded-bl-[12px]">
          <h2 className="font-semibold text-primary">Notices & Announcements</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Shown on all student & staff dashboards</p>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex gap-2">
            <input value={newNotice} onChange={(e) => setNewNotice(e.target.value)}
              placeholder="e.g. Bus will be 15 min late tomorrow…"
              className="flex-1 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500"
              onKeyDown={(e) => e.key === "Enter" && handleAddNotice()} />
            <button onClick={handleAddNotice} disabled={!newNotice.trim() || noticeSaving}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {noticeSaving ? "…" : "Post"}
            </button>
          </div>
          {announcements?.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900 dark:bg-red-950/20 p-3 bg-[#C7C7C7]">
              <p className="flex-1 text-sm dark:text-red-300 bg-[#C7C7C7] text-[#ff0000] font-bold">{a.message}</p>
              <button onClick={() => handleDeleteNotice(a.id)}
                className="shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-300 text-lg leading-none">×</button>
            </div>
          ))}
          {announcements?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No notices yet</p>
          )}
        </div>
      </div>
      {/* Passengers */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-medium text-[#000] border-t-[color:var(--color-slate-700)] border-r-[color:var(--color-slate-700)] border-b-[color:var(--color-slate-700)] border-l-[color:var(--color-slate-700)] bg-[#ffb900] px-2 py-0.5 inline-block text-sm rounded-tl-[12px] rounded-tr-[12px] rounded-br-[12px] rounded-bl-[12px]">On Board</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{passengers?.length ?? 0} students & staff</p>
          </div>
          <button onClick={() => { setModal("add-passenger"); setErr(""); setPPhoto(""); }}
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
                {p.quickMessage && <p className="text-[10px] text-blue-500 italic truncate flex items-center gap-1"><MessageSquare size={9} />"{p.quickMessage}"</p>}
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[p.status] ?? STATUS_STYLES.pending}`}>
                {STATUS_LABELS[p.status] ?? p.status}
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* Drivers */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-primary">Drivers</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{drivers?.length ?? 0} registered</p>
          </div>
          <button onClick={() => { setModal("add-driver"); setErr(""); setDPhoto(""); }}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
            + Add Driver
          </button>
        </div>
        <div className="divide-y divide-border">
          {drivers?.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <img src={d.photoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(d.name)}&backgroundColor=0F172A&textColor=D97706`}
                alt={d.name} className="h-10 w-10 rounded-full border border-border object-cover shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.phone} · {d.vehicleNumber}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                d.isActive ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
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
            <button key={v.id}
              onClick={() => setSelectedVehicle(v)}
              className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-muted/40 transition-colors">
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
              <div className="flex items-center gap-4">
                <div className="hidden sm:block text-right">
                  <p className="text-xs text-muted-foreground">Speed</p>
                  <p className={`text-sm font-bold ${v.speed > 50 ? "text-red-500" : "text-foreground"}`}>{v.speed} km/h</p>
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs text-muted-foreground">Fuel</p>
                  <div className="flex items-center gap-1">
                    <div className="w-12 h-1.5 rounded-full bg-border overflow-hidden">
                      <div className={`h-full rounded-full ${v.fuel < 30 ? "bg-red-500" : v.fuel < 60 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${v.fuel}%` }} />
                    </div>
                    <p className="text-xs font-medium">{v.fuel}%</p>
                  </div>
                </div>
                <span className="text-muted-foreground/40 text-sm">›</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* Driver Safety */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">Driver Safety Scores</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Monthly AI-analyzed driving behavior</p>
        </div>
        <div className="divide-y divide-border">
          {DRIVER_SCORES.map((d) => (
            <div key={d.name} className="flex items-center gap-4 px-5 py-3">
              <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(d.name)}&backgroundColor=0F172A&textColor=D97706&fontSize=36`} alt={d.name} className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{d.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground">{d.trips} trips</span>
                  {d.harsh > 0 ? <span className="text-[10px] text-red-500 font-semibold flex items-center gap-0.5"><AlertTriangle size={9} />{d.harsh} harsh events</span> : <span className="text-[10px] text-green-500 font-semibold">✓ Clean</span>}
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
              <span className="shrink-0 text-muted-foreground">{v.nextService < 1000 ? <Wrench size={18} className="text-red-500" /> : <Bus size={18} />}</span>
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
      {/* Geofence Stations */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary flex items-center gap-2"><MapPin size={14} />Geofence Stations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{stations?.length ?? 0} stations · OSM address lookup</p>
        </div>
        <div className="divide-y divide-border">
          {stations?.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <MapPin size={14} className="text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-foreground">{s.name}</p>
                {(s as unknown as { lat?: number; radius?: number }).lat && (
                  <p className="text-[10px] text-muted-foreground">
                    {(s as unknown as { lat: number }).lat.toFixed(4)}, {(s as unknown as { lng: number }).lng?.toFixed(4)} · {(s as unknown as { radius?: number }).radius ?? 200}m
                  </p>
                )}
              </div>
            </div>
          ))}
          {stations?.length === 0 && (
            <p className="px-4 py-4 text-xs text-muted-foreground text-center italic">No stations yet — add one below</p>
          )}
        </div>
        <div className="px-5 pb-5">
          <GeocodeStationCreator onCreated={() => { refetchStations(); queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() }); }} />
        </div>
      </div>
      {/* Route Management */}
      <RouteManager drivers={drivers} vehicles={vehicles} />
      {/* School Calendar */}
      <CalendarManager />
      {/* Stats Detail Panel */}
      {statsFilter && (
        <StatsDetailPanel
          filter={statsFilter}
          passengers={(passengers ?? []) as Passenger[]}
          onClose={() => setStatsFilter(null)}
        />
      )}
      {/* Bus Detail Panel */}
      {selectedVehicle && (
        <BusDetailPanel vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
      )}
      {/* MODAL: Add Passenger */}
      {modal === "add-passenger" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
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
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Profile Photo <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <PhotoPicker value={pPhoto} onChange={setPPhoto} />
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
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
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                Driver Photo <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <PhotoPicker value={dPhoto} onChange={setDPhoto} />
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
