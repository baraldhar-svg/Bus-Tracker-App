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

// ── 🛠️ 'type' कीवर्ड हटाएर सिन्ट्याक्स फिक्स गरिएको ──
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

function tenantHeaders(): Record<string, string> {
  const id = getTenantId();
  return id !== null
    ? { "Content-Type": "application/json", "x-tenant-id": String(id) }
    : { "Content-Type": "application/json" };
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: tenantHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiPatch(path: string, body: unknown) {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: tenantHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

async function apiPut(path: string, body: unknown) {
  const res = await fetch(`/api${path}`, {
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
  await fetch(`/api${path}`, { method: "DELETE", headers });
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
  const [bsYear, setBsYear] = useState(todayB.year);
  const [bsMonth, setBsMonth] = useState(todayB.month);
  const [adYear, setAdYear] = useState(todayAd.getFullYear());
  const [adMonth, setAdMonth] = useState(todayAd.getMonth() + 1);

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

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
            <h2 className="font-semibold text-primary">विद्यालय क्यालेन्डर</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              School Calendar · Events & Holidays
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
        <button
          onClick={nextMonth}
          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 px-5 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800">
        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
          Today
        </span>
        <span className="text-xs font-bold text-foreground">
          {BS_MONTH_NAMES_NE[todayB.month - 1]} {todayB.day}, {todayB.year} BS
        </span>
        <span className="text-[10px] text-muted-foreground">·</span>
        <span className="text-xs font-bold text-foreground">
          {AD_MONTH_NAMES[todayAd.getMonth()]} {todayAd.getDate()},{" "}
          {todayAd.getFullYear()} AD
        </span>
      </div>

      <div className="p-4">
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
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`relative flex flex-col items-center rounded-xl py-1.5 transition-all text-xs ${isToday ? "bg-amber-400 dark:bg-amber-500 text-white font-extrabold ring-2 ring-amber-500" : "hover:bg-muted text-foreground font-medium"}`}
              >
                <span className={isToday ? "text-sm" : ""}>{day}</span>
              </button>
            );
          })}
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

function PassengerDetailCard({
  p,
  onClose,
}: {
  p: Passenger;
  onClose: () => void;
}) {
  const initials = p.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden">
        <div className="relative bg-gradient-to-br from-amber-400/20 to-amber-600/10 px-6 pt-8 pb-6 flex flex-col items-center gap-3 border-b border-border">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm"
          >
            ✕
          </button>
          {p.photoUrl ? (
            <img
              src={p.photoUrl}
              alt={p.name}
              className="h-20 w-20 rounded-full object-cover border-4 border-background shadow-2xl"
            />
          ) : (
            <div className="h-20 w-20 rounded-full border-4 border-background shadow-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {initials}
              </span>
            </div>
          )}
          <div className="text-center">
            <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
            <span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-xs text-muted-foreground capitalize">
              {p.role}
            </span>
          </div>
        </div>
        <div className="divide-y divide-border">
          {p.phone && (
            <div className="flex items-center gap-3 px-5 py-3">
              <Phone size={14} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{p.phone}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 px-5 py-3">
            <MapPin size={14} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {p.stationName ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsDetailPanel({
  filter,
  passengers,
  fleetVehicles,
  onRouteCount,
  onClose,
}: {
  filter: StatsFilter;
  passengers: Passenger[];
  fleetVehicles: LiveFleetVehicle[];
  onRouteCount: number;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Passenger | null>(null);
  const filtered = (() => {
    if (filter === "boarded")
      return passengers.filter((p) => p.status === "boarded");
    if (filter === "live") return passengers.filter((p) => p.liveToday === 1);
    if (filter === "leave")
      return passengers.filter((p) => p.quickMessage === "Staying home today");
    return [];
  })();
  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl min-h-[50vh] max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <h2 className="text-base font-bold text-primary">{filter}</h2>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground text-sm"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <PassengerAvatar name={p.name} photoUrl={p.photoUrl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {p.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
      {selected && (
        <PassengerDetailCard p={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

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
  vehicles: VehicleRow[] | undefined;
  routes: RouteRow[] | undefined;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(driver.name);
  const [editPhone, setEditPhone] = useState(driver.phone);
  const [localIsActive, setLocalIsActive] = useState(driver.isActive);
  const [err, setErr] = useState("");

  async function handleSaveInfo() {
    setSaving(true);
    setErr("");
    try {
      await apiPatch(`/drivers/${driver.id}`, {
        name: editName.trim(),
        phone: editPhone.trim(),
      });
      onRefresh();
      setEditingName(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

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
type StationRow = StationOption;

function PassengerDetailPanel({
  passenger,
  stations,
  routes,
  onClose,
  onRefresh,
}: {
  passenger: PassengerRow;
  stations: StationOption[] | undefined;
  routes: RouteRow[] | undefined;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [editName, setEditName] = useState(passenger.name);
  const [editPhone, setEditPhone] = useState(passenger.phone ?? "");
  const [editStationId, setEditStationId] = useState(
    String(passenger.stationId),
  );
  const [editRouteId, setEditRouteId] = useState(
    String(passenger.routeId ?? ""),
  );

  type EditRouteStation = {
    id: number;
    stationId: number;
    stationName: string | null;
    stopLabel: string | null;
  };
  const [editRouteStations, setEditRouteStations] = useState<
    EditRouteStation[]
  >([]);
  useEffect(() => {
    if (!editRouteId) {
      setEditRouteStations([]);
      return;
    }
    fetch(`/api/routes/${editRouteId}/stations`, {
      headers: tenantHeaders(),
    })
      .then((r) => r.json())
      .then((data: unknown) => {
        const list = Array.isArray(data) ? (data as EditRouteStation[]) : [];
        setEditRouteStations(list);
        const stillValid = list.some(
          (rs) => String(rs.stationId) === editStationId,
        );
        if (!stillValid && list.length > 0)
          setEditStationId(String(list[0].stationId));
      })
      .catch(() => setEditRouteStations([]));
  }, [editRouteId]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    setErr("");
    try {
      await apiPatch(`/passengers/${passenger.id}`, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        stationId: Number(editStationId),
        routeId: editRouteId ? Number(editRouteId) : null,
      });
      onRefresh();
      onClose();
    } catch {
      setErr("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${passenger.name}?`)) return;
    await fetch(`/api/passengers/${passenger.id}`, {
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

function BusDetailPanel({
  vehicle,
  onClose,
}: {
  vehicle: LiveFleetVehicle;
  onClose: () => void;
}) {
  const bboxLng = 0.012;
  const bboxLat = 0.008;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-foreground">
          {vehicle.plate} ({vehicle.driver})
        </h2>
        {vehicle.lat !== null && vehicle.lng !== null ? (
          <iframe
            title="map"
            width="100%"
            height="180"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${vehicle.lng - bboxLng},${vehicle.lat - bboxLat},${vehicle.lng + bboxLng},${vehicle.lat + bboxLat}&layer=mapnik&marker=${vehicle.lat},${vehicle.lng}`}
          />
        ) : (
          <p className="text-xs italic text-muted-foreground">No GPS signal</p>
        )}
      </div>
    </div>
  );
}

type GeocodeResult = { displayName: string; lat: number; lng: number };
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
  const [mapClickPending, setMapClickPending] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
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
    setRouteStations([]);
    setLoading(true);
    try {
      const r = await fetch(`/api/routes/${routeId}/stations`);
      setRouteStations(await r.json());
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    } catch {
      /* ignore */
    } finally {
      setAssignSaving(false);
    }
  }

  async function handleSaveEta() {
    setEtaSaving(true);
    setEtaSaved(false);
    try {
      await apiPatch(`/routes/${routeId}`, {
        departureTime: depTime,
        avgSpeedKmh: Number(speedKmh) || 25,
      });
      onRouteUpdated();
      await load();
      setEtaSaved(true);
    } catch {
      /* ignore */
    } finally {
      setEtaSaving(false);
    }
  }

  async function handleAdd() {
    if (!addingId) return;
    setAddingErr("");
    const station = (stations ?? []).find((s) => s.id === Number(addingId));
    const autoLabel =
      addingLabel.trim() ||
      (station
        ? `${station.name} (${addingDir === "forward" ? "Forward" : "Return"})`
        : "");
    try {
      await apiPost(`/routes/${routeId}/stations`, {
        stationId: Number(addingId),
        direction: addingDir,
        stopLabel: autoLabel,
      });
      setAddingId("");
      setAddingLabel("");
      void load();
    } catch {
      setAddingErr("Failed");
    }
  }

  async function handleRemove(rowId: number) {
    await apiDelete(`/routes/${routeId}/stations/${rowId}`);
    void load();
    queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
  }

  async function handleAddFromMap() {
    if (!mapClickPending) return;
    const name = pendingMapName.trim() || mapClickPending.name;
    setPendingMapSaving(true);
    try {
      const created = (await apiPost("/stations", {
        name,
        lat: mapClickPending.lat,
        lng: mapClickPending.lng,
        radius: pendingMapRadius,
      })) as { id: number };
      await apiPost(`/routes/${routeId}/stations`, {
        stationId: created.id,
        direction: "forward",
        stopLabel: name,
      });
      setMapClickPending(null);
      setPendingMapName("");
      setPendingMapRadius(100);
      await load();
      queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
    } catch {
      /* noop */
    } finally {
      setPendingMapSaving(false);
    }
  }

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Stops ({routeStations.length})</p>
        <button onClick={onClose}>
          <X size={14} />
        </button>
      </div>
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
        onClick={handleSaveEta}
        className="w-full bg-amber-500 py-1 rounded-lg text-xs font-bold text-slate-900"
      >
        Save ETAs
      </button>
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
  const [aCapacity, setACapacity] = useState("40");
  const [aTag, setATag] = useState("");
  const [aErr, setAErr] = useState("");
  const [aSaving, setASaving] = useState(false);

  async function handleAddVehicle() {
    if (!aPlate.trim() || !aModel.trim()) return;
    setAErr("");
    setASaving(true);
    try {
      await apiPost("/vehicles", {
        plateNumber: aPlate.trim(),
        model: aModel.trim(),
        capacity: Number(aCapacity) || 40,
        tag: aTag.trim() || null,
      });
      setAPlate("");
      setAModel("");
      setACapacity("40");
      setATag("");
      setAdding(false);
      onTagUpdated();
    } catch (e: unknown) {
      setAErr(e instanceof Error ? e.message : "Failed to add vehicle");
    } finally {
      setASaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bus size={15} className="text-amber-500" />
          <h2 className="font-bold text-sm text-primary">Fleet Asset Grid</h2>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="bg-amber-500 text-xs px-3 py-1 font-bold text-slate-900 rounded-xl"
        >
          {adding ? "Cancel" : "+ Add Vehicle"}
        </button>
      </div>
      {adding && (
        <div className="space-y-2 p-4 border-b border-border bg-muted/30">
          {aErr && <p className="text-xs text-red-500">{aErr}</p>}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={aPlate}
              onChange={(e) => setAPlate(e.target.value)}
              placeholder="Plate Number"
              className="border p-2 text-xs rounded-lg"
            />
            <input
              value={aModel}
              onChange={(e) => setAModel(e.target.value)}
              placeholder="Model"
              className="border p-2 text-xs rounded-lg"
            />
            <input
              type="number"
              value={aCapacity}
              onChange={(e) => setACapacity(e.target.value)}
              placeholder="Capacity"
              className="border p-2 text-xs rounded-lg"
            />
            <input
              value={aTag}
              onChange={(e) => setATag(e.target.value)}
              placeholder="Tag (optional)"
              className="border p-2 text-xs rounded-lg"
            />
          </div>
          <button
            onClick={handleAddVehicle}
            disabled={aSaving}
            className="w-full bg-amber-500 text-xs py-2 font-bold rounded-xl text-slate-900 disabled:opacity-50"
          >
            {aSaving ? "Saving…" : "Add Vehicle"}
          </button>
        </div>
      )}
      {(vehicles ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">No vehicles yet. Add the first one above.</p>
      ) : (
        <div className="divide-y divide-border">
          {(vehicles ?? []).map((v) => (
            <VehicleRowItem key={v.id} vehicle={v} onUpdated={onTagUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleRowItem({ vehicle, onUpdated }: { vehicle: VehicleRow; onUpdated: () => void }) {
  const [editingTag, setEditingTag] = useState(false);
  const [tag, setTag] = useState(vehicle.tag ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSaveTag() {
    setSaving(true);
    try {
      await apiPatch(`/vehicles/${vehicle.id}`, { tag: tag.trim() || null });
      onUpdated();
      setEditingTag(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
        <Bus size={16} className="text-amber-600 dark:text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{vehicle.plateNumber}</p>
        <p className="text-xs text-muted-foreground">{vehicle.model} · {vehicle.capacity} seats</p>
      </div>
      {editingTag ? (
        <div className="flex items-center gap-1 shrink-0">
          <input
            autoFocus
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Tag"
            className="border rounded-lg px-2 py-1 text-xs w-24"
          />
          <button onClick={handleSaveTag} disabled={saving} className="text-[10px] bg-amber-500 text-slate-900 font-bold px-2 py-1 rounded-lg">✓</button>
          <button onClick={() => { setEditingTag(false); setTag(vehicle.tag ?? ""); }} className="text-[10px] text-muted-foreground px-1">✕</button>
        </div>
      ) : (
        <button
          onClick={() => setEditingTag(true)}
          className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:border-amber-400 hover:text-amber-500 transition-colors"
        >
          <Pencil size={10} />
          {vehicle.tag ? vehicle.tag : "Tag"}
        </button>
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
  const [saving, setSaving] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState<number | null>(null);

  async function handleCreate() {
    if (!rName.trim()) return;
    setSaving(true);
    try {
      await apiPost("/routes", { name: rName.trim() });
      setRName("");
      setCreating(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  }

  const routeList = (routes ?? []) as RouteRow[];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Route size={15} className="text-amber-500" />
          <h2 className="font-bold text-sm text-primary">Route Management</h2>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          className="bg-amber-500 text-xs px-3 py-1 font-bold rounded-xl text-slate-900"
        >
          {creating ? "Cancel" : "New Route"}
        </button>
      </div>

      {creating && (
        <div className="p-4 border-b border-border bg-muted/30 space-y-2">
          <input
            value={rName}
            onChange={(e) => setRName(e.target.value)}
            placeholder="Route Name (e.g. Route #1 — Koteshwor)"
            className="w-full border p-2 text-xs rounded-lg"
          />
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full bg-amber-500 text-xs py-2 font-bold rounded-xl text-slate-900 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Route"}
          </button>
        </div>
      )}

      {routeList.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">No routes yet. Create the first one above.</p>
      ) : (
        <div className="divide-y divide-border">
          {routeList.map((route) => {
            const isOpen = expandedRouteId === route.id;
            return (
              <div key={route.id}>
                <button
                  onClick={() => setExpandedRouteId(isOpen ? null : route.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
                    <Route size={14} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{route.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {route.driverName ?? "No driver"} · {route.vehiclePlate ?? "No vehicle"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {route.isActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    )}
                    {isOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3">
                    <RouteStationsPanel
                      routeId={route.id}
                      route={route}
                      vehicles={vehicles}
                      drivers={drivers}
                      onClose={() => setExpandedRouteId(null)}
                      onRouteUpdated={() => {
                        refetch();
                        queryClient.invalidateQueries({ queryKey: getListRoutesQueryKey() });
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
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
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!pendingName.trim()) return;
    setSaving(true);
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
    } finally {
      setSaving(false);
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

// ── BoardingLogPanel ───────────────────────────────────────────────────────────
function BoardingLogPanel({
  passengers,
  stations,
  routes,
  onRefresh,
}: {
  passengers: Passenger[] | undefined;
  stations: StationOption[] | undefined;
  routes: RouteRow[] | undefined;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<PassengerRow | null>(null);
  const list = passengers ?? [];
  const boarded = list.filter((p) => p.status === "boarded");
  const pending = list.filter((p) => p.status === "pending");
  const onLeave = list.filter((p) => p.status === "leave" || p.quickMessage === "Staying home today");

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-amber-500" />
          <h2 className="font-semibold text-primary text-sm">Live Boarding Log</h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold">
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            ✓ {boarded.length} boarded
          </span>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            {pending.length} pending
          </span>
          {onLeave.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
              {onLeave.length} leave
            </span>
          )}
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">No passengers registered yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {[
            { label: "Boarded", items: boarded, style: "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300" },
            { label: "Pending", items: pending, style: "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300" },
            { label: "On Leave", items: onLeave, style: "bg-gray-50 dark:bg-gray-800/20 text-gray-600 dark:text-gray-400" },
          ].filter(({ items }) => items.length > 0).map(({ label, items, style }) => (
            <div key={label}>
              <div className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide ${style}`}>
                {label} — {items.length}
              </div>
              <div className="divide-y divide-border">
                {items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected({
                      id: p.id,
                      name: p.name,
                      phone: p.phone,
                      photoUrl: p.photoUrl,
                      role: p.role,
                      stationId: p.stationId,
                      stationName: p.stationName,
                      routeId: null,
                    })}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <PassengerAvatar name={p.name} photoUrl={p.photoUrl} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.stationName ?? "—"}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[p.status] ?? STATUS_STYLES["pending"]}`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <PassengerDetailPanel
          passenger={selected}
          stations={stations}
          routes={routes}
          onClose={() => setSelected(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

// ── WhatsApp Notifications Panel ──────────────────────────────────────────────
type WaNotification = {
  id: number;
  type: string;
  recipientName: string;
  to: string;
  passengerName: string | null;
  stationName: string | null;
  messageBody: string;
  status: string;
  errorDetail: string | null;
  sentAt: string | Date;
};

function WhatsAppNotificationsPanel() {
  const [rows, setRows] = useState<WaNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [delayMin, setDelayMin] = useState("10");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/whatsapp/notifications`, { headers: tenantHeaders() });
      if (r.ok) setRows(await r.json() as WaNotification[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSendDelay() {
    const mins = Number(delayMin);
    if (!mins || mins < 1) return;
    setSending(true);
    setSendResult(null);
    try {
      const r = await fetch(`/api/trips/delay`, {
        method: "POST",
        headers: tenantHeaders(),
        body: JSON.stringify({ delayMinutes: mins }),
      });
      const data = await r.json() as { message?: string; error?: string };
      setSendResult(data.message ?? data.error ?? "Done");
      void load();
    } catch {
      setSendResult("Failed to send delay alert");
    } finally {
      setSending(false);
    }
  }

  function formatTime(ts: string | Date) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircle size={15} className="text-green-500" />
          <h2 className="font-semibold text-primary text-sm">WhatsApp Alerts</h2>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Delay alert trigger */}
      <div className="px-4 py-3 border-b border-border bg-amber-50 dark:bg-amber-950/20 flex items-center gap-2 flex-wrap">
        <Bell size={13} className="text-amber-600 shrink-0" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Send delay alert to all parents:</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <input
            type="number"
            min={1}
            max={120}
            value={delayMin}
            onChange={(e) => setDelayMin(e.target.value)}
            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-xs text-center"
          />
          <span className="text-xs text-muted-foreground">min late</span>
          <button
            onClick={() => void handleSendDelay()}
            disabled={sending}
            className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-60 transition-colors"
          >
            <Send size={11} />
            {sending ? "Sending…" : "Notify"}
          </button>
        </div>
        {sendResult && (
          <p className="w-full text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">{sendResult}</p>
        )}
      </div>

      {/* Notifications log */}
      {loading ? (
        <p className="text-xs text-muted-foreground p-4 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">No WhatsApp alerts sent yet. They appear here when a student is marked absent or a delay is broadcast.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {rows.map((row) => (
            <button
              key={row.id}
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              className="w-full text-left px-4 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  row.type === "absent"
                    ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                    : "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                }`}>
                  {row.type === "absent" ? "Absent" : "Delay"}
                </span>
                <span className="flex-1 text-sm font-medium text-foreground truncate">
                  {row.passengerName ?? row.recipientName}
                  {row.stationName ? <span className="text-muted-foreground font-normal"> · {row.stationName}</span> : null}
                </span>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                  row.status === "sent"
                    ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                }`}>
                  {row.status}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(row.sentAt)}</span>
              </div>
              {expanded === row.id && (
                <div className="mt-1.5 pl-1 border-l-2 border-muted space-y-1">
                  {row.status === "failed" && row.errorDetail && (
                    <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                      {row.errorDetail === "token_not_configured"
                        ? "⚠ WhatsApp token not configured — alert was not delivered. Set WHATSAPP_ACCESS_TOKEN in environment secrets."
                        : row.errorDetail}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                    {row.messageBody}
                  </p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DriverCommunicationsPanel ─────────────────────────────────────────────────
function AddDriverModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !phone.trim() || !vehicleNumber.trim()) {
      setErr("All fields are required.");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/drivers", {
        name: name.trim(),
        phone: phone.trim(),
        vehicleNumber: vehicleNumber.trim(),
      });
      onCreated();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to add driver");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="font-bold text-base text-foreground flex items-center gap-2">
            <Bus size={16} className="text-amber-500" /> Add New Driver
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Full Name *</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="e.g. Ram Bahadur Thapa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Phone Number *</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="e.g. 9851012345"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
              type="tel"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Vehicle Number *</label>
            <input
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="e.g. BA 1 KHA 1234"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              disabled={saving}
            />
          </div>
          {err && <p className="text-xs text-red-500 font-medium">{err}</p>}
          <div className="flex gap-2 pt-1 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Adding…" : "Add Driver"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DriverCommunicationsPanel({
  drivers,
  vehicles,
  routes,
  onRefresh,
}: {
  drivers: DriverRow[] | undefined;
  vehicles: VehicleRow[] | undefined;
  routes: RouteRow[] | undefined;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<DriverRow | null>(null);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const liveLocations = useLiveLocations();
  const list = drivers ?? [];

  // Build a map of driverId → last ping timestamp from the live-location poll
  const lastPingMap = new Map<number, string | null>(
    liveLocations.map((loc) => [loc.id, loc.updatedAt])
  );

  function formatLastPing(ts: string | null | undefined): string {
    if (!ts) return "Never";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bus size={15} className="text-amber-500" />
          <h2 className="font-semibold text-primary text-sm">Driver Status</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
            {list.filter((d) => d.isOnline).length} online
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
            {list.filter((d) => d.isActive && !d.isOnline).length} offline
          </span>
          <button
            onClick={() => setShowAddDriver(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition-colors"
          >
            <Plus size={12} /> Add Driver
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">No drivers registered yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {list.map((d) => {
            const lastPing = lastPingMap.get(d.id);
            return (
              <button
                key={d.id}
                onClick={() => setSelected(d)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
              >
                <img
                  src={d.photoUrl ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(d.name)}`}
                  alt={d.name}
                  className="h-9 w-9 rounded-full border-2 border-border object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.vehicleNumber}
                    {lastPingMap.has(d.id) && (
                      <span className="ml-2 text-[10px] text-muted-foreground/60">
                        · ping {formatLastPing(lastPing)}
                      </span>
                    )}
                  </p>
                </div>
                <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  d.isOnline
                    ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                    : d.isActive
                      ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                      : "bg-gray-100 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${d.isOnline ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                  {d.isOnline ? "Online" : d.isActive ? "Active" : "Inactive"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <DriverDetailPanel
          driver={selected}
          vehicles={vehicles}
          routes={routes}
          onClose={() => setSelected(null)}
          onRefresh={onRefresh}
        />
      )}
      {showAddDriver && (
        <AddDriverModal
          onClose={() => setShowAddDriver(false)}
          onCreated={onRefresh}
        />
      )}
    </div>
  );
}

// ── Shared fleet types ─────────────────────────────────────────────────────────
type FuelLogRow = {
  id: number;
  vehicleId: number | null;
  vehiclePlate: string | null;
  date: string;
  liters: number;
  amountNpr: number;
  odometerKm: number;
  notes: string | null;
};

type MaintenanceRow = {
  id: number;
  vehicleId: number | null;
  vehiclePlate: string | null;
  partType: string;
  description: string | null;
  costNpr: number;
  odometerKm: number;
  serviceDate: string;
  vendor: string | null;
};

type BudgetSettings = { fuelBudgetNpr: number; maintBudgetNpr: number };

// ── FleetCostsSummaryCard ──────────────────────────────────────────────────────
function FleetCostsSummaryCard() {
  const [fuelRows, setFuelRows] = useState<FuelLogRow[]>([]);
  const [maintRows, setMaintRows] = useState<MaintenanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<BudgetSettings>({ fuelBudgetNpr: 0, maintBudgetNpr: 0 });
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ fuel: "", maint: "" });
  const [savingBudget, setSavingBudget] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [fuelRes, maintRes, budgetRes] = await Promise.all([
          fetch(`/api/fuel-logs`, { headers: tenantHeaders() }),
          fetch(`/api/maintenance-records`, { headers: tenantHeaders() }),
          fetch(`/api/budget-settings`, { headers: tenantHeaders() }),
        ]);
        setFuelRows(await fuelRes.json() as FuelLogRow[]);
        setMaintRows(await maintRes.json() as MaintenanceRow[]);
        const b = await budgetRes.json() as BudgetSettings;
        setBudget(b);
        setBudgetForm({ fuel: b.fuelBudgetNpr > 0 ? String(b.fuelBudgetNpr) : "", maint: b.maintBudgetNpr > 0 ? String(b.maintBudgetNpr) : "" });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const totalFuelThisMonth = fuelRows
    .filter((r) => r.date.slice(0, 7) === thisMonth)
    .reduce((sum, r) => sum + r.amountNpr, 0);

  const totalMaintThisMonth = maintRows
    .filter((r) => r.serviceDate.slice(0, 7) === thisMonth)
    .reduce((sum, r) => sum + r.costNpr, 0);

  const fuelOverBudget = budget.fuelBudgetNpr > 0 && totalFuelThisMonth > budget.fuelBudgetNpr;
  const maintOverBudget = budget.maintBudgetNpr > 0 && totalMaintThisMonth > budget.maintBudgetNpr;

  const vehicleStats = useMemo(() => {
    const map = new Map<string, { plate: string; totalSpend: number; minOdo: number; maxOdo: number }>();
    for (const r of fuelRows) {
      const key = r.vehiclePlate ?? "Unknown";
      const existing = map.get(key) ?? { plate: key, totalSpend: 0, minOdo: Infinity, maxOdo: -Infinity };
      existing.totalSpend += r.amountNpr;
      if (r.odometerKm < existing.minOdo) existing.minOdo = r.odometerKm;
      if (r.odometerKm > existing.maxOdo) existing.maxOdo = r.odometerKm;
      map.set(key, existing);
    }
    return Array.from(map.values()).map((v) => {
      const kmRange = v.maxOdo !== -Infinity && v.minOdo !== Infinity && v.maxOdo > v.minOdo
        ? v.maxOdo - v.minOdo
        : null;
      return {
        plate: v.plate,
        costPerKm: kmRange ? Math.round(v.totalSpend / kmRange) : null,
      };
    }).filter((v) => v.costPerKm !== null);
  }, [fuelRows]);

  async function saveBudget() {
    const fuel = parseFloat(budgetForm.fuel) || 0;
    const maint = parseFloat(budgetForm.maint) || 0;
    setSavingBudget(true);
    try {
      const res = await fetch(`/api/budget-settings`, {
        method: "PUT",
        headers: tenantHeaders(),
        body: JSON.stringify({ fuelBudgetNpr: fuel, maintBudgetNpr: maint }),
      });
      if (res.ok) {
        const updated = await res.json() as BudgetSettings;
        setBudget(updated);
        setEditingBudget(false);
      }
    } finally {
      setSavingBudget(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm p-6 text-center text-xs text-muted-foreground">
        Loading fleet costs…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-amber-500" />
          <h3 className="font-bold text-sm text-primary">Fleet Costs — This Month</h3>
        </div>
        <button
          onClick={() => setEditingBudget((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          title="Set monthly budgets"
        >
          <Settings2 size={13} />
          <span>Set Budgets</span>
        </button>
      </div>

      {(fuelOverBudget || maintOverBudget) && (
        <div className="flex items-start gap-2 mx-4 mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span className="font-medium">
            Cost overrun:{" "}
            {[
              fuelOverBudget && `fuel spend exceeds Rs ${budget.fuelBudgetNpr.toLocaleString()} budget`,
              maintOverBudget && `maintenance spend exceeds Rs ${budget.maintBudgetNpr.toLocaleString()} budget`,
            ].filter(Boolean).join(" and ")}
            .
          </span>
        </div>
      )}

      {editingBudget && (
        <div className="mx-4 mt-3 p-3 rounded-xl border border-border bg-muted/40">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Monthly Budget Limits (Rs)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Fuel Budget</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 50000"
                value={budgetForm.fuel}
                onChange={(e) => setBudgetForm((f) => ({ ...f, fuel: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-0.5 block">Maintenance Budget</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 30000"
                value={budgetForm.maint}
                onChange={(e) => setBudgetForm((f) => ({ ...f, maint: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => void saveBudget()}
              disabled={savingBudget}
              className="rounded-md bg-primary text-primary-foreground text-xs px-3 py-1.5 font-medium disabled:opacity-50"
            >
              {savingBudget ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditingBudget(false)}
              className="rounded-md text-xs px-3 py-1.5 text-muted-foreground hover:text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`rounded-xl p-4 border ${fuelOverBudget ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700" : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"}`}>
          <div className="flex items-center gap-2 mb-1">
            <Droplets size={14} className={fuelOverBudget ? "text-red-500" : "text-amber-500"} />
            <span className={`text-xs font-semibold ${fuelOverBudget ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>Fuel Spend</span>
            {fuelOverBudget && (
              <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                <AlertCircle size={9} /> Over budget
              </span>
            )}
          </div>
          <p className={`text-2xl font-bold ${fuelOverBudget ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-300"}`}>
            Rs {totalFuelThisMonth.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {budget.fuelBudgetNpr > 0 ? `budget: Rs ${budget.fuelBudgetNpr.toLocaleString()}` : "this month"}
          </p>
        </div>

        <div className={`rounded-xl p-4 border ${maintOverBudget ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700" : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"}`}>
          <div className="flex items-center gap-2 mb-1">
            <Wrench size={14} className={maintOverBudget ? "text-red-500" : "text-blue-500"} />
            <span className={`text-xs font-semibold ${maintOverBudget ? "text-red-700 dark:text-red-400" : "text-blue-700 dark:text-blue-400"}`}>Maintenance Spend</span>
            {maintOverBudget && (
              <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                <AlertCircle size={9} /> Over budget
              </span>
            )}
          </div>
          <p className={`text-2xl font-bold ${maintOverBudget ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-300"}`}>
            Rs {totalMaintThisMonth.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {budget.maintBudgetNpr > 0 ? `budget: Rs ${budget.maintBudgetNpr.toLocaleString()}` : "this month"}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge size={14} className="text-slate-500" />
            <span className="text-xs font-semibold text-muted-foreground">Cost per KM (fuel)</span>
          </div>
          {vehicleStats.length === 0 ? (
            <p className="text-xs text-muted-foreground">No odometer data yet</p>
          ) : (
            <div className="space-y-1.5">
              {vehicleStats.map((v) => (
                <div key={v.plate} className="flex items-center justify-between">
                  <span className="text-xs font-medium">{v.plate}</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Rs {v.costPerKm}/km</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CSV export helper ──────────────────────────────────────────────────────────
function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── FleetFuelPanel ─────────────────────────────────────────────────────────────
function FleetFuelPanel({ vehicles }: { vehicles: VehicleRow[] | undefined }) {
  const [rows, setRows] = useState<FuelLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    vehicleId: "",
    date: new Date().toISOString().slice(0, 10),
    liters: "",
    amountNpr: "",
    odometerKm: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/fuel-logs`, { headers: tenantHeaders() });
      setRows(await r.json() as FuelLogRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    if (!form.date || !form.liters || !form.amountNpr || !form.odometerKm) {
      setErr("Date, liters, amount NPR and odometer are required.");
      return;
    }
    setSaving(true); setErr("");
    try {
      await apiPost("/fuel-logs", {
        vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
        date: form.date,
        liters: Number(form.liters),
        amountNpr: Number(form.amountNpr),
        odometerKm: Number(form.odometerKm),
        notes: form.notes || null,
      });
      setForm({ vehicleId: "", date: new Date().toISOString().slice(0, 10), liters: "", amountNpr: "", odometerKm: "", notes: "" });
      setAdding(false);
      void load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this fuel log?")) return;
    await apiDelete(`/fuel-logs/${id}`);
    void load();
  }

  function handleExport() {
    downloadCsv(
      "fuel-logs.csv",
      ["Date", "Vehicle", "Liters", "Amount NPR", "Odometer (km)", "Notes"],
      rows.map((r) => [
        r.date,
        r.vehiclePlate ?? "",
        String(r.liters),
        String(r.amountNpr),
        String(r.odometerKm),
        r.notes ?? "",
      ]),
    );
  }

  const monthlyChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const month = r.date.slice(0, 7);
      map.set(month, (map.get(month) ?? 0) + r.amountNpr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, total]) => ({
        month: month.slice(5),
        total,
      }));
  }, [rows]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Droplets size={15} className="text-amber-500" />
          <h3 className="font-bold text-sm text-primary">Fuel Logs</h3>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1 border border-border text-xs px-3 py-1 font-semibold rounded-xl text-muted-foreground hover:text-primary hover:border-primary transition-colors"
            >
              <Download size={12} />
              Export CSV
            </button>
          )}
          <button
            onClick={() => setAdding(!adding)}
            className="bg-amber-500 text-xs px-3 py-1 font-bold text-slate-900 rounded-xl"
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="p-4 border-b border-border bg-muted/30 space-y-2">
          {err && <p className="text-xs text-red-500">{err}</p>}
          <select
            value={form.vehicleId}
            onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
            className="w-full border rounded-lg p-2 text-xs bg-background"
          >
            <option value="">— Select Vehicle —</option>
            {(vehicles ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.plateNumber} ({v.model})</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="border rounded-lg p-2 text-xs" />
            <input type="number" placeholder="Liters" value={form.liters} onChange={(e) => setForm((f) => ({ ...f, liters: e.target.value }))} className="border rounded-lg p-2 text-xs" />
            <input type="number" placeholder="Amount NPR" value={form.amountNpr} onChange={(e) => setForm((f) => ({ ...f, amountNpr: e.target.value }))} className="border rounded-lg p-2 text-xs" />
            <input type="number" placeholder="Odometer (km)" value={form.odometerKm} onChange={(e) => setForm((f) => ({ ...f, odometerKm: e.target.value }))} className="border rounded-lg p-2 text-xs" />
          </div>
          <input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg p-2 text-xs" />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="w-full bg-amber-500 py-2 text-xs font-bold rounded-xl text-slate-900 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Fuel Log"}
          </button>
        </div>
      )}

      {!loading && monthlyChartData.length > 1 && (
        <div className="px-4 pt-4 pb-2 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Monthly Fuel Spend (NPR)</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={monthlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                width={32}
              />
              <Tooltip
                formatter={(value: number) => [`Rs ${value.toLocaleString()}`, "Fuel"]}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Bar dataKey="total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground p-4 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">No fuel logs yet. Add the first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["Date", "Vehicle", "Liters", "NPR", "Odometer", "Notes", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.vehiclePlate ?? "—"}</td>
                  <td className="px-3 py-2">{r.liters} L</td>
                  <td className="px-3 py-2">Rs {r.amountNpr.toLocaleString()}</td>
                  <td className="px-3 py-2">{r.odometerKm.toLocaleString()} km</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{r.notes ?? "—"}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => void handleDelete(r.id)} className="text-red-500 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── FleetMaintenancePanel ──────────────────────────────────────────────────────
function FleetMaintenancePanel({ vehicles }: { vehicles: VehicleRow[] | undefined }) {
  const [rows, setRows] = useState<MaintenanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    vehicleId: "",
    partType: "",
    description: "",
    costNpr: "",
    odometerKm: "",
    serviceDate: new Date().toISOString().slice(0, 10),
    vendor: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/maintenance-records`, { headers: tenantHeaders() });
      setRows(await r.json() as MaintenanceRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    if (!form.partType || !form.serviceDate || !form.odometerKm) {
      setErr("Part type, service date and odometer are required.");
      return;
    }
    setSaving(true); setErr("");
    try {
      await apiPost("/maintenance-records", {
        vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
        partType: form.partType,
        description: form.description || null,
        costNpr: Number(form.costNpr) || 0,
        odometerKm: Number(form.odometerKm),
        serviceDate: form.serviceDate,
        vendor: form.vendor || null,
      });
      setForm({ vehicleId: "", partType: "", description: "", costNpr: "", odometerKm: "", serviceDate: new Date().toISOString().slice(0, 10), vendor: "" });
      setAdding(false);
      void load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this service record?")) return;
    await apiDelete(`/maintenance-records/${id}`);
    void load();
  }

  function handleExport() {
    downloadCsv(
      "service-records.csv",
      ["Date", "Vehicle", "Part", "Cost NPR", "Odometer (km)", "Vendor"],
      rows.map((r) => [
        r.serviceDate,
        r.vehiclePlate ?? "",
        r.partType,
        String(r.costNpr),
        String(r.odometerKm),
        r.vendor ?? "",
      ]),
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Wrench size={15} className="text-amber-500" />
          <h3 className="font-bold text-sm text-primary">Service Records</h3>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1 border border-border text-xs px-3 py-1 font-semibold rounded-xl text-muted-foreground hover:text-primary hover:border-primary transition-colors"
            >
              <Download size={12} />
              Export CSV
            </button>
          )}
          <button
            onClick={() => setAdding(!adding)}
            className="bg-amber-500 text-xs px-3 py-1 font-bold text-slate-900 rounded-xl"
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="p-4 border-b border-border bg-muted/30 space-y-2">
          {err && <p className="text-xs text-red-500">{err}</p>}
          <select
            value={form.vehicleId}
            onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
            className="w-full border rounded-lg p-2 text-xs bg-background"
          >
            <option value="">— Select Vehicle —</option>
            {(vehicles ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.plateNumber} ({v.model})</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Part Type (e.g. Tyre)" value={form.partType} onChange={(e) => setForm((f) => ({ ...f, partType: e.target.value }))} className="border rounded-lg p-2 text-xs" />
            <input type="date" value={form.serviceDate} onChange={(e) => setForm((f) => ({ ...f, serviceDate: e.target.value }))} className="border rounded-lg p-2 text-xs" />
            <input type="number" placeholder="Cost NPR" value={form.costNpr} onChange={(e) => setForm((f) => ({ ...f, costNpr: e.target.value }))} className="border rounded-lg p-2 text-xs" />
            <input type="number" placeholder="Odometer (km)" value={form.odometerKm} onChange={(e) => setForm((f) => ({ ...f, odometerKm: e.target.value }))} className="border rounded-lg p-2 text-xs" />
          </div>
          <input placeholder="Vendor (optional)" value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} className="w-full border rounded-lg p-2 text-xs" />
          <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg p-2 text-xs" />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="w-full bg-amber-500 py-2 text-xs font-bold rounded-xl text-slate-900 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Service Record"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground p-4 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">No service records yet. Add the first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["Date", "Vehicle", "Part", "Cost NPR", "Odometer", "Vendor", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap">{r.serviceDate}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.vehiclePlate ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{r.partType}</td>
                  <td className="px-3 py-2">Rs {r.costNpr.toLocaleString()}</td>
                  <td className="px-3 py-2">{r.odometerKm.toLocaleString()} km</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.vendor ?? "—"}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => void handleDelete(r.id)} className="text-red-500 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── FleetDocumentsPanel ────────────────────────────────────────────────────────
type VehicleDocRow = {
  id: number;
  vehicleId: number;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  bluebookExpiry: string | null;
  insuranceExpiry: string | null;
  pollutionExpiry: string | null;
  daysUntilBluebook: number | null;
  daysUntilInsurance: number | null;
  daysUntilPollution: number | null;
};

function expiryColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days <= 0) return "text-red-600 dark:text-red-400 font-bold";
  if (days <= 30) return "text-red-500 dark:text-red-400 font-semibold";
  if (days <= 60) return "text-amber-600 dark:text-amber-400 font-semibold";
  return "text-green-600 dark:text-green-400";
}

function expiryBadge(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "Expired";
  if (days === 1) return "1 day left";
  return `${days}d left`;
}

function FleetDocumentsPanel({ vehicles }: { vehicles: VehicleRow[] | undefined }) {
  const [rows, setRows] = useState<VehicleDocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ bluebookExpiry: "", insuranceExpiry: "", pollutionExpiry: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/vehicle-documents`, { headers: tenantHeaders() });
      setRows(await r.json() as VehicleDocRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function startEdit(row: VehicleDocRow) {
    setEditing(row.vehicleId);
    setEditForm({
      bluebookExpiry: row.bluebookExpiry ?? "",
      insuranceExpiry: row.insuranceExpiry ?? "",
      pollutionExpiry: row.pollutionExpiry ?? "",
    });
  }

  async function handleSave(vehicleId: number) {
    setSaving(true);
    try {
      await apiPut(`/vehicle-documents/${vehicleId}`, {
        bluebookExpiry: editForm.bluebookExpiry || null,
        insuranceExpiry: editForm.insuranceExpiry || null,
        pollutionExpiry: editForm.pollutionExpiry || null,
      });
      setEditing(null);
      void load();
    } finally {
      setSaving(false);
    }
  }

  // Also show vehicles that don't yet have a document record
  const vehicleList = vehicles ?? [];
  const docsByVehicleId = new Map(rows.map((r) => [r.vehicleId, r]));

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <FileText size={15} className="text-amber-500" />
        <h3 className="font-bold text-sm text-primary">Statutory Documents</h3>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground p-4 text-center">Loading…</p>
      ) : vehicleList.length === 0 ? (
        <p className="text-xs text-muted-foreground p-4 text-center">No vehicles registered yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {vehicleList.map((v) => {
            const doc = docsByVehicleId.get(v.id);
            const isEditing = editing === v.id;
            return (
              <div key={v.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{v.plateNumber}</p>
                    <p className="text-xs text-muted-foreground">{v.model}</p>
                  </div>
                  <button
                    onClick={() => isEditing ? setEditing(null) : startEdit(doc ?? { vehicleId: v.id, id: 0, vehiclePlate: v.plateNumber, vehicleModel: v.model, bluebookExpiry: null, insuranceExpiry: null, pollutionExpiry: null, daysUntilBluebook: null, daysUntilInsurance: null, daysUntilPollution: null })}
                    className="text-xs text-amber-600 hover:text-amber-500 font-semibold flex items-center gap-1"
                  >
                    <Pencil size={11} /> {isEditing ? "Cancel" : "Edit"}
                  </button>
                </div>

                {isEditing ? (
                  <div className="space-y-2 p-3 bg-muted/40 rounded-xl">
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { label: "Bluebook Expiry", key: "bluebookExpiry" as const },
                        { label: "Insurance Expiry", key: "insuranceExpiry" as const },
                        { label: "Pollution Expiry", key: "pollutionExpiry" as const },
                      ].map(({ label, key }) => (
                        <div key={key} className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground w-32 shrink-0">{label}</label>
                          <input
                            type="date"
                            value={editForm[key]}
                            onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                            className="flex-1 border rounded-lg p-1.5 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => void handleSave(v.id)}
                      disabled={saving}
                      className="w-full bg-amber-500 py-1.5 text-xs font-bold rounded-lg text-slate-900 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Bluebook", days: doc?.daysUntilBluebook ?? null, date: doc?.bluebookExpiry },
                      { label: "Insurance", days: doc?.daysUntilInsurance ?? null, date: doc?.insuranceExpiry },
                      { label: "Pollution", days: doc?.daysUntilPollution ?? null, date: doc?.pollutionExpiry },
                    ].map(({ label, days, date }) => (
                      <div key={label} className="rounded-lg bg-muted/40 p-2 text-center">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</p>
                        <p className="text-[10px] text-muted-foreground">{date ?? "Not set"}</p>
                        <p className={`text-[11px] mt-0.5 ${expiryColor(days)}`}>{expiryBadge(days)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Live Fleet Map Panel ───────────────────────────────────────────────────────
function LiveFleetMapPanel() {
  const liveLocations = useLiveLocations();
  // Only show drivers who are actively streaming GPS (isLive === true)
  const buses: FleetBus[] = liveLocations
    .filter((loc) => loc.isLive && loc.lat !== null && loc.lng !== null)
    .map((loc) => ({
      id: loc.id,
      label: loc.vehicleNumber,
      driverName: loc.name,
      lat: loc.lat!,
      lng: loc.lng!,
      status: "on-route" as const,
    }));

  if (buses.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
          <MapPin size={16} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-primary">Live Fleet Map</p>
          <p className="text-xs text-muted-foreground">No buses are online right now. Map will appear when drivers start a trip.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MapPin size={15} className="text-amber-500" />
        <h2 className="font-semibold text-primary text-sm">Live Fleet Map</h2>
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
          {buses.length} online
        </span>
      </div>
      <OsmMap mode="fleet" buses={buses} height={260} />
    </div>
  );
}

export default function AdminPortal() {
  const { user } = useAuth();
  const { data: stations } = useListStations();
  const { data: passengers } = useListPassengers();
  const { data: drivers } = useListDrivers();
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
      fetch(`/api/tenants/${tenantId}`)
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
        {(["dashboard", "fleet-fuel", "fleet-maintenance", "fleet-documents"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setAdminTab(tab)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap ${adminTab === tab ? "bg-amber-500 text-slate-900" : "text-muted-foreground"}`}
          >
            {tab === "dashboard" ? "Dashboard" : tab === "fleet-fuel" ? "Fuel Logs" : tab === "fleet-maintenance" ? "Service" : "Documents"}
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
            vehicles={vehicles as VehicleRow[] | undefined}
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
            vehicles={vehicles as VehicleRow[] | undefined}
            routes={adminRoutes as RouteRow[] | undefined}
            onTagUpdated={() =>
              queryClient.invalidateQueries({
                queryKey: getListVehiclesQueryKey(),
              })
            }
          />
          <RouteManager
            drivers={drivers}
            vehicles={vehicles as VehicleRow[] | undefined}
          />
          <CalendarManager />
        </>
      )}

      {adminTab === "fleet-fuel" && <FleetFuelPanel vehicles={vehicles as VehicleRow[] | undefined} />}
      {adminTab === "fleet-maintenance" && <FleetMaintenancePanel vehicles={vehicles as VehicleRow[] | undefined} />}
      {adminTab === "fleet-documents" && <FleetDocumentsPanel vehicles={vehicles as VehicleRow[] | undefined} />}
    </div>
  );
}
