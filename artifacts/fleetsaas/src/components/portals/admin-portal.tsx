import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useListStations, useListAnnouncements, useListPassengers, useListDrivers, useListRoutes, useListVehicles, getListPassengersQueryKey, getListDriversQueryKey, getListRoutesQueryKey, getListStationsQueryKey, getListVehiclesQueryKey, useListCalendarEvents, getListCalendarEventsQueryKey, getTenantId } from "@workspace/api-client-react";
import { CheckCircle, MapPin, Home, Bus, Upload, Camera, Pencil, AlertTriangle, Wrench, Send, MessageSquare, Megaphone, Phone, Route, Plus, Trash2, Search, Navigation, ChevronDown, ChevronUp, X, RefreshCw, CalendarDays, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import StationMapPicker from "@/components/station-map-picker";
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
    setSaving(true);
    try {
      await apiPatch(`/drivers/${driver.id}`, { isActive: !driver.isActive });
      onRefresh();
    } catch { /* ignore */ }
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
            <button onClick={handleToggleActive} disabled={saving}
              className={`w-full rounded-xl border py-2 text-xs font-semibold transition-colors ${driver.isActive
                ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/30"
                : "border-border bg-muted text-muted-foreground hover:border-amber-500 hover:text-amber-600"}`}>
              {driver.isActive ? "✓ Mark Inactive" : "✓ Mark Active"}
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
type RouteStation = { id: number; routeId: number; stationId: number; position: number; stationName: string | null; lat: number | null; lng: number | null; radius: number | null };
type RouteRow = { id: number; name: string; driverId: number | null; vehicleId: number | null; isActive: boolean | null; driverName: string | null; vehiclePlate: string | null };
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
  const [addingId, setAddingId] = useState("");

  // Assignment state — kept in sync with route prop so refetch updates dropdowns
  const [editVehicle, setEditVehicle] = useState(String(route.vehicleId ?? ""));
  const [editDriver, setEditDriver] = useState(String(route.driverId ?? ""));
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSaved, setAssignSaved] = useState(false);

  useEffect(() => {
    setEditVehicle(String(route.vehicleId ?? ""));
    setEditDriver(String(route.driverId ?? ""));
  }, [route.vehicleId, route.driverId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/routes/${routeId}/stations`);
      const data = await r.json();
      setRouteStations(data);
    } finally { setLoading(false); }
  }, [routeId]);

  useEffect(() => { load(); }, [load]);

  async function handleAssign() {
    setAssignSaving(true);
    setAssignSaved(false);
    try {
      await apiPatch(`/routes/${routeId}`, {
        vehicleId: editVehicle ? Number(editVehicle) : null,
        driverId: editDriver ? Number(editDriver) : null,
      });
      onRouteUpdated();
      setAssignSaved(true);
      setTimeout(() => setAssignSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setAssignSaving(false); }
  }

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

  const vehicleLabel = (v: VehicleRow) => v.tag ? `${v.tag} — ${v.plateNumber}` : v.plateNumber;

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Stations on this route ({routeStations.length})</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
      </div>

      {/* Bus & Driver assignment */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Bus size={10} />Assign Bus &amp; Driver</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Bus</label>
            <select
              value={editVehicle}
              onChange={(e) => setEditVehicle(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500"
            >
              <option value="">None</option>
              {(vehicles ?? []).map((v) => (
                <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Driver</label>
            <select
              value={editDriver}
              onChange={(e) => setEditDriver(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-amber-500"
            >
              <option value="">None</option>
              {(drivers ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleAssign}
          disabled={assignSaving}
          className={`w-full rounded-lg py-1.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
            assignSaved
              ? "bg-green-500 text-white"
              : "bg-amber-500 text-slate-900 hover:bg-amber-400"
          }`}
        >
          {assignSaving ? "Saving…" : assignSaved ? "✓ Saved!" : "Save Assignment"}
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1">
          {routeStations.length === 0 && <p className="text-xs text-muted-foreground italic">No stations assigned yet</p>}
          {routeStations.map((rs, idx) => (
            <div key={rs.id} className="flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2">
              <span className="text-[10px] font-bold text-[#FFF078] w-4 shrink-0">{idx + 1}</span>
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [rName, setRName] = useState("");
  const [rDriver, setRDriver] = useState("");
  const [rVehicle, setRVehicle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Staged stations for new route
  const [stagedStations, setStagedStations] = useState<{ stationId: number; name: string }[]>([]);
  const [stationPickId, setStationPickId] = useState("");

  // Geocode search state (inline in Create form)
  const [geoQuery, setGeoQuery] = useState("");
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([]);
  const [geoSearching, setGeoSearching] = useState(false);
  const [geoPicked, setGeoPicked] = useState<GeocodeResult | null>(null);
  const [geoStageName, setGeoStageName] = useState("");
  const [geoErr, setGeoErr] = useState("");

  // Drag-and-drop state for visual route builder
  const dragItemRef = useRef<{ type: "station" | "vehicle" | "driver"; id: number; label: string } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [tlVehicle, setTlVehicle] = useState<{ id: number; label: string } | null>(null);
  const [tlDriver, setTlDriver] = useState<{ id: number; name: string } | null>(null);

  // Map picker for new station
  const [showMapPicker, setShowMapPicker] = useState(false);

  const stagedIds = new Set(stagedStations.map((s) => s.stationId));
  const availableStations = (allStations ?? []).filter((s) => !stagedIds.has(s.id));

  async function handleGeoSearch() {
    if (!geoQuery.trim()) return;
    setGeoErr(""); setGeoSearching(true); setGeoResults([]); setGeoPicked(null);
    try {
      const r = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(geoQuery)}`);
      const data: GeocodeResult[] = await r.json();
      if (data.length === 0) setGeoErr("No locations found — try a different search");
      setGeoResults(data);
    } catch { setGeoErr("Search failed"); }
    finally { setGeoSearching(false); }
  }

  async function handleStageGeoStation() {
    if (!geoPicked || !geoStageName.trim()) return;
    try {
      const created = await apiPost("/stations", { name: geoStageName.trim(), lat: geoPicked.lat, lng: geoPicked.lng, radius: 200 });
      setStagedStations((prev) => [...prev, { stationId: created.id, name: geoStageName.trim() }]);
      queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
      setGeoQuery(""); setGeoResults([]); setGeoPicked(null); setGeoStageName(""); setGeoErr("");
    } catch { setGeoErr("Failed to create station"); }
  }

  function handleAddExistingStation() {
    if (!stationPickId) return;
    const station = (allStations ?? []).find((s) => s.id === Number(stationPickId));
    if (!station || stagedIds.has(station.id)) return;
    setStagedStations((prev) => [...prev, { stationId: station.id, name: station.name }]);
    setStationPickId("");
  }

  async function handleCreate() {
    if (!rName.trim()) return;
    setErr(""); setSaving(true);
    try {
      const route = await apiPost("/routes", { name: rName.trim(), driverId: rDriver ? Number(rDriver) : undefined, vehicleId: rVehicle ? Number(rVehicle) : undefined });
      for (const s of stagedStations) {
        await apiPost(`/routes/${route.id}/stations`, { stationId: s.stationId });
      }
      setRName(""); setRDriver(""); setRVehicle(""); setStagedStations([]); setCreating(false);
      setGeoQuery(""); setGeoResults([]); setGeoPicked(null); setGeoStageName("");
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
        <div className="px-5 py-4 border-b border-border bg-muted/30 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Route Name */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Route Name</label>
            <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="e.g. Route B4 – Koteshwor"
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500" />
          </div>

          {/* ── Visual Drag-and-Drop Builder ── */}
          <div className="flex flex-col gap-4">
            {/* LEFT PALETTE */}
            <div className="space-y-3 min-w-0">
              {/* Stations palette */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Navigation size={9} />Stations
                </p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {availableStations.length === 0 && (
                    <p className="text-[10px] text-muted-foreground italic px-1">All stations added</p>
                  )}
                  {availableStations.map((s) => (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={() => { dragItemRef.current = { type: "station", id: s.id, label: s.name }; }}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none hover:border-amber-400 transition-colors"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                      <p className="text-xs text-foreground truncate">{s.name}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Map-based new station picker */}
              <div className="border-t border-border pt-2.5">
                {!showMapPicker ? (
                  <button
                    onClick={() => setShowMapPicker(true)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/10 px-2.5 py-2 text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
                  >
                    <MapPin size={10} />+ New Station on Map
                  </button>
                ) : (
                  <StationMapPicker
                    onConfirm={async ({ name, lat, lng }) => {
                      const created = await apiPost("/stations", { name, lat, lng, radius: 200 });
                      setStagedStations((prev) => [...prev, { stationId: created.id, name }]);
                      queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
                      setShowMapPicker(false);
                    }}
                    onCancel={() => setShowMapPicker(false)}
                  />
                )}
              </div>

              {/* Vehicles palette */}
              {(vehicles ?? []).length > 0 && (
                <div className="border-t border-border pt-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <Bus size={9} />Vehicles
                  </p>
                  <div className="space-y-1">
                    {(vehicles ?? []).map((v) => (
                      <div
                        key={v.id}
                        draggable
                        onDragStart={() => { dragItemRef.current = { type: "vehicle", id: v.id, label: v.tag ? `${v.tag} — ${v.plateNumber}` : v.plateNumber }; }}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none hover:border-amber-400 transition-colors"
                      >
                        <Bus size={10} className="text-muted-foreground shrink-0" />
                        <p className="text-xs text-foreground flex-1 truncate">{vehicleLabel(v)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Drivers palette */}
              {(drivers ?? []).length > 0 && (
                <div className="border-t border-border pt-2.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Drivers</p>
                  <div className="space-y-1">
                    {(drivers ?? []).map((d) => (
                      <div
                        key={d.id}
                        draggable
                        onDragStart={() => { dragItemRef.current = { type: "driver", id: d.id, label: d.name }; }}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none hover:border-amber-400 transition-colors"
                      >
                        <span className="h-5 w-5 rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700 flex items-center justify-center text-[8px] font-bold text-amber-700 dark:text-amber-400 shrink-0">
                          {d.name[0]}
                        </span>
                        <p className="text-xs text-foreground flex-1 truncate">{d.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Route Timeline drop zone */}
            <div className="space-y-2 min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Route Timeline</p>

              {/* Bus slot */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverTarget("vehicle-slot"); }}
                onDragLeave={() => setDragOverTarget(null)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOverTarget(null);
                  const item = dragItemRef.current;
                  if (item?.type === "vehicle") { setRVehicle(String(item.id)); setTlVehicle({ id: item.id, label: item.label }); }
                }}
                className={`rounded-xl border-2 border-dashed px-3 py-2 flex items-center gap-2 transition-all ${tlVehicle ? "border-green-400 bg-green-50 dark:bg-green-950/20" : dragOverTarget === "vehicle-slot" ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/10" : "border-border bg-muted/20"}`}
              >
                <Bus size={13} className={tlVehicle ? "text-green-600" : "text-muted-foreground"} />
                {tlVehicle ? (
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{tlVehicle.label}</p>
                    <button onClick={() => { setTlVehicle(null); setRVehicle(""); }} className="text-muted-foreground hover:text-red-500 shrink-0 ml-1"><X size={10} /></button>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic">Drop bus here</p>
                )}
              </div>

              {/* Driver slot */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverTarget("driver-slot"); }}
                onDragLeave={() => setDragOverTarget(null)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOverTarget(null);
                  const item = dragItemRef.current;
                  if (item?.type === "driver") { setRDriver(String(item.id)); setTlDriver({ id: item.id, name: item.label }); }
                }}
                className={`rounded-xl border-2 border-dashed px-3 py-2 flex items-center gap-2 transition-all ${tlDriver ? "border-green-400 bg-green-50 dark:bg-green-950/20" : dragOverTarget === "driver-slot" ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/10" : "border-border bg-muted/20"}`}
              >
                <span className={`h-4 w-4 rounded-full border flex items-center justify-center text-[8px] font-bold shrink-0 ${tlDriver ? "bg-green-100 dark:bg-green-950/40 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400" : "bg-muted border-border text-muted-foreground"}`}>
                  {tlDriver ? tlDriver.name[0] : "?"}
                </span>
                {tlDriver ? (
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{tlDriver.name}</p>
                    <button onClick={() => { setTlDriver(null); setRDriver(""); }} className="text-muted-foreground hover:text-red-500 shrink-0 ml-1"><X size={10} /></button>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic">Drop driver here</p>
                )}
              </div>

              {/* Station timeline drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverTarget("station-list"); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTarget(null); }}
                onDrop={(e) => {
                  e.preventDefault(); setDragOverTarget(null);
                  const item = dragItemRef.current;
                  if (item?.type === "station" && !stagedIds.has(item.id)) {
                    setStagedStations((prev) => [...prev, { stationId: item.id, name: item.label }]);
                  }
                }}
                className={`rounded-xl border-2 border-dashed min-h-[110px] flex flex-col transition-all ${dragOverTarget === "station-list" ? "border-amber-400 bg-amber-50/40 dark:bg-amber-950/10" : "border-border bg-muted/10"}`}
              >
                {stagedStations.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-6">
                    <p className="text-[10px] text-muted-foreground italic text-center leading-relaxed">
                      Drop stations here<br />to build the route
                    </p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {stagedStations.map((s, idx) => (
                      <div
                        key={s.stationId}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); dragItemRef.current = { type: "station", id: s.stationId, label: s.name }; }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverTarget(`station-${idx}`); }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation(); setDragOverTarget(null);
                          const item = dragItemRef.current;
                          if (item?.type === "station" && item.id !== s.stationId) {
                            setStagedStations((prev) => {
                              const fromIdx = prev.findIndex((x) => x.stationId === item.id);
                              if (fromIdx === -1) {
                                const next = [...prev];
                                next.splice(idx, 0, { stationId: item.id, name: item.label });
                                return next;
                              }
                              const next = [...prev];
                              const [moved] = next.splice(fromIdx, 1);
                              next.splice(idx, 0, moved);
                              return next;
                            });
                          }
                        }}
                        className={`flex items-center gap-2 rounded-lg bg-card border px-2.5 py-1.5 cursor-grab active:cursor-grabbing transition-all ${dragOverTarget === `station-${idx}` ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border"}`}
                      >
                        <span className="text-[10px] font-bold text-[#FFF078] w-3.5 shrink-0">{idx + 1}</span>
                        <p className="flex-1 text-xs text-foreground truncate">{s.name}</p>
                        <button onClick={() => setStagedStations((prev) => prev.filter((x) => x.stationId !== s.stationId))}
                          className="text-red-400 hover:text-red-600 shrink-0"><X size={10} /></button>
                      </div>
                    ))}
                    {/* Drop more here */}
                    <div className="px-2 py-1 text-[10px] text-muted-foreground/60 italic text-center">
                      + drop more stations
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setCreating(false); setRName(""); setErr(""); setStagedStations([]); setGeoQuery(""); setGeoResults([]); setGeoPicked(null); setTlVehicle(null); setTlDriver(null); setRVehicle(""); setRDriver(""); }}
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={handleCreate} disabled={!rName.trim() || saving}
              className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
              {saving ? "Creating…" : `Create Route${stagedStations.length > 0 ? ` + ${stagedStations.length} stop${stagedStations.length > 1 ? "s" : ""}` : ""}`}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border max-h-52 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-amber-500">
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
              <RouteStationsPanel
                routeId={r.id}
                route={r}
                vehicles={vehicles}
                drivers={drivers}
                onClose={() => setExpandedId(null)}
                onRouteUpdated={() => { refetch(); queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() }); }}
              />
            )}
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
      await apiPost("/passengers", { name: pName, role: pRole, stationId: Number(pStation), phone: pPhone.trim() || undefined, routeId: pRouteId ? Number(pRouteId) : undefined, photoUrl: pPhoto || undefined });
      queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
      refetchPassengers();
      setModal(null); setPName(""); setPRole("student"); setPPhone(""); setPRouteId(""); setPPhoto("");
      setPPhoneFound("idle"); setPSchoolCode("");
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [pName, pRole, pStation, pPhone, pRouteId, pPhoto, pPhoneFound, pSchoolCode, tenant, queryClient, refetchPassengers]);

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
              <p className="flex-1 text-sm dark:text-red-300 bg-[#cec9d1] text-[#000] font-bold">{a.message}</p>
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
