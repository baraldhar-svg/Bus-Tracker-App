import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  useListStations,
  useListAnnouncements,
  useListPassengers,
  useListDrivers,
  useListRoutes,
  useListVehicles,
  getListPassengersQueryKey,
  getListDriversQueryKey,
  getListRoutesQueryKey,
  getListStationsQueryKey,
  getListVehiclesQueryKey,
  getListAnnouncementsQueryKey,
  useListCalendarEvents,
  getListCalendarEventsQueryKey,
  getTenantId,
} from "@workspace/api-client-react";
import {
  CheckCircle,
  MapPin,
  Home,
  Bus,
  Upload,
  Camera,
  Pencil,
  AlertTriangle,
  Wrench,
  Send,
  MessageSquare,
  Megaphone,
  Phone,
  Route,
  Plus,
  Trash2,
  Search,
  Navigation,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Star,
  Clock,
  Lock,
  User,
  Bell,
  Droplets,
  FileText,
  BarChart3,
  Gauge,
  AlertCircle,
  Settings2,
  MessageCircle,
  Download,
} from "lucide-react";
import StationMapPicker from "@/components/station-map-picker";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ── 🛠️ OsmMap Import ──
import OsmMap, { RouteStop, FleetBus } from "@/components/osm-map";

import { useLiveLocations } from "@/hooks/use-live-locations";
import {
  adToBs,
  bsToAd,
  getDaysInBsMonth,
  getFirstWeekdayOfBsMonth,
  todayBs,
  bsDateToAd,
  BS_MONTH_NAMES_NE,
  AD_MONTH_NAMES,
} from "@/lib/bs-calendar";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useDriverMessages } from "@/lib/driver-messages";

// 🚀 सिधै रीप्लिट ब्याकइन्डको ठेगाना हार्डकोड गरिएको
const REPLIT_BACKEND =
  "https://33c7862f-0438-4adc-83ae-af5ac11d06a3-00-3u2khpqjgrop5.sisko.replit.dev";

function tenantHeaders(): Record<string, string> {
  const id = getTenantId();
  return id !== null
    ? { "Content-Type": "application/json", "x-tenant-id": String(id) }
    : { "Content-Type": "application/json" };
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${REPLIT_BACKEND}/api${path}`, {
    method: "POST",
    headers: tenantHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`${REPLIT_BACKEND}/api${path}`, {
    method: "PATCH",
    headers: tenantHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiPut(path: string, body: unknown) {
  const res = await fetch(`${REPLIT_BACKEND}/api${path}`, {
    method: "PUT",
    headers: tenantHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiDelete(path: string) {
  const id = getTenantId();
  const headers: Record<string, string> =
    id !== null ? { "x-tenant-id": String(id) } : {};
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

const STATUS_STYLES: Record<string, string> = {
  boarded:
    "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  pending:
    "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  leave:
    "bg-gray-100 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
};
const STATUS_LABELS: Record<string, string> = {
  boarded: "✓ Boarded",
  pending: "Pending",
  leave: "On Leave",
};

function PassengerAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl?: string | null;
}) {
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

// ── 📅 CalendarManager (Date by Notes, Event Notification & One-Click Weekend Holidays) ───────────────────
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
  const [bsYear, setBsYear] = useState(todayB.year);
  const [bsMonth, setBsMonth] = useState(todayB.month);
  const [adYear, setAdYear] = useState(todayAd.getFullYear());
  const [adMonth, setAdMonth] = useState(todayAd.getMonth() + 1);

  // इभेन्ट/नोट्स थप्ने नयाँ स्टेटहरू
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDescription, setNoteDescription] = useState("");
  const [eventType, setEventType] = useState("holiday"); // holiday वा event
  const [savingNote, setSavingNote] = useState(false);

  const adMonthStart = useMemo(() => {
    if (calSystem === "bs") return bsToAd(bsYear, bsMonth, 1);
    return { year: adYear, month: adMonth, day: 1 };
  }, [calSystem, bsYear, bsMonth, adYear, adMonth]);

  const adMonthEnd = useMemo(() => {
    if (calSystem === "bs")
      return bsToAd(bsYear, bsMonth, getDaysInBsMonth(bsYear, bsMonth));
    return { year: adYear, month: adMonth, day: 1 };
  }, [calSystem, bsYear, bsMonth, adYear, adMonth]);

  const queryMonth1 = `${adMonthStart.year}-${String(adMonthStart.month).padStart(2, "0")}`;
  const queryMonth2 =
    calSystem === "bs" && adMonthEnd.month !== adMonthStart.month
      ? `${adMonthEnd.year}-${String(adMonthEnd.month).padStart(2, "0")}`
      : null;

  const { data: eventsA, refetch: refetchA } = useListCalendarEvents({
    month: queryMonth1,
  });
  const { data: eventsB, refetch: refetchB } = useListCalendarEvents({
    month: queryMonth2 ?? queryMonth1,
  });

  const events = useMemo(() => {
    const all = [...(eventsA ?? []), ...(queryMonth2 ? (eventsB ?? []) : [])];
    const seen = new Set<number>();
    return all.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [eventsA, eventsB, queryMonth2]);

  function refetch() {
    void refetchA();
    if (queryMonth2) void refetchB();
  }

  function switchTo(sys: "bs" | "ad") {
    if (sys === calSystem) return;
    if (sys === "ad") {
      const d = bsToAd(bsYear, bsMonth, 1);
      setAdYear(d.year);
      setAdMonth(d.month);
    } else {
      const bs = adToBs(adYear, adMonth, 1);
      setBsYear(bs.year);
      setBsMonth(bs.month);
    }
    setCalSystem(sys);
    setSelectedDay(null);
  }

  function prevMonth() {
    setSelectedDay(null);
    if (calSystem === "bs") {
      if (bsMonth === 1) {
        setBsYear((y) => y - 1);
        setBsMonth(12);
      } else setBsMonth((m) => m - 1);
    } else {
      if (adMonth === 1) {
        setAdYear((y) => y - 1);
        setAdMonth(12);
      } else setAdMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    setSelectedDay(null);
    if (calSystem === "bs") {
      if (bsMonth === 12) {
        setBsYear((y) => y + 1);
        setBsMonth(1);
      } else setBsMonth((m) => m + 1);
    } else {
      if (adMonth === 12) {
        setAdYear((y) => y + 1);
        setAdMonth(1);
      } else setAdMonth((m) => m + 1);
    }
  }

  const daysInMonth =
    calSystem === "bs"
      ? getDaysInBsMonth(bsYear, bsMonth)
      : getAdDaysInMonth(adYear, adMonth);
  const firstWeekday =
    calSystem === "bs"
      ? getFirstWeekdayOfBsMonth(bsYear, bsMonth)
      : getAdFirstWeekday(adYear, adMonth);

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

  // तारिख अनुसार नोट / इभेन्ट सेभ गर्ने फङ्सन
  async function handleSaveNote() {
    if (!selectedDay || !noteTitle.trim()) return;
    setSavingNote(true);
    try {
      const adDateStr =
        calSystem === "bs"
          ? bsDateToAd(bsYear, bsMonth, selectedDay)
          : `${adYear}-${String(adMonth).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;

      await apiPost("/calendar-events", {
        title: noteTitle.trim(),
        description: noteDescription.trim() || null,
        type: eventType,
        eventDate: adDateStr,
        autoNotify: true,
      });
      setNoteTitle("");
      setNoteDescription("");
      setSelectedDay(null);
      refetch();
      queryClient.invalidateQueries({
        queryKey: getListCalendarEventsQueryKey(),
      });
    } catch {
      alert("Failed to save event note.");
    } finally {
      setSavingNote(false);
    }
  }

  // 🛠️ One-Click Weekly Holiday (महिनाका सबै शनिबारहरूलाई एकै क्लिकमा बिदा सेट गर्ने)
  async function handleSetWeeklyHolidays() {
    if (
      !confirm(
        "महिनाका सबै शनिबारहरूलाई बिदा (Holiday) को रूपमा सेट गर्न चाहनुहुन्छ?",
      )
    )
      return;
    try {
      for (let day = 1; day <= daysInMonth; day++) {
        let weekday = 0;
        if (calSystem === "bs") {
          // नेपाली सिस्टमको बार निकाल्ने लजिक
          weekday = (firstWeekday + day - 1) % 7;
        } else {
          weekday = new Date(adYear, adMonth - 1, day).getDay();
        }

        if (weekday === 6) {
          // ६ भनेको शनिबार (Saturday)
          const adDateStr =
            calSystem === "bs"
              ? bsDateToAd(bsYear, bsMonth, day)
              : `${adYear}-${String(adMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          await apiPost("/calendar-events", {
            title: "साप्ताहिक बिदा (Saturday Holiday)",
            type: "holiday",
            eventDate: adDateStr,
            autoNotify: false,
          });
        }
      }
      refetch();
      queryClient.invalidateQueries({
        queryKey: getListCalendarEventsQueryKey(),
      });
      alert("महिनाका सबै शनिबारहरू बिदा सेट भए!");
    } catch {
      alert("Failed to apply weekly holidays.");
    }
  }

  const WEEKDAYS = calSystem === "bs" ? WEEKDAYS_NE : WEEKDAYS_EN;
  const headerTitle =
    calSystem === "bs"
      ? `${BS_MONTH_NAMES_NE[bsMonth - 1]} ${bsYear}`
      : `${AD_MONTH_NAMES[adMonth - 1]} ${adYear}`;
  const headerSubtitle =
    calSystem === "bs"
      ? `${queryMonth1.replace("-", " / ")} AD`
      : (() => {
          const bs = adToBs(adYear, adMonth, 1);
          return `${BS_MONTH_NAMES_NE[bs.month - 1]} ${bs.year} BS`;
        })();

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-[#FFF078]" />
          <div>
            <h2 className="font-semibold text-primary">
              विद्यालय क्यालेन्डर (Date Notes & Notifications)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click any date to add important Notes, Events or Holidays
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-0.5 text-xs font-semibold">
          <button
            onClick={() => switchTo("bs")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "bs" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}
          >
            BS
          </button>
          <button
            onClick={() => switchTo("ad")}
            className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "ad" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}
          >
            AD
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <button
          onClick={prevMonth}
          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="font-bold text-sm text-foreground">{headerTitle}</p>
          <p className="text-[10px] text-muted-foreground">{headerSubtitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSetWeeklyHolidays}
            className="text-[10px] bg-red-500 text-white font-bold px-2 py-1 rounded-lg hover:bg-red-600 transition-colors"
          >
            🎯 One-Click Sat Holidays
          </button>
          <button
            onClick={nextMonth}
            className="rounded-lg p-1.5 hover:bg-muted transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* क्यालेन्डर ग्रिड */}
        <div className="md:col-span-2 border-r border-border/50 pr-2">
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold text-muted-foreground py-1"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday =
                day === todayB.day &&
                bsMonth === todayB.month &&
                calSystem === "bs";
              const dayEvents = eventsByDay.get(day) ?? [];
              const isHoliday = dayEvents.some((e) => e.type === "holiday");
              const isEvent = dayEvents.some((e) => e.type === "event");
              const isSelected = selectedDay === day;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`relative flex flex-col items-center rounded-xl py-1.5 transition-all text-xs ${isSelected ? "bg-primary text-primary-foreground font-bold shadow-md" : isToday ? "bg-amber-400 dark:bg-amber-500 text-white font-extrabold ring-2 ring-amber-500" : isHoliday ? "bg-red-100 text-red-700 font-semibold" : isEvent ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-muted text-foreground font-medium"}`}
                >
                  <span>{day}</span>
                  <div className="flex gap-0.5 mt-0.5">
                    {isHoliday && (
                      <span className="h-1 w-1 rounded-full bg-red-600" />
                    )}
                    {isEvent && (
                      <span className="h-1 w-1 rounded-full bg-blue-600" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* डेट वाईज नोट्स / इभेन्ट फर्म सेक्सन */}
        <div className="p-2 bg-muted/20 rounded-xl space-y-2">
          <h3 className="text-xs font-bold text-primary uppercase">
            📅 Add Notes & Notification
          </h3>
          {selectedDay ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold text-amber-600">
                Selected: {selectedDay} {headerTitle}
              </p>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">
                  Title
                </label>
                <input
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="e.g. Saturday, Summer Vacation"
                  className="w-full border rounded-lg p-1.5 bg-background outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">
                  Description / Notes
                </label>
                <textarea
                  value={noteDescription}
                  onChange={(e) => setNoteDescription(e.target.value)}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full border rounded-lg p-1.5 bg-background outline-none text-xs resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-0.5">
                  Type
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full border rounded-lg p-1.5 bg-background text-xs"
                >
                  <option value="holiday">सार्वजनिक बिदा (Holiday)</option>
                  <option value="event">
                    विद्यालय कार्यक्रम (School Event)
                  </option>
                </select>
              </div>
              <button
                onClick={handleSaveNote}
                disabled={savingNote || !noteTitle.trim()}
                className="w-full bg-amber-500 text-slate-900 font-bold py-1.5 rounded-lg text-xs disabled:opacity-50"
              >
                {savingNote
                  ? "Saving Note..."
                  : "✓ Save & Broadcast Notification"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic pt-5 text-center">
              Click any date on the calendar to write logs or assign holidays.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85
      ? "text-green-600 bg-green-100 dark:bg-green-950/40 border-green-200 dark:border-green-800"
      : score >= 70
        ? "text-amber-600 bg-amber-100 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800"
        : "text-red-600 bg-red-100 dark:bg-red-950/40 border-red-200 dark:border-red-800";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}
    >
      {score}/100
    </span>
  );
}

function PhotoPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  async function handleFile(file: File) {
    if (file) onChange(await fileToDataUrl(file));
  }
  return (
    <div>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {value ? (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt="preview"
            className="h-12 w-12 rounded-full object-cover border border-border shrink-0"
          />
          <button
            onClick={() => onChange("")}
            className="text-xs text-red-500 hover:text-red-400"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => galleryRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors"
          >
            <Upload size={13} /> Upload Photo
          </button>
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted py-2.5 text-xs font-medium text-muted-foreground hover:border-amber-500 hover:text-[#FFF078] transition-colors"
          >
            <Camera size={13} /> Take Photo
          </button>
        </div>
      )}
    </div>
  );
}

type Modal = "add-passenger" | "add-driver" | null;
type StatsFilter = "boarded" | "live" | "leave" | "buses" | null;
type Tenant = {
  id: number;
  name: string;
  address?: string | null;
  contactPhone?: string | null;
  bannerUrl?: string | null;
  schoolCode?: string | null;
};
type LiveFleetVehicle = {
  id: number;
  plate: string;
  driver: string;
  lat: number | null;
  lng: number | null;
  status: "on-route" | "depot";
  isLive: boolean;
};
type Passenger = {
  id: number;
  name: string;
  phone?: string | null;
  role: string;
  status: string;
  liveToday: number;
  stationId: number;
  stationName?: string | null;
  quickMessage?: string | null;
  photoUrl?: string | null;
};

type DriverRow = {
  id: number;
  name: string;
  phone: string;
  vehicleNumber: string;
  isActive: boolean;
  isOnline: boolean;
  photoUrl?: string | null;
};

function DriverDetailPanel({
  driver,
  vehicles,
  routes,
  onClose,
  onRefresh,
}: {
  driver: DriverRow;
  vehicles: any[] | undefined;
  routes: any[] | undefined;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [localIsActive, setLocalIsActive] = useState(driver.isActive);
  const [err, setErr] = useState("");

  async function handleToggleActive() {
    setSaving(true);
    setErr("");
    const next = !localIsActive;
    try {
      await apiPatch(`/drivers/${driver.id}`, { isActive: next });
      setLocalIsActive(next);
      onRefresh();
    } catch {
      setErr("Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove driver ${driver.name}?`)) return;
    await apiDelete(`/drivers/${driver.id}`);
    queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
    onRefresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={
                driver.photoUrl ??
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(driver.name)}`
              }
              alt={driver.name}
              className="h-10 w-10 rounded-full border-2 border-amber-500 object-cover shrink-0"
            />
            <div>
              <h2 className="text-base font-bold text-foreground">
                {driver.name}
              </h2>
              <span className="text-[10px] font-semibold text-muted-foreground">
                {localIsActive ? "● Active" : "● Inactive"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {err && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl">
              {err}
            </p>
          )}
          <button
            onClick={handleToggleActive}
            className="w-full bg-amber-500 py-2 text-xs font-bold rounded-xl text-slate-900"
          >
            {localIsActive ? "Mark Inactive" : "Mark Active"}
          </button>
          <button
            onClick={handleDelete}
            className="w-full bg-red-500 py-2 text-xs font-bold rounded-xl text-white"
          >
            Remove Driver
          </button>
        </div>
      </div>
    </div>
  );
}

type PassengerRow = {
  id: number;
  name: string;
  phone?: string | null;
  photoUrl?: string | null;
  role: string;
  stationId: number;
  stationName?: string | null;
  routeId?: number | null;
};
type StationOption = { id: number; name: string };

function PassengerDetailPanel({
  passenger,
  stations,
  routes,
  onClose,
  onRefresh,
}: {
  passenger: PassengerRow;
  stations: StationOption[] | undefined;
  routes: any[] | undefined;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [editName, setEditName] = useState(passenger.name);
  const [editPhone, setEditPhone] = useState(passenger.phone ?? "");

  async function handleSave() {
    if (!editName.trim()) return;
    try {
      await apiPatch(`/passengers/${passenger.id}`, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        stationId: passenger.stationId,
        routeId: passenger.routeId,
      });
      onRefresh();
      onClose();
    } catch {
      alert("Failed to save");
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${passenger.name}?`)) return;
    await fetch(`${REPLIT_BACKEND}/api/passengers/${passenger.id}`, {
      method: "DELETE",
      headers:
        getTenantId() !== null ? { "x-tenant-id": String(getTenantId()) } : {},
    });
    onRefresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl flex flex-col p-5 space-y-3">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full border p-2 rounded-xl bg-muted"
        />
        <input
          value={editPhone}
          onChange={(e) => setEditPhone(e.target.value)}
          className="w-full border p-2 rounded-xl bg-muted"
        />
        <button
          onClick={handleSave}
          className="w-full bg-amber-500 py-2 rounded-xl text-slate-900 font-bold"
        >
          Save Changes
        </button>
        <button
          onClick={handleDelete}
          className="w-full bg-red-500 py-2 rounded-xl text-white font-bold"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

type RouteStation = {
  id: number;
  routeId: number;
  stationId: number;
  position: number;
  direction: string;
  stopLabel: string | null;
  eta: string | null;
  stationName: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
};
type RouteRow = {
  id: number;
  name: string;
  driverId: number | null;
  vehicleId: number | null;
  isActive: boolean | null;
  driverName: string | null;
  vehiclePlate: string | null;
  departureTime?: string | null;
  avgSpeedKmh?: number | null;
};
type VehicleRow = {
  id: number;
  plateNumber: string;
  model: string;
  capacity: number;
  isActive: boolean;
  tag?: string | null;
};

function RouteStationsPanel({
  routeId,
  route,
  vehicles,
  drivers,
  onClose,
  onRouteUpdated,
}: {
  routeId: number;
  route: RouteRow;
  vehicles: VehicleRow[] | undefined;
  drivers: Array<{ id: number; name: string }> | undefined;
  onClose: () => void;
  onRouteUpdated: () => void;
}) {
  const [editVehicle, setEditVehicle] = useState(String(route.vehicleId ?? ""));
  const [editDriver, setEditDriver] = useState(String(route.driverId ?? ""));
  const [depTime, setDepTime] = useState(route.departureTime ?? "06:00 AM");
  const [speedKmh, setSpeedKmh] = useState(String(route.avgSpeedKmh ?? 25));

  async function handleAssign() {
    try {
      await apiPatch(`/routes/${routeId}`, {
        vehicleId: editVehicle ? Number(editVehicle) : null,
        driverId: editDriver ? Number(editDriver) : null,
      });
      onRouteUpdated();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={depTime}
          onChange={(e) => setDepTime(e.target.value)}
          className="border p-2 text-xs rounded-lg"
        />
        <input
          type="number"
          value={speedKmh}
          onChange={(e) => setSpeedKmh(e.target.value)}
          className="border p-2 text-xs rounded-lg"
        />
      </div>
      <button
        onClick={handleAssign}
        className="w-full bg-green-600 py-1 rounded-lg text-xs font-bold text-white"
      >
        Save Assignment
      </button>
    </div>
  );
}

function VehicleTagGrid({
  vehicles,
  routes,
  onTagUpdated,
}: {
  vehicles: VehicleRow[] | undefined;
  routes: RouteRow[] | undefined;
  onTagUpdated: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [aPlate, setAPlate] = useState("");
  const [aModel, setAModel] = useState("");

  async function handleAddVehicle() {
    if (!aPlate.trim() || !aModel.trim()) return;
    try {
      await apiPost("/vehicles", {
        plateNumber: aPlate.trim(),
        model: aModel.trim(),
        capacity: 40,
      });
      setAPlate("");
      setAModel("");
      setAdding(false);
      onTagUpdated();
    } catch {
      alert("Failed");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-primary">Fleet Asset Grid</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="bg-amber-500 text-xs px-3 py-1 font-bold text-slate-900 rounded-xl"
        >
          + Add Vehicle
        </button>
      </div>
      {adding && (
        <div className="space-y-2 mt-3 p-3 bg-muted rounded-xl">
          <input
            value={aPlate}
            onChange={(e) => setAPlate(e.target.value)}
            placeholder="Plate Number (BA 1 KHA 1234)"
            className="w-full border p-2 text-xs rounded-lg"
          />
          <input
            value={aModel}
            onChange={(e) => setAModel(e.target.value)}
            placeholder="Model"
            className="w-full border p-2 text-xs rounded-lg"
          />
          <button
            onClick={handleAddVehicle}
            className="w-full bg-amber-500 text-xs py-2 font-bold rounded-xl text-slate-900"
          >
            Add Vehicle
          </button>
        </div>
      )}
    </div>
  );
}

function RouteManager({
  drivers,
  vehicles,
}: {
  drivers: Array<{ id: number; name: string }> | undefined;
  vehicles: VehicleRow[] | undefined;
}) {
  const queryClient = useQueryClient();
  const { data: routes, refetch } = useListRoutes();
  const [creating, setCreating] = useState(false);
  const [rName, setRName] = useState("");

  async function handleCreate() {
    if (!rName.trim()) return;
    try {
      await apiPost("/routes", { name: rName.trim() });
      setRName("");
      setCreating(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
    } catch {
      /* noop */
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm text-primary">Route Management</h2>
        <button
          onClick={() => setCreating(!creating)}
          className="bg-amber-500 text-xs px-3 py-1 font-bold rounded-xl text-slate-900"
        >
          New Route
        </button>
      </div>
      {creating && (
        <div className="space-y-2 mt-3">
          <input
            value={rName}
            onChange={(e) => setRName(e.target.value)}
            placeholder="Route Name"
            className="w-full border p-2 text-xs rounded-lg"
          />
          <button
            onClick={handleCreate}
            className="w-full bg-amber-500 text-xs py-2 font-bold rounded-xl text-slate-900"
          >
            Create
          </button>
        </div>
      )}
    </div>
  );
}

function SmartStationManager({
  stations,
  onChanged,
}: {
  stations: StationRow[] | undefined;
  onChanged: () => void;
}) {
  const [pendingName, setPendingName] = useState("");

  async function handleSave() {
    if (!pendingName.trim()) return;
    try {
      await apiPost("/stations", {
        name: pendingName.trim(),
        lat: 27.7172,
        lng: 85.324,
        radius: 100,
      });
      onChanged();
      setPendingName("");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-bold text-sm text-primary mb-3">Geofence Stations</h2>
      <div className="flex gap-2">
        <input
          value={pendingName}
          onChange={(e) => setPendingName(e.target.value)}
          placeholder="New Station Name"
          className="flex-1 border p-2 text-xs rounded-xl"
        />
        <button
          onClick={handleSave}
          className="bg-amber-500 text-xs px-4 py-2 font-bold rounded-xl text-slate-900"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function BoardingLogPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Live Boarding Log</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Real-time board/absent logs active from drivers.
      </p>
    </div>
  );
}
function DriverCommunicationsPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Communications Log</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Driver reports & messaging channel.
      </p>
    </div>
  );
}
function FleetFuelPanel() {
  return (
    <div className="p-4 bg-card border rounded-2xl">
      <h3 className="font-bold text-sm text-primary">Fuel Logs</h3>
    </div>
  );
}
function FleetMaintenancePanel() {
  return (
    <div className="p-4 bg-card border rounded-2xl">
      <h3 className="font-bold text-sm text-primary">Service Records</h3>
    </div>
  );
}
function FleetDocumentsPanel() {
  return (
    <div className="p-4 bg-card border rounded-2xl">
      <h3 className="font-bold text-sm text-primary">Statutory Documents</h3>
    </div>
  );
}

// ── 🚀 ह्वाट्सएप मेसेजिङ प्यानल (WhatsApp Alerts with Scrolling & Dropdown Log Hide) ──
function WhatsAppNotificationsPanel() {
  const [activeSubTab, setActiveSubTab] = useState<
    "students" | "staff" | "drivers" | "all"
  >("students");
  const [selectedClass, setSelectedClass] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    setHistory([
      {
        id: 1,
        type: "Delay",
        target: "Istuti Baral · Kanti Lokpath",
        status: "failed",
        time: "Jun 27, 09:59 PM",
      },
      {
        id: 2,
        type: "Delay",
        target: "Istuti Baral · Kanti Lokpath",
        status: "failed",
        time: "Jun 27, 09:56 PM",
      },
      {
        id: 3,
        type: "Notice",
        target: "Class 10 Parents",
        status: "success",
        time: "Jun 27, 08:55 PM",
      },
      {
        id: 4,
        type: "Emergency",
        target: "All Drivers",
        status: "success",
        time: "Jun 27, 08:48 PM",
      },
    ]);
  }, []);

  async function handleBroadcast() {
    if (!customMessage.trim()) return;
    setSending(true);
    try {
      await apiPost("/announcements", {
        message: `📢 WhatsApp [${activeSubTab}]: ${customMessage}`,
        severity: "info",
      });
      setHistory((prev) => [
        {
          id: Date.now(),
          type: "Broadcast",
          target:
            activeSubTab === "students"
              ? `Class ${selectedClass || "All"}`
              : activeSubTab,
          status: "success",
          time: "Just now",
        },
        ...prev,
      ]);
      setCustomMessage("");
      alert("WhatsApp broadcast request sent successfully!");
    } catch {
      alert("Failed to broadcast message.");
    } finally {
      setSending(false);
    }
  }

  const latestMessage = history[0];
  const olderMessages = history.slice(1);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircle size={15} className="text-green-500" />
          <h2 className="font-semibold text-primary text-sm">
            WhatsApp Alerts & Broadcaster
          </h2>
        </div>
      </div>

      <div className="flex border-b border-border bg-muted/40 p-1 gap-1 text-xs">
        <button
          onClick={() => setActiveSubTab("students")}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${activeSubTab === "students" ? "bg-amber-500 text-slate-900 font-bold" : "text-muted-foreground hover:text-foreground"}`}
        >
          Students/Parents
        </button>
        <button
          onClick={() => setActiveSubTab("staff")}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${activeSubTab === "staff" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}
        >
          Staff
        </button>
        <button
          onClick={() => setActiveSubTab("drivers")}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${activeSubTab === "drivers" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}
        >
          Drivers
        </button>
      </div>

      <div className="p-4 space-y-3">
        {activeSubTab === "students" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Filter by Class
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full border rounded-xl p-2 text-xs bg-background"
            >
              <option value="">All Classes</option>
              {[
                "Class 1",
                "Class 2",
                "Class 3",
                "Class 4",
                "Class 5",
                "Class 6",
                "Class 7",
                "Class 8",
                "Class 9",
                "Class 10",
                "Class 11",
                "Class 12",
              ].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Custom Message Box
          </label>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder={`Write WhatsApp text alert to ${activeSubTab}...`}
            rows={3}
            className="w-full border rounded-xl p-2.5 text-xs outline-none bg-muted/20 focus:border-amber-500 resize-none"
          />
        </div>

        <button
          onClick={handleBroadcast}
          disabled={sending || !customMessage.trim()}
          className="w-full bg-green-600 text-white font-bold text-xs py-2.5 rounded-xl hover:bg-green-500 transition-colors disabled:opacity-40"
        >
          {sending ? "Broadcasting..." : "🚀 Send WhatsApp Broadcast Alert"}
        </button>

        <div className="pt-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            Recent Broadcast Feed
          </p>
          {latestMessage && (
            <div className="flex items-center justify-between p-3 border rounded-xl bg-green-500/10 border-green-500/30 text-xs mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${latestMessage.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                >
                  {latestMessage.type}
                </span>
                <p className="truncate text-foreground font-semibold">
                  {latestMessage.target}
                </p>
              </div>
              <div className="text-right text-[10px] shrink-0 font-medium">
                <span
                  className={
                    latestMessage.status === "success"
                      ? "text-green-500"
                      : "text-red-400"
                  }
                >
                  {latestMessage.status}
                </span>
                <p className="text-[9px] text-muted-foreground">
                  {latestMessage.time}
                </p>
              </div>
            </div>
          )}

          {olderMessages.length > 0 && (
            <div className="space-y-1.5">
              <button
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="w-full flex items-center justify-between px-3 py-1.5 bg-muted/40 border border-border rounded-xl text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <span>
                  {isHistoryOpen
                    ? "🔼 Hide Older Logs"
                    : `🔽 View Older Logs (${olderMessages.length})`}
                </span>
                {isHistoryOpen ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
              </button>
              {isHistoryOpen && (
                <div className="border border-border rounded-xl divide-y max-h-36 overflow-y-auto bg-muted/10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
                  {olderMessages.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between p-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${h.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                        >
                          {h.type}
                        </span>
                        <p className="truncate text-muted-foreground">
                          {h.target}
                        </p>
                      </div>
                      <div className="text-right text-[10px] shrink-0 font-medium">
                        <span
                          className={
                            h.status === "success"
                              ? "text-green-500"
                              : "text-red-400"
                          }
                        >
                          {h.status}
                        </span>
                        <p className="text-[9px] text-muted-foreground">
                          {h.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared Fleet Summary Components ──
function FleetCostsSummaryCard() {
  const [fuelRows, setFuelRows] = useState<FuelLogRow[]>([]);
  const [maintRows, setMaintRows] = useState<MaintenanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [fuelRes, maintRes] = await Promise.all([
          fetch(`${REPLIT_BACKEND}/api/fuel-logs`, {
            headers: tenantHeaders(),
          }),
          fetch(`${REPLIT_BACKEND}/api/maintenance-records`, {
            headers: tenantHeaders(),
          }),
        ]);
        if (fuelRes.ok) setFuelRows(await fuelRes.json());
        if (maintRes.ok) setMaintRows(await maintRes.json());
      } catch {
        /* noop */
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const totalFuelThisMonth = fuelRows.reduce((sum, r) => sum + r.amountNpr, 0);
  const totalMaintThisMonth = maintRows.reduce((sum, r) => sum + r.costNpr, 0);

  if (loading)
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm p-6 text-center text-xs text-muted-foreground">
        Loading costs…
      </div>
    );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Fuel This Month
          </p>
          <p className="text-2xl font-bold text-amber-500 mt-1">
            Rs {totalFuelThisMonth.toLocaleString()}
          </p>
        </div>
        <Droplets size={24} className="text-amber-500/40" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Service This Month
          </p>
          <p className="text-2xl font-bold text-blue-500 mt-1">
            Rs {totalMaintThisMonth.toLocaleString()}
          </p>
        </div>
        <Wrench size={24} className="text-blue-500/40" />
      </div>
    </div>
  );
}

// ── 🛠️ Live Fleet Map Tracker (बिदाको दिन सम्पूर्ण जीपीएस ट्र्याकिङ फ्रिज / लक गर्ने कोड) ──
function LiveFleetMapPanel() {
  const liveLocations = useLiveLocations();
  const todayB = todayBs();
  const queryClient = useQueryClient();

  // ब्याकइन्ड क्यालेन्डरबाट आज बिदा (Holiday) छ कि छैन भनेर चेक गर्ने
  const queryMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const { data: currentMonthEvents } = useListCalendarEvents({
    month: queryMonth,
  });

  const isTodayHoliday = useMemo(() => {
    if (!currentMonthEvents) return false;
    return currentMonthEvents.some((ev: any) => {
      const parts = ev.eventDate.split("-").map(Number);
      const bs = adToBs(parts[0], parts[1], parts[2]);
      return (
        bs.year === todayB.year &&
        bs.month === todayB.month &&
        bs.day === todayB.day &&
        ev.type === "holiday"
      );
    });
  }, [currentMonthEvents, todayB]);

  const buses: FleetBus[] = useMemo(() => {
    // 🛑 यदि आज स्कूल बिदा छ भने नक्सा र जीपीएस ट्र्याकिङमा कुनै पनि गाडी देखाउँदैन (Freeze)
    if (isTodayHoliday) return [];
    return liveLocations
      .filter((loc) => loc.isLive && loc.lat !== null && loc.lng !== null)
      .map((loc) => ({
        id: loc.id,
        label: loc.vehicleNumber,
        driverName: loc.name,
        lat: loc.lat!,
        lng: loc.lng!,
        status: "on-route",
      }));
  }, [liveLocations, isTodayHoliday]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MapPin size={15} className="text-amber-500" />
        <h2 className="font-semibold text-primary text-sm">
          Live Fleet Map Tracker
        </h2>
      </div>

      {isTodayHoliday ? (
        <div className="p-6 bg-red-500/5 text-center space-y-2">
          <AlertCircle
            size={28}
            className="text-red-500 mx-auto animate-pulse"
          />
          <p className="text-sm font-bold text-red-600 dark:text-red-400">
            🏫 आज विद्यालय सार्वजनिक/साप्ताहिक बिदा रहेको छ।
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            बिदाको दिनमा सुरक्षा र आन्तरिक गोपनियताका कारण विद्यार्थी/अभिभावक
            प्यानलमा बसको लाइभ जीपीएस स्थान र ट्र्याकिङ रोक्का (Freeze) गरिएको
            छ।
          </p>
        </div>
      ) : buses.length === 0 ? (
        <p className="text-xs text-muted-foreground p-6 text-center italic">
          No active buses online right now.
        </p>
      ) : (
        <OsmMap mode="fleet" buses={buses} height={260} />
      )}
    </div>
  );
}

export default function AdminPortal() {
  const { user } = useAuth();
  const liveLocations = useLiveLocations();
  const { data: stations } = useListStations();
  const { data: passengers, refetch: refetchPassengers } = useListPassengers();
  const { data: drivers, refetch: refetchDrivers } = useListDrivers();
  const { data: vehicles } = useListVehicles();
  const { data: adminRoutes } = useListRoutes();
  const queryClient = useQueryClient();

  const [adminTab, setAdminTab] = useState<
    "dashboard" | "fleet-fuel" | "fleet-maintenance" | "fleet-documents"
  >("dashboard");
  const [tenant, setTenant] = useState<Tenant | null>(user?.tenant ?? null);

  const tenantId = user?.tenantId ?? 1;

  useEffect(() => {
    if (!tenant) {
      fetch(`${REPLIT_BACKEND}/api/tenants/${tenantId}`)
        .then((r) => r.json())
        .then((data: Tenant) => setTenant(data))
        .catch(() => {});
    }
  }, [tenantId, tenant]);

  function refetchAll() {
    queryClient.invalidateQueries({ queryKey: getListPassengersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
  }

  return (
    <div className="mx-auto w-full max-w-[860px] p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
          <p className="text-xs text-muted-foreground">{tenant?.name}</p>
        </div>
      </header>

      <nav className="rounded-xl border border-border bg-card shadow-sm flex overflow-x-auto p-1 gap-2 text-xs font-semibold">
        {(
          [
            "dashboard",
            "fleet-fuel",
            "fleet-maintenance",
            "fleet-documents",
          ] as const
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setAdminTab(tab)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap ${adminTab === tab ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}
          >
            {tab === "dashboard"
              ? "Dashboard"
              : tab === "fleet-fuel"
                ? "Fuel Logs"
                : tab === "fleet-maintenance"
                  ? "Service"
                  : "Documents"}
          </button>
        ))}
      </nav>

      {adminTab === "dashboard" && (
        <>
          <FleetCostsSummaryCard />
          <LiveFleetMapPanel />
          <BoardingLogPanel
            passengers={passengers as Passenger[] | undefined}
            stations={stations as StationOption[] | undefined}
            routes={adminRoutes as RouteRow[] | undefined}
            onRefresh={refetchAll}
          />
          <WhatsAppNotificationsPanel />
          <DriverCommunicationsPanel
            drivers={drivers as DriverRow[] | undefined}
            vehicles={vehicles as any[] | undefined}
            routes={adminRoutes as RouteRow[] | undefined}
            onRefresh={refetchAll}
          />
          <SmartStationManager
            stations={stations as StationRow[] | undefined}
            onChanged={() =>
              queryClient.invalidateQueries({
                queryKey: getListStationsQueryKey(),
              })
            }
          />
          <VehicleTagGrid
            vehicles={vehicles as any[] | undefined}
            routes={adminRoutes as RouteRow[] | undefined}
            onTagUpdated={() =>
              queryClient.invalidateQueries({
                queryKey: getListVehiclesQueryKey(),
              })
            }
          />
          <RouteManager
            drivers={drivers}
            vehicles={vehicles as any[] | undefined}
          />
          <CalendarManager />
        </>
      )}

      {adminTab === "fleet-fuel" && (
        <FleetFuelPanel vehicles={vehicles as any[] | undefined} />
      )}
      {adminTab === "fleet-maintenance" && (
        <FleetMaintenancePanel vehicles={vehicles as any[] | undefined} />
      )}
      {adminTab === "fleet-documents" && (
        <FleetDocumentsPanel vehicles={vehicles as any[] | undefined} />
      )}
    </div>
  );
}
