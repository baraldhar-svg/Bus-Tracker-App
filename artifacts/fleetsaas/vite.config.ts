// fleetsaas/src/components/portals/admin/VehicleServiceTabs.tsx
import { useState, useEffect } from "react";
// ── 🛠️ फिक्स गरिएको: Pencil आइकन थपिएको ──
import { Droplets, Wrench, FileText, Trash2, Pencil } from "lucide-react";

const REPLIT_BACKEND = "https://33c7862f-0438-4adc-83ae-af5ac11d06a3-00-3u2khpqjgrop5.sisko.replit.dev";

// Types
type FuelLogRow = { id: number; vehicleId: number | null; vehiclePlate: string | null; date: string; liters: number; amountNpr: number; odometerKm: number; notes: string | null; };
type MaintenanceRow = { id: number; vehicleId: number | null; vehiclePlate: string | null; partType: string; description: string | null; costNpr: number; odometerKm: number; serviceDate: string; vendor: string | null; };
type VehicleDocRow = { id: number; vehicleId: number; vehiclePlate: string | null; vehicleModel: string | null; bluebookExpiry: string | null; insuranceExpiry: string | null; pollutionExpiry: string | null; daysUntilBluebook: number | null; daysUntilInsurance: number | null; daysUntilPollution: number | null; };

interface Props {
  vehicles: any[] | undefined;
  tenantHeaders: () => Record<string, string>;
  apiPost: (path: string, body: unknown) => Promise<any>;
  apiDelete: (path: string) => Promise<void>;
  apiPut: (path: string, body: unknown) => Promise<any>;
}

export default function VehicleServiceTabs({ vehicles, tenantHeaders, apiPost, apiDelete, apiPut }: Props) {
  const [subTab, setSubTab] = useState<"fuel" | "service" | "docs">("fuel");

  // Fuel State
  const [fuelRows, setFuelRows] = useState<FuelLogRow[]>([]);
  const [fuelForm, setFuelForm] = useState({ vehicleId: "", date: new Date().toISOString().slice(0, 10), liters: "", amountNpr: "", odometerKm: "", notes: "" });

  // Service State
  const [maintRows, setMaintRows] = useState<MaintenanceRow[]>([]);
  const [maintForm, setMaintForm] = useState({ vehicleId: "", partType: "", description: "", costNpr: "", odometerKm: "", serviceDate: new Date().toISOString().slice(0, 10), vendor: "" });

  // Docs State
  const [docRows, setDocRows] = useState<VehicleDocRow[]>([]);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [docForm, setDocForm] = useState({ bluebookExpiry: "", insuranceExpiry: "", pollutionExpiry: "" });

  const [loading, setLoading] = useState(false);

  async function loadAllData() {
    setLoading(true);
    try {
      const [f, m, d] = await Promise.all([
        fetch(`${REPLIT_BACKEND}/api/fuel-logs`, { headers: tenantHeaders() }).then(res => res.json()),
        fetch(`${REPLIT_BACKEND}/api/maintenance-records`, { headers: tenantHeaders() }).then(res => res.json()),
        fetch(`${REPLIT_BACKEND}/api/vehicle-documents`, { headers: tenantHeaders() }).then(res => res.json())
      ]);
      setFuelRows(f || []);
      setMaintRows(m || []);
      setDocRows(d || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadAllData(); }, []);

  async function handleAddFuel() {
    if (!fuelForm.date || !fuelForm.liters || !fuelForm.amountNpr || !fuelForm.odometerKm) return;
    try {
      await apiPost("/fuel-logs", { vehicleId: fuelForm.vehicleId ? Number(fuelForm.vehicleId) : null, date: fuelForm.date, liters: Number(fuelForm.liters), amountNpr: Number(fuelForm.amountNpr), odometerKm: Number(fuelForm.odometerKm), notes: fuelForm.notes || null });
      setFuelForm({ vehicleId: "", date: new Date().toISOString().slice(0, 10), liters: "", amountNpr: "", odometerKm: "", notes: "" });
      void loadAllData();
    } catch { alert("Failed"); }
  }

  async function handleAddMaint() {
    if (!maintForm.partType || !maintForm.serviceDate || !maintForm.odometerKm) return;
    try {
      await apiPost("/maintenance-records", { vehicleId: maintForm.vehicleId ? Number(maintForm.vehicleId) : null, partType: maintForm.partType, description: maintForm.description || null, costNpr: Number(maintForm.costNpr) || 0, odometerKm: Number(maintForm.odometerKm), serviceDate: maintForm.serviceDate, vendor: maintForm.vendor || null });
      setMaintForm({ vehicleId: "", partType: "", description: "", costNpr: "", odometerKm: "", serviceDate: new Date().toISOString().slice(0, 10), vendor: "" });
      void loadAllData();
    } catch { alert("Failed"); }
  }

  async function handleSaveDoc(vehicleId: number) {
    try {
      await apiPut(`/vehicle-documents/${vehicleId}`, { bluebookExpiry: docForm.bluebookExpiry || null, insuranceExpiry: docForm.insuranceExpiry || null, pollutionExpiry: docForm.pollutionExpiry || null });
      setEditingDocId(null);
      void loadAllData();
    } catch { alert("Failed"); }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden mt-6">
      <div className="flex border-b border-border bg-muted/20 p-1 gap-1 text-xs font-semibold">
        <button onClick={() => setSubTab("fuel")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${subTab === "fuel" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>
          <Droplets size={13} /> Fuel Logs
        </button>
        <button onClick={() => setSubTab("service")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${subTab === "service" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>
          <Wrench size={13} /> Service Records
        </button>
        <button onClick={() => setSubTab("docs")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors ${subTab === "docs" ? "bg-amber-500 text-slate-900" : "text-muted-foreground hover:text-foreground"}`}>
          <FileText size={13} /> Documents
        </button>
      </div>
      <div className="p-4">
        {loading && <p className="text-xs text-muted-foreground text-center py-4">Loading matrix...</p>}
        {!loading && subTab === "fuel" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select value={fuelForm.vehicleId} onChange={e => setFuelForm(f => ({ ...f, vehicleId: e.target.value }))} className="border rounded-lg p-2 bg-background">
                <option value="">Select Bus</option>
                {(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
              </select>
              <input type="date" value={fuelForm.date} onChange={e => setFuelForm(f => ({ ...f, date: e.target.value }))} className="border rounded-lg p-2" />
              <input type="number" placeholder="Liters" value={fuelForm.liters} onChange={e => setFuelForm(f => ({ ...f, liters: e.target.value }))} className="border rounded-lg p-2" />
              <input type="number" placeholder="Amount (NPR)" value={fuelForm.amountNpr} onChange={e => setFuelForm(f => ({ ...f, amountNpr: e.target.value }))} className="border rounded-lg p-2" />
              <input type="number" placeholder="Odometer" value={fuelForm.odometerKm} onChange={e => setFuelForm(f => ({ ...f, odometerKm: e.target.value }))} className="border rounded-lg p-2 className='w-full'" />
            </div>
            <button onClick={handleAddFuel} className="w-full bg-amber-500 text-slate-900 font-bold py-2 rounded-xl text-xs">✓ Save Fuel Log</button>
            <div className="max-h-40 overflow-y-auto border rounded-xl divide-y text-xs mt-2 bg-muted/10">
              {fuelRows.map(r => (
                <div key={r.id} className="p-2 flex justify-between items-center bg-card">
                  <div><p className="font-semibold">{r.vehiclePlate || "General"}</p><p className="text-[10px] text-muted-foreground">{r.date} · {r.liters}L · Rs {r.amountNpr}</p></div>
                  <button onClick={() => { if(confirm("Delete?")) { void apiDelete(`/fuel-logs/${r.id}`); void loadAllData(); } }} className="text-red-500"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        {!loading && subTab === "service" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select value={maintForm.vehicleId} onChange={e => setMaintForm(f => ({ ...f, vehicleId: e.target.value }))} className="border rounded-lg p-2 bg-background">
                <option value="">Select Bus</option>
                {(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
              </select>
              <input placeholder="Part" value={maintForm.partType} onChange={e => setMaintForm(f => ({ ...f, partType: e.target.value }))} className="border rounded-lg p-2" />
              <input type="number" placeholder="Cost NPR" value={maintForm.costNpr} onChange={e => setMaintForm(f => ({ ...f, costNpr: e.target.value }))} className="border rounded-lg p-2" />
              <input type="number" placeholder="Odometer" value={maintForm.odometerKm} onChange={e => setMaintForm(f => ({ ...f, odometerKm: e.target.value }))} className="border rounded-lg p-2" />
            </div>
            <button onClick={handleAddMaint} className="w-full bg-amber-500 text-slate-900 font-bold py-2 rounded-xl text-xs">✓ Save Service Record</button>
            <div className="max-h-40 overflow-y-auto border rounded-xl divide-y text-xs mt-2 bg-muted/10">
              {maintRows.map(r => (
                <div key={r.id} className="p-2 flex justify-between items-center bg-card">
                  <div><p className="font-semibold">{r.vehiclePlate} — {r.partType}</p><p className="text-[10px] text-muted-foreground">{r.serviceDate} · Rs {r.costNpr}</p></div>
                  <button onClick={() => { if(confirm("Delete?")) { void apiDelete(`/maintenance-records/${r.id}`); void loadAllData(); } }} className="text-red-500"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        {!loading && subTab === "docs" && (
          <div className="space-y-3 text-xs">
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Bluebook & Insurance Expiry Logs</p>
            <div className="divide-y border rounded-xl max-h-56 overflow-y-auto bg-card">
              {(vehicles ?? []).map(v => {
                const doc = docRows.find(d => d.vehicleId === v.id);
                const isEditing = editingDocId === v.id;
                return (
                  <div key={v.id} className="p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-foreground">{v.plateNumber} <span className="text-[10px] font-normal text-muted-foreground">({v.model})</span></p>
                      <button onClick={() => { if(isEditing) setEditingDocId(null); else { setEditingDocId(v.id); setDocForm({ bluebookExpiry: doc?.bluebookExpiry || "", insuranceExpiry: doc?.insuranceExpiry || "", pollutionExpiry: doc?.pollutionExpiry || "" }); } }} className="text-amber-600 font-bold flex items-center gap-1"><Pencil size={11} /> {isEditing ? "Cancel" : "Update"}</button>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2 bg-muted/40 p-2 rounded-xl">
                        <input type="date" value={docForm.bluebookExpiry} onChange={e => setDocForm(f => ({ ...f, bluebookExpiry: e.target.value }))} className="border p-1 rounded w-full text-xs" />
                        <button onClick={() => void handleSaveDoc(v.id)} className="w-full bg-green-600 text-white font-bold py-1 rounded text-xs">Save dates</button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Bluebook Expiry: <span className="font-mono font-bold text-foreground">{doc?.bluebookExpiry || "Not Set"}</span></p>
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