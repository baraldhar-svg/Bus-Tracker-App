import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useListStations, useListAnnouncements, useListPassengers, useListDrivers, useListRoutes, useListVehicles, getListPassengersQueryKey, getListDriversQueryKey, getListRoutesQueryKey, getListStationsQueryKey, getListVehiclesQueryKey, getListAnnouncementsQueryKey, useListCalendarEvents, getListCalendarEventsQueryKey, getTenantId } from "@workspace/api-client-react";
import { CheckCircle, MapPin, Home, Bus, Upload, Camera, Pencil, AlertTriangle, Wrench, Send, MessageSquare, Megaphone, Phone, Route, Plus, Trash2, Search, Navigation, ChevronDown, ChevronUp, X, RefreshCw, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Star, Clock, Lock, User, Bell, Droplets, FileText, BarChart3, Gauge, AlertCircle, Settings2 } from "lucide-react";
import StationMapPicker from "@/components/station-map-picker";

// ── 🛠️ OsmMap Import फिक्स भइसकेको छ ──
import OsmMap, { RouteStop } from "@/components/osm-map";

import { useLiveLocations } from "@/hooks/use-live-locations";
import { adToBs, bsToAd, getDaysInBsMonth, getFirstWeekdayOfBsMonth, todayBs, bsDateToAd, BS_MONTH_NAMES_NE, AD_MONTH_NAMES } from "@/lib/bs-calendar";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useDriverMessages } from "@/lib/driver-messages";

// 🚀 सिधै रीप्लिट ब्याकइन्डको ठेगाना हार्डकोड गरिएको
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
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [bsYear, setBsYear] = useState(todayB.year);
  const [bsMonth, setBsMonth] = useState(todayB.month);
  const [adYear, setAdYear] = useState(todayAd.getFullYear());
  const [adMonth, setAdMonth] = useState(todayAd.getMonth() + 1);

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

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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

  const WEEKDAYS = calSystem === "bs" ? WEEKDAYS_NE : WEEKDAYS_EN;
  const headerTitle = calSystem === "bs" ? `${BS_MONTH_NAMES_NE[bsMonth - 1]} ${bsYear}` : `${AD_MONTH_NAMES[adMonth - 1]} ${adYear}`;
  const headerSubtitle = calSystem === "bs" ? `${queryMonth1.replace("-", " / ")} AD` : (() => { const bs = adToBs(adYear, adMonth, 1); return `${BS_MONTH_NAMES_NE[bs.month - 1]} ${bs.year} BS`; })();

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
          <button onClick={() => switchTo("ad")} className={`px-2.5 py-1 rounded-lg transition-colors ${calSystem === "ad" ? "bg-amber-500 text-slate-900" : "text-muted-foreground