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

const WEEKDAYS_NE = ["आइत", "सोम", "मंगल", "बुध", "बिही", "शुक्र", "शनि"];

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

// ── Shared Models ──
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
type DriverRow = {
  id: number;
  name: string;
  phone: string;
  vehicleNumber: string;
  isActive: boolean;
  isOnline: boolean;
  photoUrl?: string | null;
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
type CalendarEvent = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  eventDate: string;
  notified: boolean;
  autoNotify: boolean;
};

// ── 🛠️ १. VEHICLE SERVICE & MANAGEMENT PANEL COMPONENT (ब्याकटिक्स एरर फिक्स गरिएको) ──
function VehicleServiceTabs({ vehicles }: { vehicles: any[] | undefined }) {
  const [subTab, setSubTab] = useState<"fuel" | "service" | "docs">("fuel");
  const [fuelRows, setFuelRows] = useState<FuelLogRow[]>([]);
  const [fuelForm, setFuelForm] = useState({
    vehicleId: "",
    date: new Date().toISOString().slice(0, 10),
    liters: "",
    amountNpr: "",
    odometerKm: "",
    notes: "",
  });
  const [maintRows, setMaintRows] = useState<MaintenanceRow[]>([]);
  const [maintForm, setMaintForm] = useState({
    vehicleId: "",
    partType: "",
    description: "",
    costNpr: "",
    odometerKm: "",
    serviceDate: new Date().toISOString().slice(0, 10),
    vendor: "",
  });
  const [docRows, setDocRows] = useState<VehicleDocRow[]>([]);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [docForm, setDocForm] = useState({
    bluebookExpiry: "",
    insuranceExpiry: "",
    pollutionExpiry: "",
  });
  const [loading, setLoading] = useState(false);

  async function loadAllData() {
    setLoading(true);
    try {
      const [f, m, d] = await Promise.all([
        fetch(`/api/fuel-logs`, {
          headers: tenantHeaders(),
        }).then((res) => res.json()),
        fetch(`/api/maintenance-records`, {
          headers: tenantHeaders(),
        }).then((res) => res.json()),
        fetch(`/api/vehicle-documents`, {
          headers: tenantHeaders(),
        }).then((res) => res.json()),
      ]);
      setFuelRows(f || []);
      setMaintRows(m || []);
      setDocRows(d || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAllData();
  }, []);

  async function handleAddFuel() {
    if (
      !fuelForm.date ||
      !fuelForm.liters ||
      !fuelForm.amountNpr ||
      !fuelForm.odometerKm
    )
      return;
    try {
      await apiPost("/fuel-logs", {
        vehicleId: fuelForm.vehicleId ? Number(fuelForm.vehicleId) : null,
        date: fuelForm.date,
        liters: Number(fuelForm.liters),
        amountNpr: Number(fuelForm.amountNpr),
        odometerKm: Number(fuelForm.odometerKm),
        notes: fuelForm.notes || null,
      });
      setFuelForm({
        vehicleId: "",
        date: new Date().toISOString().slice(0, 10),
        liters: "",
        amountNpr: "",
        odometerKm: "",
        notes: "",
      });
      void loadAllData();
    } catch {
      alert("Failed");
    }
  }

  async function handleAddMaint() {
    if (!maintForm.partType || !maintForm.serviceDate || !maintForm.odometerKm)
      return;
    try {
      await apiPost("/maintenance-records", {
        vehicleId: maintForm.vehicleId ? Number(maintForm.vehicleId) : null,
        partType: maintForm.partType,
        description: maintForm.description || null,
        costNpr: Number(maintForm.costNpr) || 0,
        odometerKm: Number(maintForm.odometerKm),
        serviceDate: maintForm.serviceDate,
        vendor: maintForm.vendor || null,
      });
      setMaintForm({
        vehicleId: "",
        partType: "",
        description: "",
        costNpr: "",
        odometerKm: "",
        serviceDate: new Date().toISOString().slice(0, 10),
        vendor: "",
      });
      void loadAllData();
    } catch {
      alert("Failed");
    }
  }

  async function handleSaveDoc(vehicleId: number) {
    try {
      await apiPut(`/vehicle-documents/${vehicleId}`, {
        bluebookExpiry: docForm.bluebookExpiry || null,
        insuranceExpiry: docForm.insuranceExpiry || null,
        pollutionExpiry: docForm.pollutionExpiry || null,
      });
      setEditingDocId(null);
      void loadAllData();
    } catch {
      alert("Failed");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex border-b border-border bg-muted/20 p-1 gap-1 text-xs font-semibold">
        <button
          onClick={() => setSubTab("fuel")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${subTab === "fuel" ? "bg-amber-500 text-slate-900 font-bold" : "text-muted-foreground"}`}
        >
          <Droplets size={13} /> Fuel Logs
        </button>
        <button
          onClick={() => setSubTab("service")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${subTab === "service" ? "bg-amber-500 text-slate-900 font-bold" : "text-muted-foreground"}`}
        >
          <Wrench size={13} /> Service Records
        </button>
        <button
          onClick={() => setSubTab("docs")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${subTab === "docs" ? "bg-amber-500 text-slate-900 font-bold" : "text-muted-foreground"}`}
        >
          <FileText size={13} /> Documents
        </button>
      </div>
      <div className="p-4">
        {loading && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Loading...
          </p>
        )}
        {!loading && subTab === "fuel" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={fuelForm.vehicleId}
                onChange={(e) =>
                  setFuelForm((f) => ({ ...f, vehicleId: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background"
              >
                <option value="">Select Bus</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={fuelForm.date}
                onChange={(e) =>
                  setFuelForm((f) => ({ ...f, date: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background text-foreground"
              />
              <input
                type="number"
                placeholder="Liters"
                value={fuelForm.liters}
                onChange={(e) =>
                  setFuelForm((f) => ({ ...f, liters: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background"
              />
              <input
                type="number"
                placeholder="Amount (NPR)"
                value={fuelForm.amountNpr}
                onChange={(e) =>
                  setFuelForm((f) => ({ ...f, amountNpr: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background"
              />
              <input
                type="number"
                placeholder="Odometer"
                value={fuelForm.odometerKm}
                onChange={(e) =>
                  setFuelForm((f) => ({ ...f, odometerKm: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background"
              />
            </div>
            <button
              onClick={handleAddFuel}
              className="w-full bg-amber-500 text-slate-900 font-bold py-2 rounded-xl text-xs"
            >
              ✓ Save Fuel Entry
            </button>
            <div className="max-h-40 overflow-y-auto border rounded-xl divide-y text-xs mt-2 bg-muted/10">
              {fuelRows.map((r) => (
                <div
                  key={r.id}
                  className="p-2 flex justify-between items-center bg-card"
                >
                  <div>
                    <p className="font-semibold">
                      {r.vehiclePlate || "General"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.date} · {r.liters}L · Rs {r.amountNpr}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm("Delete?")) {
                        await apiDelete(`/fuel-logs/${r.id}`);
                        void loadAllData();
                      }
                    }}
                    className="text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {!loading && subTab === "service" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={maintForm.vehicleId}
                onChange={(e) =>
                  setMaintForm((f) => ({ ...f, vehicleId: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background"
              >
                <option value="">Select Bus</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}
                  </option>
                ))}
              </select>
              <input
                placeholder="Part"
                value={maintForm.partType}
                onChange={(e) =>
                  setMaintForm((f) => ({ ...f, partType: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background"
              />
              <input
                type="number"
                placeholder="Cost NPR"
                value={maintForm.costNpr}
                onChange={(e) =>
                  setMaintForm((f) => ({ ...f, costNpr: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background"
              />
              <input
                type="number"
                placeholder="Odometer"
                value={maintForm.odometerKm}
                onChange={(e) =>
                  setMaintForm((f) => ({ ...f, odometerKm: e.target.value }))
                }
                className="border rounded-lg p-2 bg-background"
              />
            </div>
            <button
              onClick={handleAddMaint}
              className="w-full bg-amber-500 text-slate-900 font-bold py-2 rounded-xl text-xs"
            >
              ✓ Save Service Record
            </button>
            <div className="max-h-40 overflow-y-auto border rounded-xl divide-y text-xs mt-2 bg-muted/10">
              {maintRows.map((r) => (
                <div
                  key={r.id}
                  className="p-2 flex justify-between items-center bg-card"
                >
                  <div>
                    <p className="font-semibold">
                      {r.vehiclePlate} — {r.partType}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.serviceDate} · Rs {r.costNpr}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm("Delete?")) {
                        await apiDelete(`/maintenance-records/${r.id}`);
                        void loadAllData();
                      }
                    }}
                    className="text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {!loading && subTab === "docs" && (
          <div className="space-y-3 text-xs">
            <div className="divide-y border rounded-xl max-h-56 overflow-y-auto bg-card">
              {(vehicles ?? []).map((v) => {
                const doc = docRows.find((d) => d.vehicleId === v.id);
                const isEditing = editingDocId === v.id;
                return (
                  <div key={v.id} className="p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-foreground">
                        {v.plateNumber}
                      </p>
                      <button
                        onClick={() => {
                          if (isEditing) setEditingDocId(null);
                          else {
                            setEditingDocId(v.id);
                            setDocForm({
                              bluebookExpiry: doc?.bluebookExpiry || "",
                              insuranceExpiry: doc?.insuranceExpiry || "",
                              pollutionExpiry: doc?.pollutionExpiry || "",
                            });
                          }
                        }}
                        className="text-amber-600 font-bold flex items-center gap-1"
                      >
                        <Pencil size={11} /> {isEditing ? "Cancel" : "Update"}
                      </button>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2 bg-muted/40 p-2 rounded-xl">
                        <input
                          type="date"
                          value={docForm.bluebookExpiry}
                          onChange={(e) =>
                            setDocForm((f) => ({
                              ...f,
                              bluebookExpiry: e.target.value,
                            }))
                          }
                          className="border p-1 rounded w-full text-xs bg-background"
                        />
                        <button
                          onClick={() => void handleSaveDoc(v.id)}
                          className="w-full bg-green-600 text-white font-bold py-1 rounded text-xs"
                        >
                          Save dates
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Bluebook Expiry:{" "}
                        <span className="font-mono font-bold text-foreground">
                          {doc?.bluebookExpiry || "Not Set"}
                        </span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 📅 CalendarManager ──
function CalendarManager() {
  const queryClient = useQueryClient();
  const todayB = todayBs();
  const todayAd = new Date();
  const [calSystem, setCalSystem] = useState<"bs" | "ad">("bs");
  const [bsYear, setBsYear] = useState(todayB.year);
  const [bsMonth, setBsMonth] = useState(todayB.month);
  const [adYear, setAdYear] = useState(todayAd.getFullYear());
  const [adMonth, setAdMonth] = useState(todayAd.getMonth() + 1);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDescription, setNoteDescription] = useState("");
  const [eventType, setEventType] = useState("holiday");
  const [savingNote, setSavingNote] = useState(false);

  const adMonthStart = bsToAd(bsYear, bsMonth, 1);
  const adMonthEnd = bsToAd(bsYear, bsMonth, getDaysInBsMonth(bsYear, bsMonth));

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

  function prevMonth() {
    if (bsMonth === 1) {
      setBsYear((y) => y - 1);
      setBsMonth(12);
    } else setBsMonth((m) => m - 1);
  }
  function nextMonth() {
    if (bsMonth === 12) {
      setBsYear((y) => y + 1);
      setBsMonth(1);
    } else setBsMonth((m) => m + 1);
  }

  const daysInMonth = getDaysInBsMonth(bsYear, bsMonth);
  const firstWeekday = getFirstWeekdayOfBsMonth(bsYear, bsMonth);

  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const ev of events ?? []) {
    const parts = ev.eventDate.split("-").map(Number);
    const bs = adToBs(parts[0], parts[1], parts[2]);
    if (bs.year === bsYear && bs.month === bsMonth) {
      const list = eventsByDay.get(bs.day) ?? [];
      list.push(ev as CalendarEvent);
      eventsByDay.set(bs.day, list);
    }
  }

  async function handleSaveNote() {
    if (!selectedDay || !noteTitle.trim()) return;
    setSavingNote(true);
    try {
      const adDateStr = bsDateToAd(bsYear, bsMonth, selectedDay);
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
      alert("Failed");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleSetWeeklyHolidays() {
    if (!confirm("Set all Saturdays as Holidays?")) return;
    try {
      for (let day = 1; day <= daysInMonth; day++) {
        let weekday = (firstWeekday + day - 1) % 7;
        if (weekday === 6) {
          const adDateStr = bsDateToAd(bsYear, bsMonth, day);
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
    } catch {
      alert("Failed");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
        <button
          onClick={prevMonth}
          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="font-bold text-sm text-foreground">
            {BS_MONTH_NAMES_NE[bsMonth - 1]} {bsYear}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSetWeeklyHolidays}
            className="text-[10px] bg-red-500 text-white font-bold px-2 py-1 rounded-lg"
          >
            Sat Holidays
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
        <div className="md:col-span-2">
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS_NE.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold text-muted-foreground py-1"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = day === todayB.day && bsMonth === todayB.month;
              const dayEvents = eventsByDay.get(day) ?? [];
              const isHoliday = dayEvents.some((e) => e.type === "holiday");
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`relative flex flex-col items-center rounded-xl py-1.5 text-xs ${isToday ? "bg-amber-400 text-white font-bold" : isHoliday ? "bg-red-100 text-red-700" : "hover:bg-muted"}`}
                >
                  <span>{day}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-2 bg-muted/20 rounded-xl space-y-2 text-xs">
          <h3 className="font-bold text-primary">Notes Management</h3>
          {selectedDay ? (
            <div className="space-y-2">
              <input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Title"
                className="w-full border p-1 rounded bg-background"
              />
              <textarea
                value={noteDescription}
                onChange={(e) => setNoteDescription(e.target.value)}
                placeholder="Description"
                rows={2}
                className="w-full border p-1 rounded bg-background resize-none"
              />
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full border p-1 rounded bg-background"
              >
                <option value="holiday">Holiday</option>
                <option value="event">Event</option>
              </select>
              <button
                onClick={handleSaveNote}
                className="w-full bg-amber-500 py-1 rounded font-bold text-slate-900"
              >
                Save note
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground italic text-center pt-4">
              Click date to add notes
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 🚀 २. आन्तरिक एप ब्रोडकास्टर प्यानल (WhatsApp को सट्टा connected internally + custom classes) ──
function InternalAppNotificationsPanel() {
  const [activeSubTab, setActiveSubTab] = useState<
    "students" | "staff" | "drivers"
  >("students");
  const [classes, setClasses] = useState<string[]>([
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
  ]);
  const [selectedClass, setSelectedClass] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [showAddClassInput, setShowAddClassInput] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    setHistory([
      {
        id: 1,
        type: "Delay Alert",
        target: "Class 10 Students & Parents",
        status: "delivered",
        time: "Jun 27, 09:59 PM",
      },
      {
        id: 2,
        type: "Notice",
        target: "All School Staff Group",
        status: "delivered",
        time: "Jun 27, 09:56 PM",
      },
      {
        id: 3,
        type: "Emergency",
        target: "All Drivers Route B",
        status: "delivered",
        time: "Jun 27, 08:55 PM",
      },
    ]);
  }, []);

  function handleAddCustomClass() {
    if (!newClassName.trim()) return;
    const trimmedClass = newClassName.trim();
    if (classes.includes(trimmedClass)) {
      alert("यो क्लास वा ग्रुप पहिले नै उपलब्ध छ!");
      return;
    }
    setClasses((prev) => [...prev, trimmedClass]);
    setSelectedClass(trimmedClass);
    setNewClassName("");
    setShowAddClassInput(false);
  }

  async function handleAppBroadcast() {
    if (!customMessage.trim()) return;
    setSending(true);
    try {
      await apiPost("/announcements", {
        message: customMessage.trim(),
        severity: "info",
        targetGroup: activeSubTab,
        targetClass:
          activeSubTab === "students" ? selectedClass || "All" : null,
      });
      setHistory((prev) => [
        {
          id: Date.now(),
          type:
            activeSubTab === "students" ? "Class Notice" : "Staff/Driver Alert",
          target:
            activeSubTab === "students"
              ? `${selectedClass || "All Classes"} parents`
              : `All ${activeSubTab}`,
          status: "delivered",
          time: "Just now",
        },
        ...prev,
      ]);
      setCustomMessage("");
      alert(
        "✓ Internal Notification sent successfully to parent & student apps!",
      );
    } catch {
      alert("Failed to send internal app notification.");
    } finally {
      setSending(false);
    }
  }

  const latestMessage = history[0];
  const olderMessages = history.slice(1);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border font-bold text-sm text-primary flex items-center gap-2">
        <Bell size={15} className="text-amber-500 animate-bounce" />{" "}
        <span>OrbitTrack Internal App Broadcaster</span>
      </div>
      <div className="flex bg-muted/40 p-1 text-xs font-semibold gap-1">
        <button
          onClick={() => setActiveSubTab("students")}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${activeSubTab === "students" ? "bg-amber-500 text-slate-900 font-bold shadow" : "text-muted-foreground"}`}
        >
          Students/Parents
        </button>
        <button
          onClick={() => setActiveSubTab("staff")}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${activeSubTab === "staff" ? "bg-amber-500 text-slate-900 font-bold shadow" : "text-muted-foreground"}`}
        >
          Staff
        </button>
        <button
          onClick={() => setActiveSubTab("drivers")}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${activeSubTab === "drivers" ? "bg-amber-500 text-slate-900 font-bold shadow" : "text-muted-foreground"}`}
        >
          Drivers
        </button>
      </div>
      <div className="p-4 space-y-3">
        {activeSubTab === "students" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-muted-foreground">
                Target Class / Grade
              </label>
              <button
                type="button"
                onClick={() => setShowAddClassInput(!showAddClassInput)}
                className="text-[10px] text-amber-500 font-bold hover:underline"
              >
                {showAddClassInput
                  ? "✕ Close Input"
                  : "+ Create Custom Class/Group"}
              </button>
            </div>
            {showAddClassInput && (
              <div className="flex gap-2 p-2 rounded-xl bg-muted/30 border border-border/60">
                <input
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g., Staff Bus, PlayGroup"
                  className="flex-1 border rounded-lg p-1.5 text-xs bg-background outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCustomClass}
                  className="bg-amber-500 text-slate-900 text-xs px-3 font-bold rounded-lg"
                >
                  Add
                </button>
              </div>
            )}
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full border rounded-xl p-2 text-xs bg-background"
            >
              <option value="">All Registered Classes (Whole School)</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
            Notification Message
          </label>
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder={`Write broadcast notification details to all ${activeSubTab}...`}
            rows={3}
            className="w-full border rounded-xl p-2.5 text-xs bg-muted/20 outline-none resize-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={handleAppBroadcast}
          disabled={sending || !customMessage.trim()}
          className="w-full bg-amber-500 text-slate-900 font-bold text-xs py-2.5 rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-40"
        >
          {sending ? "Transmitting..." : `🚀 Send Internal Notification Alert`}
        </button>
        <div className="pt-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            Recent Broadcast Feed
          </p>
          {latestMessage && (
            <div className="flex items-center justify-between p-3 border rounded-xl bg-amber-500/10 border-amber-500/30 text-xs mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-slate-900 uppercase">
                  {latestMessage.type}
                </span>
                <p className="truncate text-foreground font-semibold">
                  {latestMessage.target}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {latestMessage.time}
              </span>
            </div>
          )}
          {olderMessages.length > 0 && (
            <div className="space-y-1.5">
              <button
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="w-full flex items-center justify-between px-3 py-1.5 bg-muted/40 border border-border rounded-xl text-[11px] font-medium text-muted-foreground"
              >
                <span>
                  {isHistoryOpen
                    ? "🔼 Hide Older Logs"
                    : `🔽 View Older Logs history (${olderMessages.length})`}
                </span>
              </button>
              {isHistoryOpen && (
                <div className="border border-border rounded-xl divide-y max-h-36 overflow-y-auto bg-muted/10">
                  {olderMessages.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between p-2 text-xs"
                    >
                      <span>{h.target}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {h.time}
                      </span>
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

// ── Live Fleet Map Panel with Strict Holiday Freeze Lock ──
function LiveFleetMapPanel() {
  const liveLocations = useLiveLocations();
  const todayB = todayBs();
  const queryMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const { data: monthEvents } = useListCalendarEvents({ month: queryMonth });

  const isTodayHoliday = useMemo(() => {
    if (!monthEvents) return false;
    return monthEvents.some((ev: any) => {
      const parts = ev.eventDate.split("-").map(Number);
      const bs = adToBs(parts[0], parts[1], parts[2]);
      return (
        bs.year === todayB.year &&
        bs.month === todayB.month &&
        bs.day === todayB.day &&
        ev.type === "holiday"
      );
    });
  }, [monthEvents, todayB]);

  const buses: FleetBus[] = useMemo(() => {
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
      <div className="px-4 py-3 border-b border-border font-bold text-sm text-primary flex items-center gap-2">
        <MapPin size={15} className="text-amber-500" /> Live Fleet Map Tracker
      </div>
      {isTodayHoliday ? (
        <div className="p-6 bg-red-500/5 text-center space-y-1.5">
          <AlertCircle size={24} className="text-red-500 mx-auto" />
          <p className="text-xs font-bold text-red-600">
            🏫 आज विद्यालय सार्वजनिक/साप्ताहिक बिदा रहेको छ।
          </p>
          <p className="text-[10px] text-muted-foreground">
            सुरक्षा कारण बिदाको दिनमा बसको लाइभ ट्र्याकिङ र जीपीएस मेसेजहरू
            रोक्का (Freeze) गरिएको छ।
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

function SmartStationManager({
  stations,
  onChanged,
}: {
  stations: any[] | undefined;
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

function VehicleTagGrid({
  vehicles,
  routes,
  onTagUpdated,
}: {
  vehicles: any[] | undefined;
  routes: any[] | undefined;
  onTagUpdated: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Vehicle Assets</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Total registered transport logs configuration asset grid.
      </p>
    </div>
  );
}

function BoardingLogPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Live Boarding Log</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Real-time board/absent logs from drivers.
      </p>
    </div>
  );
}
function DriverCommunicationsPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">Driver Status Logs</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Driver network connectivity pings log.
      </p>
    </div>
  );
}
function FleetCostsSummaryCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold text-primary text-sm">
        Monthly Logistics Costs
      </h2>
      <p className="text-xs text-muted-foreground mt-1">
        Monthly consolidated metrics overview matrix.
      </p>
    </div>
  );
}

export default function AdminPortal() {
  const { user } = useAuth();
  const { data: stations } = useListStations();
  const { data: drivers } = useListDrivers();
  const { data: vehicles } = useListVehicles();
  const { data: adminRoutes } = useListRoutes();
  const queryClient = useQueryClient();

  const [tenant, setTenant] = useState<any | null>(user?.tenant ?? null);
  const tenantId = user?.tenantId ?? 1;

  useEffect(() => {
    if (!tenant) {
      fetch(`/api/tenants/${tenantId}`)
        .then((r) => r.json())
        .then((data: any) => setTenant(data))
        .catch(() => {});
    }
  }, [tenantId, tenant]);

  function refetchAll() {
    queryClient.invalidateQueries({ queryKey: getListDriversQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListVehiclesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListStationsQueryKey() });
  }

  return (
    <div className="mx-auto w-full max-w-[860px] p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
          <p className="text-xs text-muted-foreground">{tenant?.name}</p>
        </div>
      </header>

      <nav className="rounded-xl border border-border bg-card shadow-sm flex p-1 gap-2 text-xs font-semibold bg-muted/20">
        <span className="px-4 py-2 bg-amber-500 text-slate-900 rounded-lg shadow-sm">
          Dashboard Overview
        </span>
      </nav>

      <div className="space-y-6">
        <FleetCostsSummaryCard />
        <LiveFleetMapPanel />

        <VehicleServiceTabs vehicles={vehicles as any[] | undefined} />

        <BoardingLogPanel />

        {/* ── 🚀 ह्वाट्सएपको सट्टा हाम्रै आन्तरिक इन-एप ब्रोडकास्टर थपिएको ── */}
        <InternalAppNotificationsPanel />

        <DriverCommunicationsPanel />
        <SmartStationManager
          stations={stations as any[] | undefined}
          onChanged={refetchAll}
        />
        <VehicleTagGrid
          vehicles={vehicles as any[] | undefined}
          routes={adminRoutes as any[] | undefined}
          onTagUpdated={refetchAll}
        />
        <CalendarManager />
      </div>
    </div>
  );
}
