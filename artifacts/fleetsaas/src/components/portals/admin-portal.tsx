import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useListStations, useListAnnouncements, useListPassengers, useListDrivers, useListRoutes, useListVehicles, getListPassengersQueryKey, getListDriversQueryKey, getListRoutesQueryKey, getListStationsQueryKey, getListVehiclesQueryKey, getListAnnouncementsQueryKey, useListCalendarEvents, getListCalendarEventsQueryKey, getTenantId } from "@workspace/api-client-react";
import { CheckCircle, MapPin, Home, Bus, Upload, Camera, Pencil, AlertTriangle, Wrench, Send, MessageSquare, Megaphone, Phone, Route, Plus, Trash2, Search, Navigation, ChevronDown, ChevronUp, X, RefreshCw, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Star, Clock, Lock, User, Bell, Droplets, FileText, BarChart3, Gauge, AlertCircle, Settings2 } from "lucide-react";
import StationMapPicker from "@/components/station-map-picker";
import OsmMap, { type RouteStop } from "@/components/osm-map";
import { useDriverLocation } from "@/hooks/use-driver-location";
import { adToBs, bsToAd, getDaysInBsMonth, getFirstWeekdayOfBsMonth, todayBs, bsDateToAd, BS_MONTH_NAMES_NE, AD_MONTH_NAMES } from "@/lib/bs-calendar";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useDriverMessages } from "@/lib/driver-messages";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function tenantHeaders(): Record<string, string> {
  const id = getTenantId();
  return id !== null ? { "Content-Type": "application/json", "x-tenant-id": String(id) } : { "Content-Type": "application/json" };
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api${path}`, { method: "POST", headers: tenantHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}
async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api${path}`, { method: "PATCH", headers: tenantHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}
async function apiDelete(path: string) {
  const id = getTenantId();
  const headers: Record<string, string> = id !== null ? { "x-tenant-id": String(id) } : {};
  await fetch(`${BASE}/api${path}`, { method: "DELETE", headers });
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
  // A BS month always spans TWO AD months (e.g. Ashadh 2083 = Jun 15–Jul 16).
  // We fetch both AD months and merge so no events are missed.
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
  // Always call the hook (React rules); when no second month is needed pass month1 again (deduped by cache)
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

  const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

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

  // Grid dimensions
  const daysInMonth = calSystem === "bs" ? getDaysInBsMonth(bsYear, bsMonth) : getAdDaysInMonth(adYear, adMonth);
  const firstWeekday = calSystem === "bs" ? getFirstWeekdayOfBsMonth(bsYear, bsMonth) : getAdFirstWeekday(adYear, adMonth);

  // Map events by day number in the current view
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
  const headerTitle = calSystem === "bs"
    ? `${BS_MONTH_NAMES_NE[bsMonth - 1]} ${bsYear}`
    : `${AD_MONTH_NAMES[adMonth - 1]} ${adYear}`;
  const headerSubtitle = calSystem === "bs"
    ? `${queryMonth1.replace("-", " / ")} AD`
    : (() => { const bs = adToBs(adYear, adMonth, 1); return `${BS_MONTH_NAMES_NE[bs.month - 1]} ${bs.year} BS`; })();

  const selectedDayLabel = selectedDay
    ? calSystem === "bs"
      ? `${selectedDay} ${BS_MONTH_NAMES_NE[bsMonth - 1]} ${bsYear} BS`
      : `${selectedDay} ${AD_MONTH_NAMES[adMonth - 1]} ${adYear} AD`
    : "";

  function openAddForm(day: number) {
    setSelectedDay(day);
    setETitle(""); setEDesc(""); setEType("event"); setEAutoNotify(true); setFormErr("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!eTitle.trim() || !selectedDay) return;
    setFormErr(""); setSaving(true);
    try {
      const adDateStr = calSystem === "bs"
        ? bsDateToAd(bsYear, bsMonth, selectedDay)
        : `${adYear}-${String(adMonth).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
      const res = await fetch(`${BASE_URL}/api/calendar-events`, {
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
    await fetch(`${BASE_URL}/api/calendar-events/${id}`, { method: "DELETE", headers: _tid !== null ? { "x-tenant-id": String(_tid) } : {} });
    queryClient.invalidateQueries({ queryKey: getListCalendarEventsQueryKey() });
    refetch();
  }

  const selectedDayEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-[#FFF078]" />
          <div>
            <h2 className="font-semibold text-primary">विद्यालय क्यालेन्डर</h2>
            <p className="text-xs text-muted-foreground mt-0.5">School Calendar · Events &amp; Holidays</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-0.5 text-xs font-semibold">
          <button onClick={() => switchTo("bs")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "bs" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>
            BS
          </button>
          <button onClick={() => switchTo("ad")}
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
          <p className="font-bold text-sm text-foreground">{headerTitle}</p>
          <p className="text-[10px] text-muted-foreground">{headerSubtitle}</p>
        </div>
        <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Today banner */}
      <div className="flex items-center justify-center gap-2 px-5 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Today</span>
        <span className="text-xs font-bold text-foreground">
          {BS_MONTH_NAMES_NE[todayB.month - 1]} {todayB.day}, {todayB.year} BS
        </span>
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className="text-xs font-bold text-foreground">
          {AD_MONTH_NAMES[todayAd.getMonth()]} {todayAd.getDate()}, {todayAd.getFullYear()} AD
        </span>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = eventsByDay.get(day) ?? [];
            const isToday = isTodayCell(day);
            const isSelected = day === selectedDay;
            const hasHoliday = dayEvents.some(e => e.type === "holiday");
            const hasEvent = dayEvents.some(e => e.type === "event");
            return (
              <button key={day} onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`relative flex flex-col items-center rounded-xl py-1.5 transition-all text-xs
                  ${isSelected
                    ? "bg-amber-500 text-slate-900 shadow-sm font-bold"
                    : isToday
                    ? "bg-amber-400 dark:bg-amber-500 text-white font-extrabold ring-2 ring-amber-500 ring-offset-1 dark:ring-offset-card shadow-sm"
                    : hasHoliday
                    ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 font-semibold hover:bg-red-200 dark:hover:bg-red-950/50"
                    : "hover:bg-muted text-foreground font-medium"}
                `}>
                <span className={isToday ? "text-sm" : ""}>{day}</span>
                <div className="flex gap-0.5 mt-0.5">
                  {hasHoliday && !isSelected && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                  {hasHoliday && isSelected && <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />}
                  {hasEvent && !isSelected && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                  {hasEvent && isSelected && <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 px-1">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-3 w-3 rounded bg-amber-400 inline-block" />आज (Today)
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-3 w-3 rounded bg-red-100 dark:bg-red-950/30 border border-red-300 dark:border-red-700 inline-block" />सार्वजनिक बिदा
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />कार्यक्रम
          </span>
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDay && (
        <div className="border-t border-border mx-4 mb-4 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-foreground">{selectedDayLabel}</p>
              {/* show the other system's date underneath */}
              <p className="text-[10px] text-muted-foreground">
                {calSystem === "bs"
                  ? (() => { const ad = bsDateToAd(bsYear, bsMonth, selectedDay); return ad; })()
                  : (() => { const bs = adToBs(adYear, adMonth, selectedDay); return `${BS_MONTH_NAMES_NE[bs.month - 1]} ${bs.day}, ${bs.year} BS`; })()
                }
              </p>
            </div>
            <button onClick={() => openAddForm(selectedDay)}
              className="shrink-0 flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-400 transition-colors">
              <Plus size={12} />Add Event
            </button>
          </div>
          {selectedDayEvents.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-4 text-center">
              <p className="text-xs text-muted-foreground">No events on this day</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Click Add Event to create one</p>
            </div>
          )}
          {selectedDayEvents.map(ev => (
            <div key={ev.id} className={`flex items-start gap-3 rounded-xl border p-3
              ${ev.type === "holiday"
                ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
                : "border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20"}`}>
              <div className={`mt-0.5 shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-base ${ev.type === "holiday" ? "bg-red-100 dark:bg-red-900/40" : "bg-blue-100 dark:bg-blue-900/40"}`}>
                {ev.type === "holiday" ? "🎉" : "📅"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${ev.type === "holiday" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>
                    {ev.type === "holiday" ? "सार्वजनिक बिदा" : "कार्यक्रम"}
                  </span>
                  {ev.autoNotify && <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold">🔔 Alert</span>}
                </div>
                <p className={`text-sm font-bold mt-1 ${ev.type === "holiday" ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>{ev.title}</p>
                {ev.description && <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>}
              </div>
              <button onClick={() => handleDelete(ev.id)} className="text-muted-foreground hover:text-red-500 transition-colors mt-0.5 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Event Form */}
      {showForm && selectedDay && (
        <div className="border-t border-border mx-4 mb-4 pt-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">नयाँ प्रविष्टि: {selectedDayLabel}</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">शीर्षक / Title</label>
            <input value={eTitle} onChange={e => setETitle(e.target.value)} placeholder="e.g. सरस्वती पूजा, Parent Meeting…"
              className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">विवरण / Description (optional)</label>
            <input value={eDesc} onChange={e => setEDesc(e.target.value)} placeholder="Additional details…"
              className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">प्रकार / Type</label>
              <select value={eType} onChange={e => setEType(e.target.value as "event" | "holiday")}
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                <option value="event">कार्यक्रम (Event)</option>
                <option value="holiday">सार्वजनिक बिदा (Holiday)</option>
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
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">रद्द / Cancel</button>
            <button onClick={handleSave} disabled={!eTitle.trim() || saving}
              className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
              {saving ? "Saving…" : "सुरक्षित / Save"}
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
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors">
            <Upload size={13} className="shrink-0" /> Upload Photo
          </button>
          <button onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors">
            <Camera size={13} className="shrink-0" /> Take Photo
          </button>
        </div>
      )}
    </div>
  );
}

type Modal = "add-passenger" | "add-driver" | null;
type StatsFilter = "boarded" | "live" | "leave" | "buses" | null;
type Tenant = { id: number; name: string; address?: string | null; contactPhone?: string | null; bannerUrl?: string | null; schoolCode?: string | null; };
type FleetVehicle = typeof FLEET_VEHICLES[number];

type Passenger = {
  id: number; name: string; phone?: string | null; role: string; status: string;
  liveToday: number; stationId: number; stationName?: string | null; quickMessage?: string | null; photoUrl?: string | null;
};

function PassengerDetailCard({ p, onClose }: { p: Passenger; onClose: () => void }) {
  const initials = p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Top banner with avatar */}
        <div className="relative bg-gradient-to-br from-amber-400/20 to-amber-600/10 px-6 pt-8 pb-6 flex flex-col items-center gap-3 border-b border-border">
          <button onClick={onClose}
            className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 text-sm">
            ✕
          </button>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt={p.name}
              className="h-20 w-20 rounded-full object-cover border-4 border-background shadow-lg" />
          ) : (
            <div className="h-20 w-20 rounded-full border-4 border-background shadow-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{initials}</span>
            </div>
          )}
          <div className="text-center">
            <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
            <span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-xs text-muted-foreground capitalize">{p.role}</span>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[p.status] ?? STATUS_STYLES.pending}`}>
            {STATUS_LABELS[p.status] ?? p.status}
          </span>
        </div>
        {/* Detail rows */}
        <div className="divide-y divide-border">
          {p.phone && (
            <div className="flex items-center gap-3 px-5 py-3">
              <Phone size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Phone</p>
                <p className="text-sm font-medium text-foreground">{p.phone}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 px-5 py-3">
            <MapPin size={14} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Stop</p>
              <p className="text-sm font-medium text-foreground">{p.stationName ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-3">
            <CheckCircle size={14} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Live Today</p>
              <p className="text-sm font-medium text-foreground">{p.liveToday ? "Yes — riding today" : "Not confirmed"}</p>
            </div>
          </div>
          {p.quickMessage && (
            <div className="flex items-center gap-3 px-5 py-3">
              <MessageSquare size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Message</p>
                <p className="text-sm font-medium text-blue-500 italic">"{p.quickMessage}"</p>
              </div>
            </div>
          )}
        </div>
        <div className="pb-4" />
      </div>
    </div>
  );
}

function StatsDetailPanel({
  filter, passengers, onClose,
}: {
  filter: StatsFilter;
  passengers: Passenger[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Passenger | null>(null);

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
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl min-h-[50vh] max-h-[80vh] flex flex-col">
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

          <div className="overflow-y-auto flex-1 divide-y divide-border [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40">
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
                <button key={p.id}
                  onClick={() => setSelected(p)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/50 active:bg-muted transition-colors">
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
                </button>
              ))
            )}
          </div>
          <div className="pb-6 shrink-0" />
        </div>
      </div>
      {selected && <PassengerDetailCard p={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

type DriverRow = { id: number; name: string; phone: string; vehicleNumber: string; isActive: boolean; isOnline: boolean; photoUrl?: string | null };

function DriverDetailPanel({
  driver, vehicles, routes, onClose, onRefresh,
}: {
  driver: DriverRow;
  vehicles: VehicleRow[] | undefined;
  routes: RouteRow[] | undefined;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const assignedRoutes = (routes ?? []).filter((r) => r.driverId === driver.id);
  const unassignedRoutes = (routes ?? []).filter((r) => r.driverId !== driver.id);

  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(driver.name);
  const [editPhone, setEditPhone] = useState(driver.phone);

  // Local active state so button reflects change immediately without waiting for parent refetch
  const [localIsActive, setLocalIsActive] = useState(driver.isActive);
  const [activeMsg, setActiveMsg] = useState("");

  // Vehicle change
  const [changingVehicle, setChangingVehicle] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");

  // Route assign
  const [assigningRoute, setAssigningRoute] = useState(false);
  const [pickRouteId, setPickRouteId] = useState("");
  const [routeErr, setRouteErr] = useState("");

  const [err, setErr] = useState("");

  async function handleSaveInfo() {
    setSaving(true); setErr("");
    try {
      await apiPatch(`/drivers/${driver.id}`, { name: editName.trim(), phone: editPhone.trim() });
      onRefresh();
      setEditingName(false);
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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to update status");
    }
    finally { setSaving(false); }
  }

  async function handleChangeVehicle() {
    if (!selectedVehicleId) return;
    const v = (vehicles ?? []).find((x) => x.id === Number(selectedVehicleId));
    if (!v) return;
    setSaving(true); setErr("");
    try {
      await apiPatch(`/drivers/${driver.id}`, { vehicleNumber: v.plateNumber });
      onRefresh();
      setChangingVehicle(false);
      setSelectedVehicleId("");
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleAssignRoute() {
    if (!pickRouteId) return;
    setRouteErr(""); setSaving(true);
    try {
      await apiPatch(`/routes/${pickRouteId}`, { driverId: driver.id });
      queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
      onRefresh();
      setAssigningRoute(false);
      setPickRouteId("");
    } catch (e: unknown) { setRouteErr(e instanceof Error ? e.message : "Failed"); }
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
    onRefresh();
    onClose();
  }

  const currentVehicle = (vehicles ?? []).find((v) => v.plateNumber === driver.vehicleNumber);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl max-h-[90vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={driver.photoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(driver.name)}&backgroundColor=0F172A&textColor=D97706`}
              alt={driver.name}
              className="h-10 w-10 rounded-full border-2 border-amber-500 object-cover shrink-0"
            />
            <div>
              <h2 className="text-base font-bold text-foreground">{driver.name}</h2>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold ${driver.isActive ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                  {driver.isActive ? "● Active" : "● Inactive"}
                </span>
                {driver.isActive && (
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${driver.isOnline ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 animate-pulse" : "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                    {driver.isOnline ? "● LIVE" : "○ Offline"}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 text-sm">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {err && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">{err}</p>}

          {/* Driver Info */}
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Driver Info</p>
              <button onClick={() => setEditingName((v) => !v)}
                className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold hover:underline">
                <Pencil size={10} />{editingName ? "Cancel" : "Edit"}
              </button>
            </div>
            {editingName ? (
              <div className="space-y-2">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name"
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500" />
                <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+977 98XXXXXXXX"
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500" />
                <button onClick={handleSaveInfo} disabled={!editName.trim() || saving}
                  className="w-full rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-muted-foreground shrink-0" />
                  <p className="text-sm text-foreground">{driver.phone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Bus size={13} className="text-muted-foreground shrink-0" />
                  <p className="text-sm text-foreground">{driver.vehicleNumber}</p>
                </div>
              </div>
            )}
            {/* Active toggle */}
            {activeMsg && (
              <p className={`text-[11px] font-semibold rounded-lg px-3 py-1.5 ${localIsActive ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                {activeMsg}
              </p>
            )}
            <button onClick={handleToggleActive} disabled={saving}
              className={`w-full rounded-xl border py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${localIsActive
                ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/30"
                : "border-border bg-muted text-muted-foreground hover:border-amber-500 hover:text-amber-600"}`}>
              {saving ? "Saving…" : localIsActive ? "✓ Mark Inactive" : "✓ Mark Active"}
            </button>
          </div>

          {/* Assigned Bus */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Bus size={11} />Assigned Bus</p>
            {currentVehicle ? (
              <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${currentVehicle.isActive ? "bg-green-500" : "bg-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{currentVehicle.plateNumber}</p>
                  <p className="text-[10px] text-muted-foreground">{currentVehicle.model} · {currentVehicle.capacity} seats{currentVehicle.tag ? ` · ${currentVehicle.tag}` : ""}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Plate: {driver.vehicleNumber} (not in vehicle registry)</p>
            )}
            {changingVehicle ? (
              <div className="space-y-2">
                <select value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                  <option value="">Select bus…</option>
                  {(vehicles ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{v.tag ? `${v.tag} — ` : ""}{v.plateNumber} ({v.model})</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setChangingVehicle(false)}
                    className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
                  <button onClick={handleChangeVehicle} disabled={!selectedVehicleId || saving}
                    className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                    {saving ? "Saving…" : "Assign Bus"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setChangingVehicle(true)}
                className="w-full rounded-xl border border-border py-2 text-xs font-semibold text-muted-foreground hover:border-amber-500 hover:text-amber-600 transition-colors flex items-center justify-center gap-1.5">
                <RefreshCw size={11} />Change Bus
              </button>
            )}
          </div>

          {/* Assigned Routes */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Route size={11} />Assigned Routes</p>
              <button onClick={() => setAssigningRoute((v) => !v)}
                className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold hover:underline">
                <Plus size={10} />Add to Route
              </button>
            </div>
            {assignedRoutes.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Not assigned to any route yet</p>
            )}
            {assignedRoutes.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                <div className={`h-2 w-2 rounded-full shrink-0 ${r.isActive ? "bg-green-500" : "bg-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">{r.vehiclePlate ?? "No vehicle"}</p>
                </div>
                <button onClick={() => handleRemoveFromRoute(r.id)}
                  className="shrink-0 rounded-lg border border-border p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                  <X size={11} />
                </button>
              </div>
            ))}
            {assigningRoute && (
              <div className="space-y-2 pt-1 border-t border-border">
                {routeErr && <p className="text-xs text-red-500">{routeErr}</p>}
                {unassignedRoutes.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No more routes available</p>
                ) : (
                  <>
                    <select value={pickRouteId} onChange={(e) => setPickRouteId(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                      <option value="">Pick a route…</option>
                      {unassignedRoutes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => setAssigningRoute(false)}
                        className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
                      <button onClick={handleAssignRoute} disabled={!pickRouteId || saving}
                        className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                        {saving ? "Saving…" : "Assign"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Passenger Ratings */}
          {(() => {
            const ds = DRIVER_SCORES.find((d) => d.name === driver.name);
            const stars = ds ? Math.round(ds.score / 20) : null;
            return (
              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Star size={11} className="text-amber-400" />Passenger Ratings</p>
                {ds && stars !== null ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map((s) => (
                          <Star key={s} size={18} className={s <= stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} />
                        ))}
                      </div>
                      <span className="text-sm font-bold text-foreground">{stars}/5</span>
                      <span className="text-xs text-muted-foreground">({ds.score}/100 safety)</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{ds.trips} trips this month</span>
                      {ds.harsh > 0
                        ? <span className="text-red-500 font-semibold flex items-center gap-0.5"><AlertTriangle size={10} />{ds.harsh} harsh events</span>
                        : <span className="text-green-500 font-semibold">✓ Clean driving</span>
                      }
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No ratings yet from passengers</p>
                )}
              </div>
            );
          })()}

          {/* Delete */}
          <button onClick={handleDelete}
            className="w-full rounded-xl border border-red-300 dark:border-red-800 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex items-center justify-center gap-2">
            <Trash2 size={13} />Remove Driver
          </button>
        </div>
      </div>
    </div>
  );
}

type PassengerRow = { id: number; name: string; phone?: string | null; photoUrl?: string | null; role: string; stationId: number; stationName?: string | null; routeId?: number | null };
type StationOption = { id: number; name: string };

function PassengerDetailPanel({
  passenger, stations, routes, onClose, onRefresh,
}: {
  passenger: PassengerRow;
  stations: StationOption[] | undefined;
  routes: RouteRow[] | undefined;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [editName, setEditName] = useState(passenger.name);
  const [editPhone, setEditPhone] = useState(passenger.phone ?? "");
  const [editStationId, setEditStationId] = useState(String(passenger.stationId));
  const [editRouteId, setEditRouteId] = useState(String(passenger.routeId ?? ""));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true); setErr("");
    try {
      await apiPatch(`/passengers/${passenger.id}`, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        stationId: Number(editStationId),
        routeId: editRouteId ? Number(editRouteId) : null,
      });
      onRefresh();
      onClose();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${passenger.name} from the system?`)) return;
    try {
      await fetch(`${BASE}/api/passengers/${passenger.id}`, { method: "DELETE", headers: getTenantId() !== null ? { "x-tenant-id": String(getTenantId()) } : {} });
      onRefresh();
      onClose();
    } catch { /* ignore */ }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={passenger.photoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(passenger.name)}&backgroundColor=0F172A&textColor=D97706`}
              alt={passenger.name}
              className="h-10 w-10 rounded-full border-2 border-amber-500 object-cover shrink-0"
            />
            <div>
              <h2 className="text-base font-bold text-foreground">{passenger.name}</h2>
              <span className="text-[10px] font-semibold text-muted-foreground capitalize">{passenger.role}</span>
            </div>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 text-sm">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4 overflow-y-auto">
          {err && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">{err}</p>}

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Number</label>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+977 98XXXXXXXX"
                className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pickup Stop</label>
              <select
                value={editStationId}
                onChange={(e) => setEditStationId(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500 transition-colors"
              >
                {(stations ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Route</label>
              <select
                value={editRouteId}
                onChange={(e) => setEditRouteId(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500 transition-colors"
              >
                <option value="">— No route assigned —</option>
                {(routes ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer: Remove (left) + Save (right) */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-xl border border-red-300 dark:border-red-800 px-4 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
            <Trash2 size={13} />Remove
          </button>
          <button
            onClick={handleSave}
            disabled={!editName.trim() || saving}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
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
              <p className={`text-lg font-bold ${vehicle.fuel < 30 ? "text-red-500" : vehicle.fuel < 60 ? "text-[#FFF078]" : "text-green-600"}`}>{vehicle.fuel}%</p>
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
                <MapPin size={14} className="text-[#FFF078] shrink-0" />
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
type RouteStation = { id: number; routeId: number; stationId: number; position: number; direction: string; stopLabel: string | null; eta: string | null; stationName: string | null; lat: number | null; lng: number | null; radius: number | null };
type RouteRow = { id: number; name: string; driverId: number | null; vehicleId: number | null; isActive: boolean | null; driverName: string | null; vehiclePlate: string | null; departureTime?: string | null; avgSpeedKmh?: number | null };
type VehicleRow = { id: number; plateNumber: string; model: string; capacity: number; isActive: boolean; tag?: string | null };

function RouteStationsPanel({
  routeId, route, vehicles, drivers, onClose, onRouteUpdated,
}: {
  routeId: number;
  route: RouteRow;
  vehicles: VehicleRow[] | undefined;
  drivers: Array<{ id: number; name: string }> | undefined;
  onClose: () => void;
  onRouteUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: stations } = useListStations();
  const [routeStations, setRouteStations] = useState<RouteStation[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-station state
  const [addingId, setAddingId] = useState("");
  const [addingDir, setAddingDir] = useState<"forward" | "return">("forward");
  const [addingLabel, setAddingLabel] = useState("");
  const [addingErr, setAddingErr] = useState("");

  // Assignment state
  const [editVehicle, setEditVehicle] = useState(String(route.vehicleId ?? ""));
  const [editDriver, setEditDriver] = useState(String(route.driverId ?? ""));
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSaved, setAssignSaved] = useState(false);

  // ETA / speed settings
  const [depTime, setDepTime] = useState(route.departureTime ?? "06:00 AM");
  const [speedKmh, setSpeedKmh] = useState(String(route.avgSpeedKmh ?? 25));
  const [etaSaving, setEtaSaving] = useState(false);
  const [etaSaved, setEtaSaved] = useState(false);

  // Round-trip auto-mirror + absent-student alert
  const { data: allPassengers } = useListPassengers();
  const [autoReturnLoading, setAutoReturnLoading] = useState(false);
  const [autoReturnDone, setAutoReturnDone] = useState(false);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertSent, setAlertSent] = useState(false);

  useEffect(() => {
    setEditVehicle(String(route.vehicleId ?? ""));
    setEditDriver(String(route.driverId ?? ""));
    setDepTime(route.departureTime ?? "06:00 AM");
    setSpeedKmh(String(route.avgSpeedKmh ?? 25));
  }, [route.vehicleId, route.driverId, route.departureTime, route.avgSpeedKmh]);

  // Persistent lock: re-enable (amber) when the user changes inputs after a save
  useEffect(() => { setAssignSaved(false); }, [editVehicle, editDriver]);
  useEffect(() => { setEtaSaved(false); }, [depTime, speedKmh]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/routes/${routeId}/stations`);
      const data = await r.json();
      setRouteStations(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, [routeId]);

  useEffect(() => { load(); }, [load]);

  async function handleAssign() {
    setAssignSaving(true); setAssignSaved(false);
    try {
      await apiPatch(`/routes/${routeId}`, {
        vehicleId: editVehicle ? Number(editVehicle) : null,
        driverId: editDriver ? Number(editDriver) : null,
      });
      onRouteUpdated(); setAssignSaved(true);
    } catch { /* ignore */ }
    finally { setAssignSaving(false); }
  }

  async function handleSaveEta() {
    setEtaSaving(true); setEtaSaved(false);
    try {
      await apiPatch(`/routes/${routeId}`, {
        departureTime: depTime,
        avgSpeedKmh: Number(speedKmh) || 25,
      });
      onRouteUpdated();
      await load();
      setEtaSaved(true);
    } catch { /* ignore */ }
    finally { setEtaSaving(false); }
  }

  async function handleAdd() {
    if (!addingId) return;
    setAddingErr("");
    const station = (stations ?? []).find((s) => s.id === Number(addingId));
    const autoLabel = addingLabel.trim() || (station ? `${station.name} (${addingDir === "forward" ? "Forward" : "Return"})` : "");
    try {
      await apiPost(`/routes/${routeId}/stations`, {
        stationId: Number(addingId),
        direction: addingDir,
        stopLabel: autoLabel,
      });
      setAddingId(""); setAddingLabel("");
      load();
    } catch { setAddingErr("Failed to add station"); }
  }

  // Remove by route_station row ID (supports duplicate stops)
  async function handleRemove(rowId: number) {
    await apiDelete(`/routes/${routeId}/stations/${rowId}`);
    load();
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
  }

  // Auto-mirror all forward stops as return stops (reversed order)
  async function handleAutoReturn() {
    const fwd = routeStations.filter((rs) => rs.direction === "forward");
    if (fwd.length === 0) return;
    setAutoReturnLoading(true); setAutoReturnDone(false);
    try {
      for (const rs of [...fwd].reverse()) {
        await apiPost(`/routes/${routeId}/stations`, {
          stationId: rs.stationId,
          direction: "return",
          stopLabel: rs.stopLabel ? `${rs.stopLabel} (Return)` : undefined,
        });
      }
      await load();
      setAutoReturnDone(true);
    } finally { setAutoReturnLoading(false); }
  }

  // Send an announcement alerting about students not yet boarded on this route
  async function handleAlertAbsent() {
    const absent = ((allPassengers ?? []) as Array<{ id: number; name: string; routeId?: number | null; boardedAt?: string | null }>)
      .filter((p) => p.routeId === routeId && !p.boardedAt);
    const names = absent.length > 0 ? absent.map((p) => p.name).join(", ") : null;
    const msg = names
      ? `⚠ Return trip alert — ${route.name}: ${absent.length} student(s) not yet boarded: ${names}. Bus is returning — parents please verify.`
      : `ℹ Return trip — ${route.name}: All assigned students are confirmed boarded. Bus is returning safely.`;
    setAlertLoading(true); setAlertSent(false);
    try {
      await apiPost("/announcements", { message: msg, severity: names ? "emergency" : "info" });
      queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
      setAlertSent(true);
    } finally { setAlertLoading(false); }
  }

  const vehicleLabel = (v: VehicleRow) => v.tag ? `${v.tag} — ${v.plateNumber}` : v.plateNumber;

  const dirBadge = (dir: string) => dir === "return"
    ? <span className="rounded-full bg-blue-100 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-700 px-1.5 py-0.5 text-[8px] font-bold text-blue-700 dark:text-blue-400 shrink-0">↩ Return</span>
    : <span className="rounded-full bg-green-100 dark:bg-green-950/30 border border-green-300 dark:border-green-700 px-1.5 py-0.5 text-[8px] font-bold text-green-700 dark:text-green-400 shrink-0">→ Forward</span>;

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Stops on this route ({routeStations.length})</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
      </div>

      {/* ETA Engine Settings */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
          <Clock size={9} />ETA Engine Settings
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Base Departure Time</label>
            <input
              value={depTime}
              onChange={(e) => setDepTime(e.target.value)}
              placeholder="06:00 AM"
              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Avg Fleet Speed (km/h)</label>
            <input
              type="number" min={5} max={120} value={speedKmh}
              onChange={(e) => setSpeedKmh(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500"
            />
          </div>
        </div>
        <button
          onClick={handleSaveEta}
          disabled={etaSaving}
          className={`w-full rounded-lg py-1.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${etaSaved ? "bg-green-500 text-white" : "bg-amber-500 text-slate-900 hover:bg-amber-400"}`}
        >
          {etaSaving ? "Saving…" : etaSaved ? "✓ ETAs recalculated!" : "Save & Recalculate ETAs"}
        </button>
      </div>

      {/* Bus & Driver assignment */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Bus size={10} />Assign Bus &amp; Driver</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Bus</label>
            <select value={editVehicle} onChange={(e) => setEditVehicle(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500">
              <option value="">None</option>
              {(vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Driver</label>
            <select value={editDriver} onChange={(e) => setEditDriver(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500">
              <option value="">None</option>
              {(drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleAssign} disabled={assignSaving}
          className={`w-full rounded-lg py-1.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${assignSaved ? "bg-green-500 text-white" : "bg-amber-500 text-slate-900 hover:bg-amber-400"}`}>
          {assignSaving ? "Saving…" : assignSaved ? "✓ Saved!" : "Save Assignment"}
        </button>
      </div>

      {/* Stop timeline with ETAs */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1">
          {routeStations.length === 0 && <p className="text-xs text-muted-foreground italic">No stops yet — add below</p>}
          {routeStations.map((rs, idx) => (
            <div key={rs.id} className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2">
              <span className="text-[10px] font-bold text-[#FFF078] w-4 shrink-0">{idx + 1}</span>
              <Navigation size={11} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-semibold text-foreground leading-none">
                    {rs.stopLabel || rs.stationName || `Stop #${rs.stationId}`}
                  </p>
                  {dirBadge(rs.direction)}
                </div>
                {rs.eta && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                    ⏱ ETA {rs.eta}
                  </p>
                )}
              </div>
              {rs.radius && <span className="text-[9px] text-muted-foreground shrink-0">{rs.radius}m</span>}
              <button onClick={() => handleRemove(rs.id)} className="text-red-400 hover:text-red-600 shrink-0">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Return Route & Alert panel */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
        <p className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
          <RefreshCw size={9} />Return Trip Actions
        </p>

        {/* Auto-generate return stops */}
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">
            Mirror all <span className="font-semibold text-green-600 dark:text-green-400">Forward</span> stops in reverse order as <span className="font-semibold text-blue-600 dark:text-blue-400">Return</span> stops — one click round-trip setup.
          </p>
          <button
            onClick={handleAutoReturn}
            disabled={autoReturnLoading || routeStations.filter((rs) => rs.direction === "forward").length === 0}
            className={`w-full rounded-lg py-1.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
              autoReturnDone ? "bg-green-500 text-white" : "bg-amber-500 text-slate-900 hover:bg-amber-400"
            }`}
          >
            {autoReturnLoading
              ? "Generating return stops…"
              : autoReturnDone
              ? `✓ Return stops added!`
              : `⟺ Auto-generate Return Route (${routeStations.filter((rs) => rs.direction === "forward").length} stops)`}
          </button>
        </div>

        {/* Alert absent students */}
        <div className="space-y-1 pt-1 border-t border-blue-200 dark:border-blue-800">
          <p className="text-[10px] text-muted-foreground">
            Send an emergency notice to all parents on this route listing students who have <span className="font-semibold text-red-500">not boarded</span> yet.
          </p>
          {(() => {
            const absentCount = ((allPassengers ?? []) as Array<{ routeId?: number | null; boardedAt?: string | null }>)
              .filter((p) => p.routeId === routeId && !p.boardedAt).length;
            return (
              <button
                onClick={handleAlertAbsent}
                disabled={alertLoading}
                className={`w-full rounded-lg py-1.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                  alertSent ? "bg-green-500 text-white" : "bg-red-500 text-white hover:bg-red-400"
                }`}
              >
                {alertLoading
                  ? "Sending alert…"
                  : alertSent
                  ? "✓ Alert sent to parent board!"
                  : absentCount > 0
                  ? `🔔 Alert ${absentCount} absent student${absentCount !== 1 ? "s" : ""} not boarded`
                  : "🔔 Send Return Trip Notice (all boarded)"}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Add stop (allows same station twice — forward + return) */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Plus size={9} />Add Stop (duplicate stops supported for round-trips)
        </p>
        <div className="flex gap-2">
          <select value={addingId} onChange={(e) => setAddingId(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500">
            <option value="">Select station…</option>
            {(stations ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={addingDir} onChange={(e) => setAddingDir(e.target.value as "forward" | "return")}
            className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500">
            <option value="forward">→ Forward</option>
            <option value="return">↩ Return</option>
          </select>
        </div>
        <input
          value={addingLabel}
          onChange={(e) => setAddingLabel(e.target.value)}
          placeholder="Custom label (optional — auto-generated if blank)"
          className="w-full rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500"
        />
        {addingErr && <p className="text-[10px] text-red-500">{addingErr}</p>}
        <button onClick={handleAdd} disabled={!addingId}
          className="w-full rounded-lg bg-amber-500 py-1.5 text-[10px] font-bold text-slate-900 disabled:opacity-50 hover:bg-amber-400">
          Add Stop to Route
        </button>
      </div>
    </div>
  );
}

function VehicleTagGrid({ vehicles, routes, onTagUpdated }: { vehicles: VehicleRow[] | undefined; routes: RouteRow[] | undefined; onTagUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tagValue, setTagValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Add Vehicle form state
  const [adding, setAdding] = useState(false);
  const [aPlate, setAPlate] = useState("");
  const [aModel, setAModel] = useState("");
  const [aCapacity, setACapacity] = useState("40");
  const [aTag, setATag] = useState("");
  const [aErr, setAErr] = useState("");
  const [aSaving, setASaving] = useState(false);

  async function handleSaveTag(id: number) {
    setSaving(true);
    try {
      await apiPatch(`/vehicles/${id}`, { tag: tagValue.trim() || null });
      setEditingId(null);
      onTagUpdated();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleAddVehicle() {
    if (!aPlate.trim() || !aModel.trim()) return;
    setAErr(""); setASaving(true);
    try {
      await apiPost("/vehicles", { plateNumber: aPlate.trim(), model: aModel.trim(), capacity: Number(aCapacity) || 40, tag: aTag.trim() || null });
      setAPlate(""); setAModel(""); setACapacity("40"); setATag(""); setAdding(false);
      onTagUpdated();
    } catch (e: unknown) { setAErr(e instanceof Error ? e.message : "Failed to add vehicle"); }
    finally { setASaving(false); }
  }

  async function handleDeleteVehicle(id: number) {
    try {
      await apiDelete(`/vehicles/${id}`);
      onTagUpdated();
    } catch { /* ignore */ }
  }

  function vehicleRoute(vehicleId: number) {
    return (routes ?? []).find((r) => r.vehicleId === vehicleId) ?? null;
  }

  const assignedCount = (vehicles ?? []).filter((v) => vehicleRoute(v.id)).length;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-border hover:bg-muted/30 transition-colors text-left"
      >
        <div>
          <h2 className="font-semibold text-primary flex items-center gap-2"><Bus size={15} />Fleet Asset Grid</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{(vehicles ?? []).length} vehicle{(vehicles ?? []).length !== 1 ? "s" : ""} · {assignedCount} on route · {(vehicles ?? []).length - assignedCount} available</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            onClick={(e) => { e.stopPropagation(); setAdding((v) => !v); if (!open) setOpen(true); }}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
          >
            <Plus size={12} />Add Vehicle
          </span>
          {open ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
        </div>
      </button>

      {open && <div>
      {/* Add Vehicle inline form */}
      {adding && (
        <div className="px-5 py-4 border-b border-border bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Plate Number <span className="text-red-400">*</span></label>
              <input value={aPlate} onChange={(e) => setAPlate(e.target.value)} placeholder="BA 1 KHA 1234"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Model <span className="text-red-400">*</span></label>
              <input value={aModel} onChange={(e) => setAModel(e.target.value)} placeholder="Tata Starbus"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Seats</label>
              <input type="number" min="1" max="80" value={aCapacity} onChange={(e) => setACapacity(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Label (optional)</label>
              <input value={aTag} onChange={(e) => setATag(e.target.value)} placeholder="Bus A"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
          </div>
          {aErr && <p className="text-xs text-red-500">{aErr}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setAdding(false); setAPlate(""); setAModel(""); setACapacity("40"); setATag(""); setAErr(""); }}
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={handleAddVehicle} disabled={!aPlate.trim() || !aModel.trim() || aSaving}
              className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
              {aSaving ? "Adding…" : "Add Vehicle"}
            </button>
          </div>
        </div>
      )}

      {(!vehicles || vehicles.length === 0) && !adding && (
        <p className="px-5 py-8 text-center text-xs text-muted-foreground">No vehicles yet — click Add Vehicle to register your first bus</p>
      )}

      {/* Card Grid */}
      {(vehicles ?? []).length > 0 && (
        <div className="p-4 grid grid-cols-2 gap-3">
          {(vehicles ?? []).map((v) => {
            const assignedRoute = vehicleRoute(v.id);
            return (
              <div key={v.id} className={`rounded-2xl border p-3.5 flex flex-col gap-2 transition-all ${assignedRoute ? "border-green-300 dark:border-green-800 bg-green-50/60 dark:bg-green-950/20" : "border-border bg-muted/20"}`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground leading-tight truncate">
                      {v.tag ?? v.plateNumber}
                    </p>
                    {v.tag && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{v.plateNumber}</p>}
                  </div>
                  <div className={`h-2 w-2 rounded-full shrink-0 mt-1 ${v.isActive ? "bg-green-500" : "bg-slate-400"}`} />
                </div>
                {/* Model / capacity */}
                <p className="text-[10px] text-muted-foreground">{v.model} · {v.capacity} seats</p>
                {/* Route badge */}
                {assignedRoute ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-600/10 border border-green-500/30 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:text-green-400 w-fit max-w-full truncate">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0 animate-pulse" />
                    <span className="truncate">{assignedRoute.name}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground w-fit">
                    Unassigned
                  </span>
                )}
                {/* Actions */}
                {editingId === v.id ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      value={tagValue}
                      onChange={(e) => setTagValue(e.target.value)}
                      placeholder="Bus A"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSaveTag(v.id)}
                      className="flex-1 rounded-lg border border-amber-500 bg-card px-2 py-1 text-xs text-foreground outline-none min-w-0"
                    />
                    <button onClick={() => handleSaveTag(v.id)} disabled={saving}
                      className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold text-slate-900 disabled:opacity-50 hover:bg-amber-400 shrink-0">✓</button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X size={11} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <button onClick={() => { setEditingId(v.id); setTagValue(v.tag ?? ""); }}
                      className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:border-amber-500 transition-colors">
                      <Pencil size={9} />{v.tag ? "Edit" : "Label"}
                    </button>
                    <button onClick={() => handleDeleteVehicle(v.id)}
                      className="ml-auto rounded-lg p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>}
    </div>
  );
}

function RouteManager({ drivers, vehicles }: { drivers: Array<{ id: number; name: string }> | undefined; vehicles: VehicleRow[] | undefined }) {
  const queryClient = useQueryClient();
  const { data: routes, refetch } = useListRoutes();
  const { data: allStations } = useListStations();
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const editingRoute = editingRouteId != null
    ? ((routes as RouteRow[] | undefined) ?? []).find((r) => r.id === editingRouteId) ?? null
    : null;
  const [creating, setCreating] = useState(false);
  const [rName, setRName] = useState("");
  const [rDriver, setRDriver] = useState("");
  const [rVehicle, setRVehicle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Staged stations for new route (includes lat/lng so map can render them)
  const [stagedStations, setStagedStations] = useState<{ stationId: number; name: string; lat: number; lng: number }[]>([]);

  // Map-click state for inline station builder
  const [mapClickPending, setMapClickPending] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [pendingName, setPendingName]         = useState("");
  const [pendingRadius, setPendingRadius]     = useState(100);
  const [pendingSaving, setPendingSaving]     = useState(false);

  // Staged stops converted to OsmMap shape for live preview
  const stagedStops: RouteStop[] = stagedStations.map((s, i) => ({
    id: s.stationId, name: s.name, stopOrder: i + 1, lat: s.lat, lng: s.lng,
  }));

  function handleMapClick(lat: number, lng: number, name?: string) {
    const resolved = name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    // Always update position + name; don't reset radius (persists across drags)
    setMapClickPending({ lat, lng, name: resolved });
    setPendingName(resolved);
  }

  async function handleAddPendingStation() {
    if (!mapClickPending) return;
    const name = pendingName.trim() || mapClickPending.name;
    setPendingSaving(true);
    try {
      const created = await apiPost("/stations", { name, lat: mapClickPending.lat, lng: mapClickPending.lng, radius: pendingRadius });
      queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
      setStagedStations((prev) => [...prev, { stationId: created.id, name, lat: mapClickPending.lat, lng: mapClickPending.lng }]);
      setMapClickPending(null);
      setPendingName("");
      setPendingRadius(100); // Reset radius only after station is saved
    } catch { /* noop */ }
    finally { setPendingSaving(false); }
  }

  async function handleCreate() {
    if (!rName.trim()) return;
    setErr(""); setSaving(true);
    try {
      const route = await apiPost("/routes", { name: rName.trim(), driverId: rDriver ? Number(rDriver) : undefined, vehicleId: rVehicle ? Number(rVehicle) : undefined });
      for (const s of stagedStations) {
        await apiPost(`/routes/${route.id}/stations`, { stationId: s.stationId });
      }
      setRName(""); setRDriver(""); setRVehicle(""); setStagedStations([]); setMapClickPending(null); setCreating(false);
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

  function vehicleLabel(v: VehicleRow) {
    return v.tag ? `${v.tag} — ${v.plateNumber}` : v.plateNumber;
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
        <div className="border-b border-border">
          {/* ── Step 1: Route name ── */}
          <div className="px-4 py-3 border-b border-border/50 space-y-2 bg-muted/10">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Route size={10} />Route Name
            </p>
            <input
              value={rName}
              onChange={(e) => setRName(e.target.value)}
              placeholder="e.g. Route A — Koteshwor to Thamel"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500"
            />
            <div className="flex gap-1.5 flex-wrap">
              {["Route A", "Route B", "Route C", "Route D"].map((n) => (
                <button
                  key={n}
                  onClick={() => setRName(n)}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-bold border transition-colors ${
                    rName === n
                      ? "bg-amber-500 text-slate-900 border-amber-500"
                      : "border-border text-muted-foreground hover:border-amber-400 hover:text-foreground bg-card"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* ── Step 2: Map station builder ── */}
          <div className="border-b border-border/50">
            <div className="px-4 py-2 flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <MapPin size={10} />Click map to pin stations one by one
              </p>
              {stagedStations.length > 0 && (
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  {stagedStations.length} stop{stagedStations.length !== 1 ? "s" : ""} added
                </span>
              )}
            </div>
            <OsmMap
              mode="build"
              height={300}
              stops={stagedStops}
              onMapClick={handleMapClick}
            />

            {/* Confirm tray — appears after map click */}
            {mapClickPending && (
              <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border-t border-amber-200 dark:border-amber-800 space-y-2">
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <MapPin size={10} />Stop {stagedStations.length + 1} — {mapClickPending.lat.toFixed(4)}, {mapClickPending.lng.toFixed(4)}
                </p>
                <input
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && pendingName.trim() && !pendingSaving) handleAddPendingStation(); }}
                  onFocus={(e) => e.target.select()}
                  placeholder="Station name…"
                  autoFocus
                  className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm outline-none focus:border-amber-500"
                />
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
                    Radius: {pendingRadius}m
                  </label>
                  <input
                    type="range" min={50} max={500} step={10}
                    value={pendingRadius}
                    onChange={(e) => setPendingRadius(Number(e.target.value))}
                    className="flex-1 accent-amber-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddPendingStation}
                    disabled={pendingSaving || !pendingName.trim()}
                    className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
                  >
                    {pendingSaving ? "Saving…" : `✓ Add as Stop ${stagedStations.length + 1}`}
                  </button>
                  <button
                    onClick={() => setMapClickPending(null)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <X size={11} className="inline" /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Staged stop list ── */}
          {stagedStations.length > 0 && (
            <div className="border-b border-border/50">
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                Route Timeline
              </p>
              <div className="px-4 pb-3 space-y-1 max-h-40 overflow-y-auto">
                {stagedStations.map((s, idx) => (
                  <div key={s.stationId} className="flex items-center gap-2 rounded-lg bg-card border border-border px-2.5 py-1.5">
                    <span className="h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                      {idx + 1}
                    </span>
                    <p className="flex-1 text-xs text-foreground truncate">{s.name}</p>
                    <button
                      onClick={() => setStagedStations((prev) => prev.filter((x) => x.stationId !== s.stationId))}
                      className="text-red-400 hover:text-red-600 shrink-0"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Optional: bus + driver ── */}
          <div className="px-4 py-3 border-b border-border/50 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Bus (optional)</label>
              <select value={rVehicle} onChange={(e) => setRVehicle(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500">
                <option value="">None</option>
                {(vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Driver (optional)</label>
              <select value={rDriver} onChange={(e) => setRDriver(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500">
                <option value="">None</option>
                {(drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Actions ── */}
          {err && <p className="px-4 pt-2 text-xs text-red-500">{err}</p>}
          <div className="px-4 py-3 flex gap-2">
            <button
              onClick={() => {
                setCreating(false); setRName(""); setErr("");
                setStagedStations([]); setMapClickPending(null);
                setRDriver(""); setRVehicle("");
              }}
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!rName.trim() || saving}
              className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? "Creating…" : `Create Route${stagedStations.length > 0 ? ` + ${stagedStations.length} stop${stagedStations.length !== 1 ? "s" : ""}` : ""}`}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
        {(routes ?? []).length === 0 && !creating && (
          <p className="px-5 py-8 text-center text-xs text-muted-foreground">No routes yet — create one above</p>
        )}
        {(routes as RouteRow[] ?? []).map((r) => (
          <div key={r.id} className="px-4 py-3">
            <div
              className="rounded-xl border border-border bg-card hover:border-amber-400 transition-all cursor-pointer p-3.5 group"
              onClick={() => setEditingRouteId(r.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${r.isActive ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                  <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                  <Lock size={9} className="text-muted-foreground/40 shrink-0" />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingRouteId(r.id); }}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-amber-500 hover:text-amber-600 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                >
                  <Pencil size={9} />Manage
                </button>
              </div>
              <div className="mt-2 flex items-center gap-4 pointer-events-none">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Bus size={10} className="shrink-0" />
                  <span className="font-medium">{r.vehiclePlate ?? "—"}</span>
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <User size={10} className="shrink-0" />
                  {r.driverName ?? "No driver"}
                </span>
                {r.departureTime && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock size={10} className="shrink-0" />{r.departureTime}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingRoute && (
        <RouteEditModal
          route={editingRoute}
          vehicles={vehicles}
          drivers={drivers}
          onClose={() => setEditingRouteId(null)}
          onRouteUpdated={() => {
            refetch();
            queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
          }}
          onDelete={() => {
            handleDelete(editingRoute.id);
            setEditingRouteId(null);
          }}
          onToggleActive={() => handleToggleActive(editingRoute)}
        />
      )}
    </div>
  );
}


// ── RouteEditModal ────────────────────────────────────────────────────────────
function RouteEditModal({
  route, vehicles, drivers, onClose, onRouteUpdated, onDelete, onToggleActive,
}: {
  route: RouteRow;
  vehicles: VehicleRow[] | undefined;
  drivers: Array<{ id: number; name: string }> | undefined;
  onClose: () => void;
  onRouteUpdated: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-start justify-center p-4 pt-[4.5rem] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[82vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border rounded-t-2xl bg-card shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${route.isActive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground truncate">{route.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {route.vehiclePlate ?? "No bus"} · {route.driverName ?? "No driver"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              onClick={onToggleActive}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border transition-colors ${
                route.isActive
                  ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                  : "bg-muted text-muted-foreground border-border hover:border-amber-500"
              }`}
            >
              {route.isActive ? "● Active" : "● Inactive"}
            </button>
            <button
              onClick={() => { if (confirm(`Delete "${route.name}"? This cannot be undone.`)) onDelete(); }}
              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Trash2 size={13} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-2">
          <RouteStationsPanel
            routeId={route.id}
            route={route}
            vehicles={vehicles}
            drivers={drivers}
            onClose={onClose}
            onRouteUpdated={onRouteUpdated}
          />
        </div>
      </div>
    </div>
  );
}

// ── SmartStationManager ───────────────────────────────────────────────────────
type StationRow = { id: number; name: string; lat?: number | null; lng?: number | null; radius?: number | null };

function SmartStationManager({
  stations, onChanged,
}: { stations: StationRow[] | undefined; onChanged: () => void }) {
  const [pendingStop, setPendingStop] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [pendingRadius, setPendingRadius] = useState(100);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const buildStops: RouteStop[] = (stations ?? [])
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ id: s.id, name: s.name, lat: s.lat as number, lng: s.lng as number }));

  function handleMapClick(lat: number, lng: number, name?: string) {
    const resolved = name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    setPendingStop({ lat, lng, name: resolved });
    setPendingName(resolved);
    setPendingRadius(100);
  }

  async function handleSave() {
    if (!pendingStop) return;
    setSaving(true);
    try {
      await apiPost("/stations", {
        name: pendingName.trim() || pendingStop.name,
        lat: pendingStop.lat,
        lng: pendingStop.lng,
        radius: pendingRadius,
      });
      onChanged();
      setPendingStop(null);
      setPendingName("");
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try { await apiDelete(`/stations/${id}`); onChanged(); }
    finally { setDeleting(null); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <MapPin size={14} />Geofence Stations
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stations?.length ?? 0} hub{(stations?.length ?? 0) !== 1 ? "s" : ""} · OpenStreetMap · click map to pin
          </p>
        </div>
      </div>

      {/* Interactive build map */}
      <div className="border-b border-border">
        <OsmMap
          mode="build"
          height={300}
          stops={buildStops}
          onMapClick={handleMapClick}
        />
      </div>

      {/* Confirm tray — slides in after a map click */}
      {pendingStop && (
        <div className="px-4 py-3 border-b border-border bg-amber-50 dark:bg-amber-950/20 space-y-2">
          <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
            <MapPin size={10} />New Stop — {pendingStop.lat.toFixed(4)}, {pendingStop.lng.toFixed(4)}
          </p>
          <input
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="Station name…"
            className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-foreground outline-none focus:border-amber-500 transition-colors"
          />
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">Radius: {pendingRadius}m</label>
            <input
              type="range" min={50} max={500} step={10}
              value={pendingRadius}
              onChange={(e) => setPendingRadius(Number(e.target.value))}
              className="flex-1 accent-amber-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !pendingName.trim()}
              className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {saving ? <RefreshCw size={11} className="animate-spin inline mr-1" /> : <Plus size={11} className="inline mr-1" />}
              {saving ? "Saving…" : "Add Station"}
            </button>
            <button
              onClick={() => setPendingStop(null)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              <X size={11} className="inline mr-1" />Cancel
            </button>
          </div>
        </div>
      )}

      {/* Station list */}
      <div className="divide-y divide-border max-h-56 overflow-y-auto">
        {(!stations || stations.length === 0) && (
          <p className="px-5 py-6 text-center text-xs text-muted-foreground italic">
            No stations yet — click anywhere on the map above to add your first hub
          </p>
        )}
        {(stations ?? []).map((s, idx) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="h-6 w-6 rounded-full bg-amber-500 border-2 border-white shadow-sm flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-white leading-none">{idx + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {s.lat != null && s.lng != null ? (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {(s.lat as number).toFixed(4)}, {(s.lng as number).toFixed(4)}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground italic">No coordinates</span>
                )}
                {s.radius != null && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                    ⊙ {s.radius}m
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDelete(s.id)}
              disabled={deleting === s.id}
              className="shrink-0 rounded-lg p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-40 transition-colors"
            >
              {deleting === s.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BoardingLogEntry {
  id: number;
  passengerId: number;
  passengerName: string;
  stationId: number | null;
  stationName: string | null;
  driverId: number | null;
  driverName: string | null;
  action: "boarded" | "absent";
  actionAt: string;
}

function BoardingLogPanel() {
  const { data: logs, isFetching } = useQuery<BoardingLogEntry[]>({
    queryKey: ["boarding-logs"],
    queryFn: async () => {
      const tenantId = getTenantId();
      const headers: Record<string, string> = {};
      if (tenantId !== null) headers["x-tenant-id"] = String(tenantId);
      const r = await fetch(`${BASE}/api/passengers/boarding-logs`, { headers });
      if (!r.ok) throw new Error("Failed to load boarding logs");
      return r.json() as Promise<BoardingLogEntry[]>;
    },
    refetchInterval: 10000,
  });

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <ClipboardList size={15} />Live Boarding Log
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time board / absent events from drivers · auto-refreshes</p>
        </div>
        {isFetching && (
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="Refreshing…" />
        )}
      </div>

      {(!logs || logs.length === 0) ? (
        <p className="px-5 py-6 text-center text-xs text-muted-foreground">
          No boarding events yet — they appear here as drivers board or mark students absent
        </p>
      ) : (
        <div className="divide-y divide-border max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center gap-3 px-5 py-3">
              <span className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                log.action === "boarded"
                  ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400"
              }`}>
                {log.action === "boarded" ? "✓" : "✗"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{log.passengerName}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {log.stationName ?? "Unknown station"}
                  {log.driverName ? ` · ${log.driverName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  log.action === "boarded"
                    ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                }`}>
                  {log.action === "boarded" ? "Boarded" : "Absent"}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(log.actionAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type CommEntry = {
  id: string;
  type: "boarding" | "driver_notification" | "student_message";
  passengerName: string;
  stationName: string | null;
  content: string;
  timestamp: string | null;
  driverName: string | null;
};

function DriverCommunicationsPanel() {
  const { data: entries, isFetching } = useQuery<CommEntry[]>({
    queryKey: ["communications"],
    queryFn: async () => {
      const tenantId = getTenantId();
      const headers: Record<string, string> = {};
      if (tenantId !== null) headers["x-tenant-id"] = String(tenantId);
      const r = await fetch(`${BASE}/api/passengers/communications`, { headers });
      if (!r.ok) throw new Error("Failed to load communications");
      return r.json() as Promise<CommEntry[]>;
    },
    refetchInterval: 12000,
  });

  function formatTime(iso: string | null) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  }

  const typeLabel: Record<CommEntry["type"], string> = {
    boarding: "Boarding",
    driver_notification: "Driver Ping",
    student_message: "Student Msg",
  };

  const typeBadge: Record<CommEntry["type"], string> = {
    boarding: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400",
    driver_notification: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400",
    student_message: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400",
  };

  const typeIcon: Record<CommEntry["type"], string> = {
    boarding: "✓",
    driver_notification: "🔔",
    student_message: "💬",
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <MessageSquare size={15} />Communications Log
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Boarding events, driver pings & student messages · auto-refreshes</p>
        </div>
        {isFetching && <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="Refreshing…" />}
      </div>
      {(!entries || entries.length === 0) ? (
        <p className="px-5 py-6 text-center text-xs text-muted-foreground">
          No communications yet — driver pings and boarding events will appear here
        </p>
      ) : (
        <div className="divide-y divide-border max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
              <span className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${typeBadge[entry.type]}`}>
                {typeIcon[entry.type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{entry.passengerName}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {entry.content}
                  {entry.stationName ? ` · ${entry.stationName}` : ""}
                  {entry.driverName ? ` · ${entry.driverName}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeBadge[entry.type]}`}>
                  {typeLabel[entry.type]}
                </span>
                {entry.timestamp && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(entry.timestamp)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Types for fleet ops ────────────────────────────────────────────────────────
type FuelLogRow = { id: number; vehicleId: number | null; vehiclePlate: string | null; date: string; liters: number; amountNpr: number; odometerKm: number; receiptUrl: string | null; notes: string | null; createdAt: string };
type MaintenanceRow = { id: number; vehicleId: number | null; vehiclePlate: string | null; partType: string; description: string | null; costNpr: number; odometerKm: number; serviceDate: string; vendor: string | null; createdAt: string };
type VehicleDocRow = { id: number; vehicleId: number; vehiclePlate: string | null; vehicleModel: string | null; bluebookExpiry: string | null; insuranceExpiry: string | null; pollutionExpiry: string | null; daysUntilBluebook: number | null; daysUntilInsurance: number | null; daysUntilPollution: number | null; isCritical: boolean };
type VehicleItem = { id: number; plateNumber: string; model: string };

// ── FleetFuelPanel ─────────────────────────────────────────────────────────────
function FleetFuelPanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [logs, setLogs] = useState<FuelLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [fVehicleId, setFVehicleId] = useState("");
  const [fDate, setFDate] = useState(today);
  const [fLiters, setFLiters] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fOdometer, setFOdometer] = useState("");
  const [fNotes, setFNotes] = useState("");

  async function fetchLogs() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/fuel-logs`, { headers: tenantHeaders() });
      setLogs(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void fetchLogs(); }, []);

  async function handleSave() {
    if (!fDate || !fLiters || !fAmount || !fOdometer) { setErr("Date, liters, amount and odometer are required"); return; }
    setSaving(true); setErr("");
    try {
      const body: Record<string, unknown> = { date: fDate, liters: Number(fLiters), amountNpr: Number(fAmount), odometerKm: Number(fOdometer) };
      if (fVehicleId) body.vehicleId = Number(fVehicleId);
      if (fNotes.trim()) body.notes = fNotes.trim();
      const r = await fetch(`${BASE}/api/fuel-logs`, { method: "POST", headers: tenantHeaders(), body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed"); }
      setFDate(today); setFLiters(""); setFAmount(""); setFOdometer(""); setFNotes(""); setFVehicleId("");
      setShowForm(false);
      await fetchLogs();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    await fetch(`${BASE}/api/fuel-logs/${id}`, { method: "DELETE", headers: tenantHeaders() });
    await fetchLogs();
  }

  // Analytics
  const analytics = useMemo(() => {
    if (logs.length === 0) return null;
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const byMonth: Record<string, number> = {};
    for (const l of sorted) {
      const m = l.date.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + l.liters;
    }
    const months = Object.values(byMonth);
    const avgMonthly = months.reduce((s, v) => s + v, 0) / months.length;
    let totalKm = 0; let totalL = 0;
    for (let i = 1; i < sorted.length; i++) {
      const kmDelta = sorted[i].odometerKm - sorted[i - 1].odometerKm;
      if (kmDelta > 0) { totalKm += kmDelta; totalL += sorted[i].liters; }
    }
    const kmPerL = totalL > 0 ? totalKm / totalL : null;
    return { avgMonthly: avgMonthly.toFixed(1), kmPerL: kmPerL ? kmPerL.toFixed(2) : "—" };
  }, [logs]);

  return (
    <div className="space-y-5">
      {/* Analytics */}
      {analytics && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1"><BarChart3 size={14} className="text-amber-500" /><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Avg Monthly</span></div>
            <p className="text-2xl font-bold text-primary">{analytics.avgMonthly}<span className="text-sm font-normal text-muted-foreground ml-1">L</span></p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Fuel consumed per month</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1"><Gauge size={14} className="text-green-500" /><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Mileage</span></div>
            <p className="text-2xl font-bold text-green-600">{analytics.kmPerL}<span className="text-sm font-normal text-muted-foreground ml-1">KM/L</span></p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Real-time efficiency</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div><h2 className="font-semibold text-primary flex items-center gap-2"><Droplets size={15} className="text-amber-500" />Fuel Logs</h2><p className="text-xs text-muted-foreground mt-0.5">{logs.length} entries logged</p></div>
          <button onClick={() => { setShowForm(!showForm); setErr(""); }}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400">
            <Plus size={13} />{showForm ? "Cancel" : "Log Fuel"}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="px-5 py-4 border-b border-border bg-muted/20 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Date</label>
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Vehicle</label>
                <select value={fVehicleId} onChange={(e) => setFVehicleId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                  <option value="">— Any —</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Liters</label>
                <input type="number" value={fLiters} onChange={(e) => setFLiters(e.target.value)} placeholder="e.g. 45"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Amount (NPR)</label>
                <input type="number" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="e.g. 6750"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Odometer (KM)</label>
                <input type="number" value={fOdometer} onChange={(e) => setFOdometer(e.target.value)} placeholder="e.g. 12450"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Notes <span className="text-muted-foreground/60">(optional)</span></label>
              <input value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="e.g. Receipt #42, Petrol pump — Koteshwor"
                className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <button onClick={handleSave} disabled={saving}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
              {saving ? "Saving…" : "Save Fuel Entry"}
            </button>
          </div>
        )}

        {/* Log table */}
        <div className="divide-y divide-border max-h-80 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
          {loading && <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>}
          {!loading && logs.length === 0 && (
            <div className="py-10 text-center">
              <Droplets size={24} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No fuel logs yet — click Log Fuel to add the first entry</p>
            </div>
          )}
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group">
              <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                <Droplets size={15} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{l.vehiclePlate ?? "Any vehicle"} · <span className="text-muted-foreground font-normal">{l.date}</span></p>
                <p className="text-xs text-muted-foreground">{l.liters}L · NPR {l.amountNpr.toLocaleString()} · {l.odometerKm.toLocaleString()} km</p>
                {l.notes && <p className="text-[10px] text-muted-foreground/70 italic truncate">{l.notes}</p>}
              </div>
              <button onClick={() => handleDelete(l.id)}
                className="opacity-0 group-hover:opacity-100 rounded-lg p-1 text-muted-foreground hover:text-red-500 transition-all">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── FleetMaintenancePanel ──────────────────────────────────────────────────────
const PART_TYPES = ["Tires", "Battery", "Mobil Oil", "Brakes", "Air Filter", "Clutch", "Spark Plug", "Wiper Blade", "Coolant", "Other"];

function FleetMaintenancePanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [records, setRecords] = useState<MaintenanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [mVehicleId, setMVehicleId] = useState("");
  const [mPartType, setMPartType] = useState(PART_TYPES[0]);
  const [mDescription, setMDescription] = useState("");
  const [mCost, setMCost] = useState("");
  const [mOdometer, setMOdometer] = useState("");
  const [mDate, setMDate] = useState(today);
  const [mVendor, setMVendor] = useState("");

  async function fetchRecords() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/maintenance-records`, { headers: tenantHeaders() });
      setRecords(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void fetchRecords(); }, []);

  async function handleSave() {
    if (!mPartType || !mDate || !mOdometer) { setErr("Part type, date and odometer are required"); return; }
    setSaving(true); setErr("");
    try {
      const body: Record<string, unknown> = { partType: mPartType, serviceDate: mDate, odometerKm: Number(mOdometer), costNpr: mCost ? Number(mCost) : 0 };
      if (mVehicleId) body.vehicleId = Number(mVehicleId);
      if (mDescription.trim()) body.description = mDescription.trim();
      if (mVendor.trim()) body.vendor = mVendor.trim();
      const r = await fetch(`${BASE}/api/maintenance-records`, { method: "POST", headers: tenantHeaders(), body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed"); }
      setMDescription(""); setMCost(""); setMOdometer(""); setMVendor(""); setMVehicleId(""); setMDate(today); setMPartType(PART_TYPES[0]);
      setShowForm(false);
      await fetchRecords();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    await fetch(`${BASE}/api/maintenance-records/${id}`, { method: "DELETE", headers: tenantHeaders() });
    await fetchRecords();
  }

  // Expense matrix: group by vehicle
  const expenseMatrix = useMemo(() => {
    const byVehicle: Record<string, { plate: string; total: number; byPart: Record<string, number> }> = {};
    for (const r of records) {
      const key = r.vehiclePlate ?? "Unassigned";
      if (!byVehicle[key]) byVehicle[key] = { plate: key, total: 0, byPart: {} };
      byVehicle[key].total += r.costNpr;
      byVehicle[key].byPart[r.partType] = (byVehicle[key].byPart[r.partType] ?? 0) + r.costNpr;
    }
    return Object.values(byVehicle).sort((a, b) => b.total - a.total);
  }, [records]);

  return (
    <div className="space-y-5">
      {/* Expense Matrix */}
      {expenseMatrix.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <BarChart3 size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-primary">Expense Summary by Vehicle</h3>
          </div>
          <div className="p-4 space-y-3">
            {expenseMatrix.map((v) => (
              <div key={v.plate} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-foreground">{v.plate}</span>
                  <span className="text-sm font-bold text-amber-600">NPR {v.total.toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(v.byPart).map(([part, cost]) => (
                    <span key={part} className="rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                      {part}: NPR {cost.toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header + Form */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div><h2 className="font-semibold text-primary flex items-center gap-2"><Wrench size={15} className="text-slate-500" />Service History</h2><p className="text-xs text-muted-foreground mt-0.5">{records.length} records</p></div>
          <button onClick={() => { setShowForm(!showForm); setErr(""); }}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <Plus size={13} />{showForm ? "Cancel" : "Add Record"}
          </button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b border-border bg-muted/20 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Part Type</label>
                <select value={mPartType} onChange={(e) => setMPartType(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                  {PART_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Vehicle</label>
                <select value={mVehicleId} onChange={(e) => setMVehicleId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                  <option value="">— Any —</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Service Date</label>
                <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Cost (NPR)</label>
                <input type="number" value={mCost} onChange={(e) => setMCost(e.target.value)} placeholder="e.g. 3500"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Odometer (KM)</label>
                <input type="number" value={mOdometer} onChange={(e) => setMOdometer(e.target.value)} placeholder="e.g. 15200"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Description <span className="text-muted-foreground/60">(optional)</span></label>
                <input value={mDescription} onChange={(e) => setMDescription(e.target.value)} placeholder="e.g. Front two tires replaced"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Vendor <span className="text-muted-foreground/60">(optional)</span></label>
                <input value={mVendor} onChange={(e) => setMVendor(e.target.value)} placeholder="e.g. Nepal Oil, Tyre House"
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
              </div>
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <button onClick={handleSave} disabled={saving}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
              {saving ? "Saving…" : "Save Service Record"}
            </button>
          </div>
        )}

        <div className="divide-y divide-border max-h-80 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
          {loading && <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>}
          {!loading && records.length === 0 && (
            <div className="py-10 text-center">
              <Wrench size={24} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No service records yet</p>
            </div>
          )}
          {records.map((r) => {
            const partColors: Record<string, string> = {
              Tires: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
              Battery: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
              "Mobil Oil": "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700",
            };
            const partColor = partColors[r.partType] ?? "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800";
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 group">
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Wrench size={15} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${partColor}`}>{r.partType}</span>
                    <span className="text-sm font-medium text-foreground">{r.vehiclePlate ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{r.serviceDate}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.odometerKm.toLocaleString()} km · NPR {r.costNpr.toLocaleString()}{r.vendor ? ` · ${r.vendor}` : ""}</p>
                  {r.description && <p className="text-[10px] text-muted-foreground/70 italic truncate">{r.description}</p>}
                </div>
                <button onClick={() => handleDelete(r.id)}
                  className="opacity-0 group-hover:opacity-100 rounded-lg p-1 text-muted-foreground hover:text-red-500 transition-all">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── FleetDocumentsPanel ────────────────────────────────────────────────────────
function FleetDocumentsPanel({ vehicles }: { vehicles: VehicleItem[] }) {
  const [docs, setDocs] = useState<VehicleDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<Record<number, { bluebook: string; insurance: string; pollution: string }>>({});

  async function fetchDocs() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/vehicle-documents`, { headers: tenantHeaders() });
      const data: VehicleDocRow[] = await r.json();
      setDocs(data);
      const init: Record<number, { bluebook: string; insurance: string; pollution: string }> = {};
      for (const d of data) init[d.vehicleId] = { bluebook: d.bluebookExpiry ?? "", insurance: d.insuranceExpiry ?? "", pollution: d.pollutionExpiry ?? "" };
      setEditState(init);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void fetchDocs(); }, []);

  function getOrInit(vehicleId: number) {
    return editState[vehicleId] ?? { bluebook: "", insurance: "", pollution: "" };
  }
  function setField(vehicleId: number, field: "bluebook" | "insurance" | "pollution", val: string) {
    setEditState((prev) => ({ ...prev, [vehicleId]: { ...getOrInit(vehicleId), [field]: val } }));
  }

  async function handleSave(vehicleId: number) {
    setSavingId(vehicleId);
    const state = getOrInit(vehicleId);
    try {
      const body: Record<string, string | undefined> = {};
      if (state.bluebook) body.bluebookExpiry = state.bluebook;
      if (state.insurance) body.insuranceExpiry = state.insurance;
      if (state.pollution) body.pollutionExpiry = state.pollution;
      await fetch(`${BASE}/api/vehicle-documents/${vehicleId}`, { method: "PUT", headers: tenantHeaders(), body: JSON.stringify(body) });
      await fetchDocs();
    } catch { /* ignore */ }
    finally { setSavingId(null); }
  }

  function docStatus(days: number | null): { label: string; cls: string; critical: boolean } {
    if (days === null) return { label: "Not set", cls: "text-muted-foreground", critical: false };
    if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, cls: "text-red-600 dark:text-red-400 font-bold animate-pulse", critical: true };
    if (days <= 15) return { label: `${days}d left`, cls: "text-red-600 dark:text-red-400 font-bold animate-pulse", critical: true };
    if (days <= 30) return { label: `${days}d left`, cls: "text-amber-600 dark:text-amber-400 font-semibold", critical: false };
    return { label: `${days}d left`, cls: "text-green-600 dark:text-green-400 font-semibold", critical: false };
  }

  // Merge vehicles list with docs so every vehicle appears
  const allVehicles = useMemo(() => {
    const docMap = new Map(docs.map((d) => [d.vehicleId, d]));
    return vehicles.map((v) => ({ vehicle: v, doc: docMap.get(v.id) ?? null }));
  }, [vehicles, docs]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <FileText size={15} className="text-amber-500" />
        <div><h2 className="font-semibold text-primary">Statutory Document Tracker</h2><p className="text-xs text-muted-foreground mt-0.5">Bluebook · Insurance · Pollution Check — per vehicle</p></div>
      </div>

      {loading && <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>}
      {!loading && vehicles.length === 0 && (
        <div className="py-10 text-center">
          <Bus size={24} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No vehicles registered yet</p>
        </div>
      )}

      <div className="divide-y divide-border">
        {allVehicles.map(({ vehicle, doc }) => {
          const state = getOrInit(vehicle.id);
          const bbStatus = docStatus(doc?.daysUntilBluebook ?? null);
          const insStatus = docStatus(doc?.daysUntilInsurance ?? null);
          const polStatus = docStatus(doc?.daysUntilPollution ?? null);
          const isCritical = bbStatus.critical || insStatus.critical || polStatus.critical;

          return (
            <div key={vehicle.id} className={`p-4 space-y-3 ${isCritical ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isCritical && <span className="flex h-2.5 w-2.5 relative shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" /></span>}
                  <div>
                    <p className="text-sm font-bold text-foreground">{vehicle.plateNumber}</p>
                    <p className="text-[10px] text-muted-foreground">{vehicle.model}</p>
                  </div>
                </div>
                {isCritical && <span className="rounded-full bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 px-2.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400 animate-pulse">⚠ Critical</span>}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Bluebook Expiry", field: "bluebook" as const, val: state.bluebook, status: bbStatus },
                  { label: "Insurance Renewal", field: "insurance" as const, val: state.insurance, status: insStatus },
                  { label: "Pollution Check", field: "pollution" as const, val: state.pollution, status: polStatus },
                ].map(({ label, field, val, status }) => (
                  <div key={field}>
                    <label className="mb-1 block text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{label}</label>
                    <input type="date" value={val} onChange={(e) => setField(vehicle.id, field, e.target.value)}
                      className={`w-full rounded-xl border px-2.5 py-2 text-xs text-foreground outline-none focus:border-amber-500 transition-colors ${status.critical ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-border bg-muted"}`} />
                    <p className={`mt-0.5 text-[10px] ${status.cls}`}>{status.label}</p>
                  </div>
                ))}
              </div>

              <button onClick={() => handleSave(vehicle.id)} disabled={savingId === vehicle.id}
                className="w-full rounded-xl border border-border bg-muted py-2 text-xs font-semibold text-foreground hover:bg-muted/60 hover:border-amber-500 disabled:opacity-50 transition-colors">
                {savingId === vehicle.id ? "Saving…" : "Save Document Dates"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminPortal() {
  const { user, login } = useAuth();
  const driverLoc = useDriverLocation();
  const { data: stations, refetch: refetchStations } = useListStations();
  const { data: announcements, refetch: refetchAnnouncements } = useListAnnouncements();
  const { data: passengers, refetch: refetchPassengers } = useListPassengers();
  const { data: drivers, refetch: refetchDrivers } = useListDrivers();
  const { data: vehicles, refetch: refetchVehicles } = useListVehicles();
  const { data: adminRoutes } = useListRoutes();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<Modal>(null);
  const [adminTab, setAdminTab] = useState<"dashboard" | "fleet-fuel" | "fleet-maintenance" | "fleet-documents">("dashboard");
  const [docAlertCount, setDocAlertCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverRow | null>(null);
  const [selectedPassenger, setSelectedPassenger] = useState<PassengerRow | null>(null);
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
  const [pPhone, setPPhone] = useState("");
  const [pRouteId, setPRouteId] = useState("");
  const [pPhoto, setPPhoto] = useState("");
  const [pPhoneFound, setPPhoneFound] = useState<"idle" | "checking" | "found" | "new">("idle");
  const [pSchoolCode, setPSchoolCode] = useState("");
  const [pClass, setPClass] = useState("");
  const [pSection, setPSection] = useState("");
  const [pRollNo, setPRollNo] = useState("");
  const [pFaculty, setPFaculty] = useState("");
  const [pDesignation, setPDesignation] = useState("");
  const [pDesignationCustom, setPDesignationCustom] = useState("");

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

  // Poll vehicle document expiry alerts every 5 minutes
  useEffect(() => {
    async function fetchDocAlerts() {
      try {
        const r = await fetch(`${BASE}/api/vehicle-documents`, { headers: tenantHeaders() });
        if (!r.ok) return;
        const data: VehicleDocRow[] = await r.json();
        setDocAlertCount(data.filter((d) => d.isCritical).length);
      } catch { /* ignore */ }
    }
    void fetchDocAlerts();
    const interval = setInterval(() => void fetchDocAlerts(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [tenantId]);

  // Debounced phone lookup for Add Passenger modal
  useEffect(() => {
    const raw = pPhone.replace(/\D/g, "");
    if (raw.length < 10) { setPPhoneFound("idle"); setPName(""); return; }
    setPPhoneFound("checking");
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`${BASE}/api/auth/me?phone=${raw}`);
        if (r.ok) {
          const data = await r.json() as { name: string; role?: string };
          setPName(data.name ?? "");
          setPPhoneFound("found");
        } else {
          setPPhoneFound("new");
        }
      } catch {
        setPPhoneFound("new");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [pPhone]);

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
    // When an existing user is found, validate the school code first
    if (pPhoneFound === "found") {
      const expected = (tenant?.schoolCode ?? "").trim().toUpperCase();
      if (expected && pSchoolCode.trim().toUpperCase() !== expected) {
        setErr("Incorrect school code. Please check with your administrator.");
        setLoading(false);
        return;
      }
    }
    try {
      await apiPost("/passengers", {
        name: pName,
        role: pRole,
        stationId: Number(pStation),
        phone: pPhone.trim() || undefined,
        routeId: pRouteId ? Number(pRouteId) : undefined,
        photoUrl: pPhoto || undefined,
        className: pClass.trim() || undefined,
        section: pSection.trim() || undefined,
        rollNumber: pRollNo.trim() || undefined,
        faculty: pFaculty.trim() || undefined,
        designation: pDesignation === "Other" ? pDesignationCustom.trim() || undefined : pDesignation.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
      refetchPassengers();
      setModal(null);
      setPName(""); setPRole("student"); setPPhone(""); setPRouteId(""); setPPhoto("");
      setPPhoneFound("idle"); setPSchoolCode("");
      setPClass(""); setPSection(""); setPRollNo(""); setPFaculty("");
      setPDesignation(""); setPDesignationCustom("");
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [pName, pRole, pStation, pPhone, pRouteId, pPhoto, pPhoneFound, pSchoolCode, pClass, pSection, pRollNo, pFaculty, pDesignation, pDesignationCustom, tenant, queryClient, refetchPassengers]);

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
  const onRouteCount = (adminRoutes ?? []).filter((r) => r.isActive).length;

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

      {/* ── Fleet Management & Operations navigation ─────────────────────────── */}
      <nav className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            onClick={() => setAdminTab("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors ${adminTab === "dashboard" ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
            <Home size={11} />Dashboard
          </button>
          <div className="w-px bg-border my-1.5 shrink-0" />
          <div className="flex items-center gap-1 px-2 text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider whitespace-nowrap self-center shrink-0">
            <Settings2 size={9} />Fleet
          </div>
          <button
            onClick={() => setAdminTab("fleet-fuel")}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors ${adminTab === "fleet-fuel" ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
            <Droplets size={11} />Fuel Logs
          </button>
          <button
            onClick={() => setAdminTab("fleet-maintenance")}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors ${adminTab === "fleet-maintenance" ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
            <Wrench size={11} />Service
          </button>
          <button
            onClick={() => setAdminTab("fleet-documents")}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors relative ${adminTab === "fleet-documents" ? "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
            <FileText size={11} />Documents
            {docAlertCount > 0 && (
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white animate-pulse shrink-0">
                {docAlertCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ── Dashboard tab content ──────────────────────────────────────────────── */}
      {adminTab === "dashboard" && (<>
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
      {/* Live Boarding Log */}
      <BoardingLogPanel />
      {/* Communications Log */}
      <DriverCommunicationsPanel />
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
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-xs font-medium text-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors">
                        <Upload size={13} className="inline mr-1" />Change Photo
                      </button>
                      <button onClick={() => bannerEditCameraRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-xs font-medium text-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors">
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
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-3 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors">
                      <Upload size={13} className="inline mr-1" />Upload Photo
                    </button>
                    <button onClick={() => bannerCameraRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-3 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors">
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
      {/* Live Fleet Activity Feed */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-tight">Live Fleet Activity Feed</h2>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium mt-0.5">Notices & Announcements · Shown on all dashboards</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            {announcements?.length ?? 0} active
          </span>
        </div>

        {/* Compose */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex gap-2">
          <input value={newNotice} onChange={(e) => setNewNotice(e.target.value)}
            placeholder="e.g. Bus A will be 15 min late tomorrow…"
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none focus:border-amber-400 focus:bg-white dark:focus:bg-slate-700 transition-colors"
            onKeyDown={(e) => e.key === "Enter" && handleAddNotice()} />
          <button onClick={handleAddNotice} disabled={!newNotice.trim() || noticeSaving}
            className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap">
            {noticeSaving ? "…" : "Post"}
          </button>
        </div>

        {/* Feed */}
        <div className="max-h-72 overflow-y-auto p-4 space-y-2.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
          {(announcements ?? []).length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Bell size={20} className="text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-400 dark:text-slate-500">No active notices</p>
            </div>
          )}
          {(announcements ?? []).map((a) => {
            const msg = a.message.toLowerCase();
            const isEmergency = a.severity === "emergency" || msg.includes("sos") || msg.includes("accident") || msg.includes("urgent") || msg.includes("alert");
            const isDelay = !isEmergency && (msg.includes(" late") || msg.includes("delay") || msg.includes("min late") || msg.includes("slow") || msg.includes("15 min") || msg.includes("30 min"));
            const isBoarded = !isEmergency && !isDelay && (msg.includes("board") || msg.includes("pickup") || msg.includes("confirmed") || msg.includes("on route") || msg.includes("returning"));
            const isCompleted = !isEmergency && !isDelay && !isBoarded && (msg.includes("complet") || msg.includes("arrived") || msg.includes("journey") || msg.includes("finish") || msg.includes("all assigned"));

            const cfg = isEmergency
              ? { icon: <AlertTriangle size={13} />, card: "border-red-100 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/10", wrap: "text-red-500 bg-red-100 dark:bg-red-950/40", dot: "bg-red-500", label: "Emergency" }
              : isDelay
              ? { icon: <Clock size={13} />, card: "border-amber-100 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/10", wrap: "text-amber-500 bg-amber-100 dark:bg-amber-950/40", dot: "bg-amber-500 animate-pulse", label: "Delay" }
              : isBoarded
              ? { icon: <Bus size={13} />, card: "border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/10", wrap: "text-blue-600 bg-blue-100 dark:bg-blue-950/40", dot: "bg-blue-500", label: "Boarding" }
              : isCompleted
              ? { icon: <CheckCircle size={13} />, card: "border-green-100 dark:border-green-900/30 bg-green-50/40 dark:bg-green-950/10", wrap: "text-green-600 bg-green-100 dark:bg-green-950/40", dot: "bg-green-500", label: "Completed" }
              : { icon: <Bell size={13} />, card: "border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/40", wrap: "text-slate-500 bg-slate-100 dark:bg-slate-700", dot: "bg-slate-400", label: "Notice" };

            // Highlight Nepali vehicle plates like "BA 1 KHA 1234"
            const plateRe = /([A-Z]{1,3}\s*\d{1,2}\s*[A-Z]{1,4}\s*\d{1,4})/gi;
            const parts = a.message.split(plateRe);
            const msgNode = parts.map((part, i) =>
              i % 2 === 1
                ? <span key={i} className="inline-block font-mono text-[9px] font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-1.5 py-0.5 rounded-[4px] tracking-widest mx-0.5 align-middle border border-slate-700 dark:border-slate-300 shadow-inner">{part.trim()}</span>
                : <span key={i}>{part}</span>
            );

            const ts = a.createdAt
              ? new Date(a.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
              : "";

            return (
              <div key={a.id}
                className={`group flex items-start gap-3 rounded-xl border p-3 shadow-sm transition-transform duration-150 hover:scale-[1.005] cursor-default ${cfg.card}`}>
                <div className={`flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full mt-0.5 ${cfg.wrap}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug font-normal">{msgNode}</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-light tracking-wide">{cfg.label}{ts ? ` · ${ts}` : ""}</span>
                  </div>
                </div>
                <button onClick={() => handleDeleteNotice(a.id)}
                  className="opacity-0 group-hover:opacity-100 shrink-0 rounded-lg p-1 text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 transition-all mt-0.5">
                  <X size={12} />
                </button>
              </div>
            );
          })}
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
        <div className="divide-y divide-border max-h-52 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
          {passengers?.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => setSelectedPassenger(p as PassengerRow)}>
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
        <div className="divide-y divide-border max-h-52 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
          {drivers?.map((d) => (
            <button key={d.id}
              onClick={() => setSelectedDriver({ id: d.id, name: d.name, phone: d.phone, vehicleNumber: d.vehicleNumber, isActive: d.isActive ?? false, isOnline: d.isOnline ?? false, photoUrl: d.photoUrl })}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
              <img src={d.photoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(d.name)}&backgroundColor=0F172A&textColor=D97706`}
                alt={d.name} className="h-10 w-10 rounded-full border border-border object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{d.name}</p>
                <p className="text-xs text-muted-foreground truncate">{d.phone} · {d.vehicleNumber}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.isActive && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                    d.isOnline
                      ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 animate-pulse"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  }`}>
                    {d.isOnline ? "● Live" : "○ Offline"}
                  </span>
                )}
                {!d.isActive && (
                  <span className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground border-border">
                    Inactive
                  </span>
                )}
                <ChevronRight size={14} className="text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      </div>
      {/* Live Fleet Map */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-primary">Live Fleet Map</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {onRouteCount} bus{onRouteCount !== 1 ? "es" : ""} on route · all vehicles auto-fit
            </p>
          </div>
          {driverLoc.isLive && (
            <div className="flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2.5 py-1 text-[10px] font-bold text-green-700 dark:text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              GPS LIVE
            </div>
          )}
        </div>
        <OsmMap
          mode="fleet"
          buses={FLEET_VEHICLES.map((v) => ({
            id: v.id,
            label: v.plate,
            driverName: v.driver,
            lat: v.lat,
            lng: v.lng,
            status: v.status,
            speed: v.speed,
          }))}
          liveLat={driverLoc.lat}
          liveLng={driverLoc.lng}
          liveIsLive={driverLoc.isLive}
          liveBusId={1}
          height={340}
        />
      </div>

      {/* Fleet Status */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">Fleet Status</h2>
          <span className="text-xs text-muted-foreground">{onRouteCount} of {FLEET_VEHICLES.length} on route</span>
        </div>
        <div className="divide-y divide-border max-h-52 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
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
      {/* Maintenance */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-primary">Maintenance & Fuel Reminders</h2>
        </div>
        <div className="divide-y divide-border max-h-52 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
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
      <SmartStationManager
        stations={stations as StationRow[] | undefined}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
        }}
      />
      {/* Vehicle Asset Grid */}
      <VehicleTagGrid
        vehicles={vehicles as VehicleRow[] | undefined}
        routes={adminRoutes as RouteRow[] | undefined}
        onTagUpdated={() => queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() })}
      />
      {/* Route Management */}
      <RouteManager drivers={drivers} vehicles={vehicles as VehicleRow[] | undefined} />
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
      {/* Passenger Detail Panel */}
      {selectedPassenger && (
        <PassengerDetailPanel
          passenger={selectedPassenger}
          stations={stations as StationOption[] | undefined}
          routes={adminRoutes as RouteRow[] | undefined}
          onClose={() => setSelectedPassenger(null)}
          onRefresh={() => {
            refetchPassengers();
            queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
          }}
        />
      )}
      {/* Driver Detail Panel */}
      {selectedDriver && (
        <DriverDetailPanel
          driver={selectedDriver}
          vehicles={vehicles as VehicleRow[] | undefined}
          routes={adminRoutes as RouteRow[] | undefined}
          onClose={() => setSelectedDriver(null)}
          onRefresh={() => {
            refetchDrivers();
            queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
          }}
        />
      )}
      {/* Bus Detail Panel */}
      {selectedVehicle && (
        <BusDetailPanel vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
      )}
      </>)}

      {/* ── Fleet Ops tab content ──────────────────────────────────────────────── */}
      {adminTab === "fleet-fuel" && (
        <FleetFuelPanel vehicles={(vehicles ?? []).map((v) => ({ id: v.id, plateNumber: v.plateNumber, model: v.model }))} />
      )}
      {adminTab === "fleet-maintenance" && (
        <FleetMaintenancePanel vehicles={(vehicles ?? []).map((v) => ({ id: v.id, plateNumber: v.plateNumber, model: v.model }))} />
      )}
      {adminTab === "fleet-documents" && (
        <FleetDocumentsPanel vehicles={(vehicles ?? []).map((v) => ({ id: v.id, plateNumber: v.plateNumber, model: v.model }))} />
      )}

      {/* MODAL: Add Passenger */}
      {modal === "add-passenger" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setModal(null); setPPhone(""); setPPhoneFound("idle"); setPSchoolCode(""); } }}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-primary">Add Student / Staff</h3>

            {/* Phone field — always shown first */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Contact Number <span className="text-muted-foreground/60">(used to log in via OTP)</span>
              </label>
              <div className="flex gap-2">
                <span className="flex items-center rounded-xl border border-border bg-muted px-3 text-sm text-muted-foreground select-none">+977</span>
                <div className="relative flex-1">
                  <input value={pPhone} onChange={(e) => { setPPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setPPhoneFound("idle"); }}
                    placeholder="98XXXXXXXX" type="tel" inputMode="numeric"
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500 pr-8" />
                  {pPhoneFound === "checking" && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
                  )}
                  {pPhoneFound === "found" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-sm">✓</span>}
                  {pPhoneFound === "new" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-400 text-sm">+</span>}
                </div>
              </div>
            </div>

            {/* ── EXISTING USER found — simplified form ── */}
            {pPhoneFound === "found" && (
              <>
                <div className="flex items-center gap-2.5 rounded-xl border border-green-700/40 bg-green-950/20 px-3.5 py-3">
                  <span className="text-green-400 text-base">✅</span>
                  <div>
                    <p className="text-xs font-semibold text-green-300">Existing OrbitTrack user found</p>
                    <p className="text-[11px] text-green-400/70 mt-0.5">Name auto-filled · No new account will be created</p>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Full Name</label>
                  <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Full name"
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500" />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">School Code</label>
                  <input value={pSchoolCode} onChange={(e) => setPSchoolCode(e.target.value.toUpperCase())}
                    placeholder="Enter your school code to confirm"
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground font-mono tracking-wider outline-none focus:border-amber-500 placeholder:font-sans placeholder:tracking-normal" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Confirm with your school code before linking</p>
                </div>

                {err && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl px-3 py-2">{err}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setModal(null); setPPhone(""); setPPhoneFound("idle"); setPSchoolCode(""); }}
                    className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
                  <button onClick={handleAddPassenger} disabled={!pName.trim() || !pSchoolCode.trim() || loading}
                    className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50">
                    {loading ? "Linking…" : "Link Member ✓"}
                  </button>
                </div>
              </>
            )}

            {/* ── NEW USER — full form ── */}
            {pPhoneFound === "new" && (
              <>
                <div className="flex items-center gap-2.5 rounded-xl border border-blue-700/40 bg-blue-950/20 px-3.5 py-3">
                  <span className="text-blue-400 text-base">🆕</span>
                  <div>
                    <p className="text-xs font-semibold text-blue-300">New user — fill in their details</p>
                    <p className="text-[11px] text-blue-400/70 mt-0.5">An account will be created so they can log in via OTP</p>
                  </div>
                </div>

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

                {/* ── Designation — staff only ── */}
                {pRole === "staff" && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Staff Details</p>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Designation</label>
                      <select value={pDesignation} onChange={(e) => { setPDesignation(e.target.value); if (e.target.value !== "Other") setPDesignationCustom(""); }}
                        className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                        <option value="">— Select —</option>
                        <option value="Teacher">Teacher</option>
                        <option value="Principal">Principal</option>
                        <option value="Vice Principal">Vice Principal</option>
                        <option value="Accountant">Accountant</option>
                        <option value="School Staff">School Staff</option>
                        <option value="Librarian">Librarian</option>
                        <option value="Lab Assistant">Lab Assistant</option>
                        <option value="Security Guard">Security Guard</option>
                        <option value="Peon / Helper">Peon / Helper</option>
                        <option value="Other">Other (custom)</option>
                      </select>
                    </div>
                    {pDesignation === "Other" && (
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Custom Designation</label>
                        <input value={pDesignationCustom} onChange={(e) => setPDesignationCustom(e.target.value)} placeholder="e.g. Sports Coach, Counsellor…"
                          className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
                      </div>
                    )}
                  </div>
                )}

                {/* ── Academic Details — students only ── */}
                {pRole === "student" && <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Academic Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Class / Grade</label>
                      <select value={pClass} onChange={(e) => setPClass(e.target.value)}
                        className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                        <option value="">— Select —</option>
                        {["Nursery","LKG","UKG","Class 1","Class 2","Class 3","Class 4","Class 5","Class 6","Class 7","Class 8","Class 9","Class 10","Class 11","Class 12"].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Section</label>
                      <input value={pSection} onChange={(e) => setPSection(e.target.value)} placeholder="A, B, Science…"
                        className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Roll No.</label>
                      <input value={pRollNo} onChange={(e) => setPRollNo(e.target.value)} placeholder="e.g. 042"
                        className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Faculty / Stream</label>
                      <select value={pFaculty} onChange={(e) => setPFaculty(e.target.value)}
                        className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                        <option value="">N/A</option>
                        <option value="Science">Science</option>
                        <option value="Management">Management</option>
                        <option value="Humanities">Humanities</option>
                        <option value="Law">Law</option>
                        <option value="Education">Education</option>
                        <option value="Hotel Management">Hotel Management</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">School Code</label>
                    <input value={pSchoolCode} onChange={(e) => setPSchoolCode(e.target.value.toUpperCase())}
                      placeholder="Auto-filled from your school — confirm to link"
                      className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground font-mono tracking-wider outline-none focus:border-amber-500 placeholder:font-sans placeholder:tracking-normal" />
                    <p className="mt-1 text-[11px] text-muted-foreground">Matches the school code visible in your Admin settings</p>
                  </div>
                </div>}

                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Assigned Bus Route <span className="text-muted-foreground/60">(connects student to bus)</span>
                  </label>
                  <select value={pRouteId} onChange={(e) => setPRouteId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                    <option value="">No route assigned</option>
                    {(adminRoutes as RouteRow[] ?? []).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}{r.vehiclePlate ? ` · ${r.vehiclePlate}` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    Profile Photo <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <PhotoPicker value={pPhoto} onChange={setPPhoto} />
                </div>
                {err && <p className="text-xs text-red-500">{err}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setModal(null); setPPhone(""); setPPhoneFound("idle"); }}
                    className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
                  <button onClick={handleAddPassenger} disabled={!pName || loading}
                    className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                    {loading ? "Adding…" : "Add Member"}
                  </button>
                </div>
              </>
            )}

            {/* ── WAITING for phone — prompt ── */}
            {pPhoneFound === "idle" && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-4 text-center justify-center">
                <span className="text-muted-foreground text-sm">Enter a 10-digit number to continue</span>
              </div>
            )}
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
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Assign Bus</label>
              {(vehicles ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                  No buses registered yet — add a vehicle first.
                </p>
              ) : (
                <select value={dVehicle} onChange={(e) => setDVehicle(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500 appearance-none cursor-pointer">
                  <option value="">— Select a bus —</option>
                  {(vehicles ?? []).map((v) => (
                    <option key={v.id} value={v.plateNumber}>
                      {v.plateNumber} · {v.model}
                    </option>
                  ))}
                </select>
              )}
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
