import { useState, useCallback, useEffect, useRef } from "react";
import { useGetDashboardStats, useListTenants } from "@workspace/api-client-react";
import { Shield, Building2, Users, Radio, Banknote, Megaphone, Pencil, X, Check, Upload, Search, Trash2, ChevronDown, ChevronRight, MapPin, Bus, Wifi, WifiOff, RefreshCw, CreditCard, CheckCircle, AlertTriangle, RotateCcw } from "lucide-react";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiReq(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed");
  return data;
}

const TIER_COLORS: Record<string, string> = {
  silver: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600",
  gold: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700",
  platinum: "bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700",
};

const PLANS: { tier: string; label: string; price: string; color: string; ring: string }[] = [
  { tier: "silver", label: "Silver", price: "NPR 5,000/mo", color: "border-slate-500 bg-slate-700/60 text-slate-200", ring: "ring-slate-400" },
  { tier: "gold",   label: "Gold",   price: "NPR 12,000/mo", color: "border-amber-500 bg-amber-900/40 text-amber-200", ring: "ring-amber-400" },
  { tier: "platinum", label: "Platinum", price: "NPR 25,000/mo", color: "border-purple-500 bg-purple-900/40 text-purple-200", ring: "ring-purple-400" },
];

type TenantItem = {
  id: number;
  name: string;
  vehicleCount: number;
  passengerCount: number;
  subscriptionTier: string;
};

function TenantRow({ tenant: initialTenant, onPlanChange }: {
  tenant: TenantItem;
  onPlanChange: (id: number, tier: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [tenant, setTenant] = useState(initialTenant);
  const [saving, setSaving] = useState<string | null>(null);

  async function handleSelect(tier: string) {
    if (tier === tenant.subscriptionTier) { setOpen(false); return; }
    setSaving(tier);
    try {
      await onPlanChange(tenant.id, tier);
      setTenant((prev) => ({ ...prev, subscriptionTier: tier }));
      setOpen(false);
    } finally { setSaving(null); }
  }

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 bg-slate-800/60 hover:bg-slate-800 transition-colors p-3.5 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-amber-400 font-bold text-sm">
          {tenant.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-200 text-sm truncate">{tenant.name}</p>
          <p className="text-xs text-slate-400">{tenant.vehicleCount} vehicles · {tenant.passengerCount} passengers</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${TIER_COLORS[tenant.subscriptionTier] ?? TIER_COLORS.silver}`}>
          {tenant.subscriptionTier}
        </span>
        <span className="text-slate-500 text-xs ml-1">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-700 bg-slate-900/70 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Change Subscription Plan</p>
          <div className="grid grid-cols-3 gap-2">
            {PLANS.map((p) => {
              const active = tenant.subscriptionTier === p.tier;
              return (
                <button
                  key={p.tier}
                  onClick={() => handleSelect(p.tier)}
                  disabled={saving !== null}
                  className={`rounded-xl border p-3 text-center transition-all disabled:opacity-60 ${p.color} ${active ? `ring-2 ${p.ring}` : "opacity-70 hover:opacity-100"}`}
                >
                  <p className="text-xs font-bold">{p.label}</p>
                  <p className="text-[10px] mt-0.5 opacity-70">{p.price}</p>
                  {saving === p.tier && <p className="text-[10px] mt-1 opacity-80">Saving…</p>}
                  {active && saving !== p.tier && <p className="text-[10px] mt-1 font-semibold">✓ Current</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type Ad = {
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  targetUrl: string | null;
  sortOrder: number;
  active: number;
};

function AdRow({ ad, onToggle, onDelete, onMoveUp, onMoveDown, onSave, isFirst, isLast }: {
  ad: Ad;
  onToggle: (id: number, active: number) => void;
  onDelete: (id: number) => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  onSave: (id: number, patch: Partial<Ad>) => Promise<void>;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState(ad.title);
  const [eSubtitle, setESubtitle] = useState(ad.subtitle ?? "");
  const [eImageUrl, setEImageUrl] = useState(ad.imageUrl);
  const [eTargetUrl, setETargetUrl] = useState(ad.targetUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  function openEdit() {
    setETitle(ad.title);
    setESubtitle(ad.subtitle ?? "");
    setEImageUrl(ad.imageUrl);
    setETargetUrl(ad.targetUrl ?? "");
    setSaveErr("");
    setEditing(true);
  }

  async function handleSave() {
    if (!eTitle.trim() || !eImageUrl.trim()) { setSaveErr("Title and Image URL are required"); return; }
    setSaving(true); setSaveErr("");
    try {
      await onSave(ad.id, {
        title: eTitle.trim(),
        subtitle: eSubtitle.trim() || null,
        imageUrl: eImageUrl.trim(),
        targetUrl: eTargetUrl.trim() || null,
      });
      setEditing(false);
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-slate-800/80 p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Edit Ad</p>
          <button onClick={() => setEditing(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Title *</label>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="Sunrise Academy"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Subtitle / Tagline</label>
            <input value={eSubtitle} onChange={(e) => setESubtitle(e.target.value)} placeholder="Admissions Open 2081"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Banner Image *</label>
          <div className="flex gap-2">
            <input value={eImageUrl} onChange={(e) => setEImageUrl(e.target.value)} placeholder="https://images.unsplash.com/… or upload →"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500" />
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 transition-colors">
              <Upload size={13} />Upload
              <input type="file" accept="image/*" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setEImageUrl(await fileToDataUrl(f)); e.target.value = ""; }} />
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Target URL (click destination)</label>
          <input value={eTargetUrl} onChange={(e) => setETargetUrl(e.target.value)} placeholder="/school/6 or https://..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500" />
        </div>
        {/* Live preview */}
        {eImageUrl && (
          <div className="relative h-20 w-full overflow-hidden rounded-xl border border-slate-700">
            <img src={eImageUrl} alt="preview" className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/600x80/1e293b/64748b?text=Invalid+URL"; }} />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent flex items-center px-4">
              <div>
                <p className="text-sm font-bold text-white">{eTitle || "Ad Title"}</p>
                {eSubtitle && <p className="text-xs text-slate-300">{eSubtitle}</p>}
              </div>
            </div>
          </div>
        )}
        {saveErr && <p className="text-xs text-red-400">{saveErr}</p>}
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)}
            className="flex-1 rounded-xl border border-slate-700 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!eTitle.trim() || !eImageUrl.trim() || saving}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
            <Check size={13} />{saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
      ad.active ? "border-slate-700 bg-slate-800/60" : "border-slate-800 bg-slate-900/40 opacity-60"
    }`}>
      {/* Thumbnail */}
      <img
        src={ad.imageUrl}
        alt={ad.title}
        className="h-12 w-20 shrink-0 rounded-lg object-cover border border-slate-700"
        onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/80x48/1e293b/64748b?text=IMG"; }}
      />
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 truncate">{ad.title}</p>
        {ad.subtitle && <p className="text-xs text-slate-400 truncate">{ad.subtitle}</p>}
        {ad.targetUrl && <p className="text-[10px] text-slate-500 truncate">{ad.targetUrl}</p>}
      </div>
      {/* Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Edit */}
        <button
          onClick={openEdit}
          className="rounded-lg p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-950/40 transition-colors"
          title="Edit ad"
        >
          <Pencil size={13} />
        </button>
        {/* Reorder */}
        <div className="flex flex-col gap-0.5">
          <button onClick={() => onMoveUp(ad.id)} disabled={isFirst}
            className="rounded p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-20 transition-colors" title="Move up">▲</button>
          <button onClick={() => onMoveDown(ad.id)} disabled={isLast}
            className="rounded p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-20 transition-colors" title="Move down">▼</button>
        </div>
        {/* Toggle */}
        <button
          onClick={() => onToggle(ad.id, ad.active)}
          className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition-colors ${
            ad.active
              ? "border-green-700 bg-green-900/40 text-green-400 hover:bg-green-900/70"
              : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
          }`}
          title={ad.active ? "Click to deactivate" : "Click to activate"}
        >
          {ad.active ? "Live" : "Off"}
        </button>
        {/* Delete */}
        <button
          onClick={() => onDelete(ad.id)}
          className="rounded-lg p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-950/40 transition-colors"
          title="Delete ad"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

const ROLE_STYLES: Record<string, string> = {
  student:    "bg-blue-900/40 border-blue-700 text-blue-300",
  driver:     "bg-amber-900/40 border-amber-700 text-amber-300",
  admin:      "bg-emerald-900/40 border-emerald-700 text-emerald-300",
  superadmin: "bg-purple-900/40 border-purple-700 text-purple-300",
};

type UserItem = {
  id: number;
  name: string;
  phone: string;
  role: string;
  tenantId: number | null;
  tenantName: string | null;
  createdAt: string;
};

function UserCard({ user: initial, onSave, onDelete }: {
  user: UserItem;
  onSave: (id: number, patch: Partial<UserItem>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [user, setUser] = useState(initial);
  const [eName, setEName] = useState(initial.name);
  const [ePhone, setEPhone] = useState(initial.phone);
  const [eRole, setERole] = useState(initial.role);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");

  function startEdit() {
    setEName(user.name); setEPhone(user.phone); setERole(user.role);
    setErr(""); setEditing(true);
  }
  function cancelEdit() { setErr(""); setEditing(false); }

  async function handleSave() {
    if (!eName.trim() || !ePhone.trim()) { setErr("Name and phone are required."); return; }
    setSaving(true); setErr("");
    try {
      await onSave(user.id, { name: eName.trim(), phone: ePhone.trim(), role: eRole });
      setUser((u) => ({ ...u, name: eName.trim(), phone: ePhone.trim(), role: eRole }));
      setEditing(false);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${user.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await onDelete(user.id); } finally { setDeleting(false); }
  }

  return (
    <div className={`rounded-xl border transition-colors ${editing ? "border-amber-500/50 bg-slate-800/80" : "border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/70"}`}>
      {/* View mode header row */}
      {!editing && (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-amber-400 font-bold text-sm">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user.phone}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ROLE_STYLES[user.role] ?? ROLE_STYLES.student}`}>
            {user.role}
          </span>
          <button onClick={startEdit} className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-950/40 transition-colors" title="Edit">
            <Pencil size={13} />
          </button>
          <button onClick={handleDelete} disabled={deleting} className="shrink-0 rounded-lg p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-50" title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* Edit mode — single column fields */}
      {editing && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Editing {user.name}</p>
            <button onClick={cancelEdit} className="rounded-lg p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
              <X size={13} />
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-400">Full Name</label>
            <input
              value={eName}
              onChange={(e) => setEName(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-400">Phone Number</label>
            <input
              value={ePhone}
              onChange={(e) => setEPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-400">Role</label>
            <select
              value={eRole}
              onChange={(e) => setERole(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500 transition-colors"
            >
              <option value="student">Student</option>
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={cancelEdit} className="flex-1 rounded-xl border border-slate-600 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors">
              <Check size={13} />{saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ROLE_ORDER = ["student", "driver", "admin", "superadmin", "staff"];
const ROLE_LABELS: Record<string, string> = {
  student: "Students", driver: "Drivers", admin: "Admins",
  superadmin: "Superadmins", staff: "Staff",
};
const ROLE_BADGE: Record<string, string> = {
  student:    "bg-blue-900/50 border-blue-700 text-blue-300",
  driver:     "bg-amber-900/50 border-amber-700 text-amber-300",
  admin:      "bg-emerald-900/50 border-emerald-700 text-emerald-300",
  superadmin: "bg-purple-900/50 border-purple-700 text-purple-300",
  staff:      "bg-slate-700/60 border-slate-600 text-slate-300",
};

function SchoolSection({ schoolName, members, onSave, onDelete }: {
  schoolName: string;
  members: UserItem[];
  onSave: (id: number, patch: Partial<UserItem>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();

  // All unique roles present, ordered by ROLE_ORDER then any extras
  const allRoles = Array.from(new Set(members.map((u) => u.role ?? "student")));
  const orderedRoles = ROLE_ORDER.filter((r) => allRoles.includes(r))
    .concat(allRoles.filter((r) => !ROLE_ORDER.includes(r)));

  // Role badge count for the header (always from full members list)
  const roleCount: Record<string, number> = {};
  for (const u of members) {
    const r = u.role ?? "student";
    roleCount[r] = (roleCount[r] ?? 0) + 1;
  }

  // Filtered users per role for the expanded list
  const filteredByRole: Array<{ role: string; users: UserItem[] }> = orderedRoles
    .map((role) => ({
      role,
      users: members.filter(
        (u) =>
          (u.role ?? "student") === role &&
          (!q ||
            u.name.toLowerCase().includes(q) ||
            u.phone.includes(q) ||
            u.role.toLowerCase().includes(q))
      ),
    }))
    .filter((g) => g.users.length > 0);

  const totalVisible = filteredByRole.reduce((s, g) => s + g.users.length, 0);

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      {/* School header row — click to expand */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${open ? "bg-slate-700/60" : "bg-slate-800/50 hover:bg-slate-800"}`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30">
          <Building2 size={14} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{schoolName}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {orderedRoles.map((r) => (
              <span
                key={r}
                className={`rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide ${ROLE_BADGE[r] ?? ROLE_BADGE.staff}`}
              >
                {ROLE_LABELS[r] ?? r}: {roleCount[r]}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            {members.length}
          </span>
          {open
            ? <ChevronDown size={14} className="text-amber-400" />
            : <ChevronRight size={14} className="text-slate-500" />
          }
        </div>
      </button>

      {/* Expanded list grouped by role */}
      {open && (
        <div className="border-t border-slate-700 bg-slate-900/40">
          {members.length > 3 && (
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search size={11} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search in ${schoolName}…`}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-7 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <div className="p-3 space-y-4">
            {totalVisible === 0 ? (
              <p className="py-4 text-center text-xs text-slate-600">No users match your search</p>
            ) : (
              filteredByRole.map(({ role, users }) => (
                <div key={role}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ROLE_BADGE[role] ?? ROLE_BADGE.staff}`}>
                      {ROLE_LABELS[role] ?? role}
                    </span>
                    <span className="text-[10px] text-slate-500">{users.length} {users.length === 1 ? "user" : "users"}</span>
                    <div className="flex-1 h-px bg-slate-800" />
                  </div>
                  <div className="space-y-1.5">
                    {users.map((u) => (
                      <UserCard key={u.id} user={u} onSave={onSave} onDelete={onDelete} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserManager() {
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const fetchedRef = useRef(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/users`);
      const data = await r.json() as UserItem[];
      setAllUsers(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  // Lazy-load: only fetch when the box is opened for the first time
  function handleToggleBox() {
    const opening = !boxOpen;
    setBoxOpen(opening);
    if (opening && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchUsers();
    }
  }

  const handleSave = useCallback(async (id: number, patch: Partial<UserItem>) => {
    const r = await fetch(`${BASE}/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const updated = await r.json() as UserItem;
    if (!r.ok) throw new Error((updated as unknown as { error: string }).error ?? "Failed");
    setAllUsers((prev) => prev.map((u) => u.id === id ? updated : u));
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    const r = await fetch(`${BASE}/api/users/${id}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Delete failed");
    setAllUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

  // Group by school
  const groups = allUsers.reduce<Record<string, UserItem[]>>((acc, u) => {
    const key = u.tenantName ?? "No School / Office";
    if (!acc[key]) acc[key] = [];
    acc[key].push(u);
    return acc;
  }, {});

  // Apply global search: keep only schools that have matching users, but only filter within them
  const filteredGroups = Object.entries(groups).reduce<Record<string, UserItem[]>>((acc, [school, members]) => {
    if (!globalSearch) { acc[school] = members; return acc; }
    const q = globalSearch.toLowerCase();
    const matched = members.filter(
      (u) => u.name.toLowerCase().includes(q) || u.phone.includes(q) || school.toLowerCase().includes(q)
    );
    if (matched.length > 0) acc[school] = matched;
    return acc;
  }, {});

  const totalUsers = allUsers.length;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1e293b] border border-slate-700 shadow-2xl overflow-hidden">
      {/* Top header — always visible, click to open/close */}
      <button
        onClick={handleToggleBox}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-700 border border-slate-600">
          <Users size={16} className="text-slate-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-100 text-sm">User Manager</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {boxOpen
              ? `${totalUsers} users across ${Object.keys(groups).length} school${Object.keys(groups).length !== 1 ? "s" : ""}`
              : "Click to manage platform users by school"}
          </p>
        </div>
        <div className="shrink-0">
          {boxOpen
            ? <ChevronDown size={16} className="text-amber-400" />
            : <ChevronRight size={16} className="text-slate-500" />
          }
        </div>
      </button>

      {/* Expanded content */}
      {boxOpen && (
        <div className="border-t border-slate-700">
          {/* Global search bar */}
          <div className="px-4 py-3 border-b border-slate-800">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search across all schools…"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-8 pr-8 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
              />
              {globalSearch && (
                <button onClick={() => setGlobalSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-200">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* School accordion list */}
          <div className="p-3 space-y-2 max-h-[560px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700">
            {loading ? (
              <p className="py-10 text-center text-sm text-slate-500">Loading users…</p>
            ) : Object.keys(filteredGroups).length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                {globalSearch ? "No users match your search" : "No users found"}
              </p>
            ) : (
              Object.entries(filteredGroups).map(([schoolName, members]) => (
                <SchoolSection
                  key={schoolName}
                  schoolName={schoolName}
                  members={members}
                  onSave={handleSave}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type LiveVehicle = {
  vehicleId: number;
  plateNumber: string;
  model: string;
  capacity: number;
  tag: string | null;
  isActive: boolean;
  isOnline: boolean;
  driverName: string | null;
  driverPhone: string | null;
  lat: number;
  lng: number;
};

type LiveSchool = {
  tenantId: number;
  tenantName: string;
  vehicleCount: number;
  onlineCount: number;
  activeCount: number;
  vehicles: LiveVehicle[];
};

function VehicleStatusDot({ isOnline, isActive }: { isOnline: boolean; isActive: boolean }) {
  if (isOnline) return <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse shrink-0" title="Online – en route" />;
  if (isActive) return <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" title="Active – ready" />;
  return <span className="h-2 w-2 rounded-full bg-slate-600 shrink-0" title="Offline" />;
}

function LiveSchoolCard({ school }: { school: LiveSchool }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${open ? "bg-slate-700/60" : "bg-slate-800/50 hover:bg-slate-800"}`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 border border-slate-600">
          <Bus size={13} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100 truncate">{school.tenantName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {school.onlineCount > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                {school.onlineCount} online
              </span>
            )}
            {school.activeCount > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {school.activeCount} ready
              </span>
            )}
            {school.onlineCount === 0 && school.activeCount === 0 && (
              <span className="text-[9px] text-slate-600">all offline</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            {school.vehicleCount}
          </span>
          {open ? <ChevronDown size={14} className="text-amber-400" /> : <ChevronRight size={14} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-700 bg-slate-900/50">
          <div className="max-h-56 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 p-2 space-y-1.5">
            {school.vehicles.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-600">No vehicles registered</p>
            ) : (
              school.vehicles.map((v) => (
                <div
                  key={v.vehicleId}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    v.isOnline
                      ? "bg-green-950/30 border border-green-800/40"
                      : v.isActive
                      ? "bg-amber-950/20 border border-amber-800/30"
                      : "bg-slate-800/40 border border-slate-700/40"
                  }`}
                >
                  <VehicleStatusDot isOnline={v.isOnline} isActive={v.isActive} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-slate-100 truncate">{v.plateNumber}</p>
                      {v.tag && (
                        <span className="shrink-0 rounded bg-slate-700 px-1 py-0 text-[9px] font-semibold text-slate-400">{v.tag}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">
                      {v.model !== "Unknown" ? v.model : ""}{v.model !== "Unknown" && v.driverName ? " · " : ""}{v.driverName ?? "No driver"}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className={`text-[9px] font-bold uppercase ${v.isOnline ? "text-green-400" : v.isActive ? "text-amber-400" : "text-slate-600"}`}>
                      {v.isOnline ? "Online" : v.isActive ? "Ready" : "Offline"}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${v.lat.toFixed(6)},${v.lng.toFixed(6)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-0.5 text-[9px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                      title={`View on Google Maps (${v.lat.toFixed(4)}, ${v.lng.toFixed(4)})`}
                    >
                      <MapPin size={9} />Maps
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────
interface AdminRegistration {
  id: number;
  schoolName: string;
  contactName: string;
  landline: string;
  email: string;
  adminName: string;
  position: string;
  mobile: string;
  status: string;
  schoolCode: string | null;
  tenantId: number | null;
  rejectionReason: string | null;
  createdAt: string;
}

function PendingRegistrationsPanel() {
  const [regs, setRegs] = useState<AdminRegistration[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchRegs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/superadmin/pending-registrations`);
      const data = await r.json() as AdminRegistration[];
      setRegs(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) fetchRegs(); }, [open, fetchRegs]);

  const pendingCount = regs.filter(r => r.status === "pending_super_admin_approval").length;

  async function approve(id: number) {
    setActing(id);
    try {
      const r = await fetch(`${BASE}/api/superadmin/pending-registrations/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (r.ok) await fetchRegs();
    } catch { /* ignore */ } finally { setActing(null); }
  }

  async function reject(id: number) {
    setActing(id);
    try {
      const r = await fetch(`${BASE}/api/superadmin/pending-registrations/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Application not approved at this time." }),
      });
      if (r.ok) await fetchRegs();
    } catch { /* ignore */ } finally { setActing(null); }
  }

  function copyVerifyLink(reg: AdminRegistration) {
    const link = `${window.location.origin}${BASE}/admin-verify?code=${reg.schoolCode}&mobile=${reg.mobile}`;
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedId(reg.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    pending_super_admin_approval: { label: "Pending", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    approved: { label: "Approved", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    verified_active: { label: "Active", cls: "bg-green-500/20 text-green-300 border-green-500/30" },
    rejected: { label: "Rejected", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1e293b] border border-slate-700 shadow-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-700 hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📋</span>
          <div className="text-left">
            <h2 className="font-bold text-slate-100 text-sm">School Registration Applications</h2>
            <p className="text-xs text-slate-400">Review and approve new school admin registrations</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-500 text-slate-900 text-xs font-black px-2.5 py-0.5 animate-pulse">
              {pendingCount} pending
            </span>
          )}
          <span className={`text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>

      {open && (
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-slate-400">{regs.length} total application{regs.length !== 1 ? "s" : ""}</p>
            <button type="button" onClick={fetchRegs} disabled={loading} className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-40 transition-colors">
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          {regs.length === 0 && !loading && (
            <div className="py-8 text-center text-slate-500 text-sm">No applications yet</div>
          )}

          <div className="space-y-3">
            {regs.map(reg => {
              const st = STATUS_LABEL[reg.status] ?? { label: reg.status, cls: "bg-slate-700 text-slate-300 border-slate-600" };
              const isActing = acting === reg.id;
              return (
                <div key={reg.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-bold text-slate-100 text-sm">{reg.schoolName}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{reg.adminName} · {reg.position}</p>
                    </div>
                    <p className="text-[10px] text-slate-500 shrink-0 mt-0.5">
                      {new Date(reg.createdAt).toLocaleDateString("en-NP", { month: "short", day: "numeric" })}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Contact</p>
                      <p className="text-xs text-slate-300">{reg.contactName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Mobile</p>
                      <p className="text-xs text-slate-300">{reg.mobile}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Landline</p>
                      <p className="text-xs text-slate-300">{reg.landline}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Email</p>
                      <p className="text-xs text-slate-300 truncate">{reg.email}</p>
                    </div>
                  </div>

                  {reg.status === "approved" && reg.schoolCode && (
                    <div className="mb-3 rounded-lg border border-blue-700/40 bg-blue-900/20 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-0.5">School Code (share with admin)</p>
                          <p className="text-sm font-mono font-black text-blue-300 tracking-widest">{reg.schoolCode}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyVerifyLink(reg)}
                          className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                        >
                          {copiedId === reg.id ? "✓ Copied!" : "Copy Link"}
                        </button>
                      </div>
                      {/* Localized email template preview */}
                      {(() => {
                        const verifyLink = `${window.location.origin}${BASE}/admin-verify?code=${reg.schoolCode}&mobile=${reg.mobile}`;
                        const isNepalMobile = /^9[6-8]/.test(reg.mobile);
                        return (
                          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2.5">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1.5">
                              📧 Email that would be sent to {reg.email}
                            </p>
                            {isNepalMobile ? (
                              <div className="space-y-1">
                                <p className="text-xs text-slate-300 leading-relaxed">
                                  <span className="font-semibold text-amber-300">विषय:</span> OrbitTrack — तपाइँको स्कूल भेरिफिकेसन कोड
                                </p>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  प्रिय <span className="text-slate-200">{reg.adminName}</span>, तपाइँको स्कूल <span className="text-slate-200">{reg.schoolName}</span> को दर्ता अनुमोदन भएको छ।
                                </p>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  स्कूल कोड: <span className="font-mono font-bold text-blue-300">{reg.schoolCode}</span>
                                </p>
                                <p className="text-xs text-blue-400 break-all">{verifyLink}</p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-xs text-slate-300 leading-relaxed">
                                  <span className="font-semibold text-amber-300">Subject:</span> OrbitTrack — Your School Verification Code
                                </p>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  Dear <span className="text-slate-200">{reg.adminName}</span>, your school <span className="text-slate-200">{reg.schoolName}</span> has been approved on OrbitTrack.
                                </p>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  School Code: <span className="font-mono font-bold text-blue-300">{reg.schoolCode}</span>
                                </p>
                                <p className="text-xs text-blue-400 break-all">{verifyLink}</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {reg.status === "pending_super_admin_approval" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approve(reg.id)}
                        disabled={isActing}
                        className="flex-1 rounded-lg bg-green-600 hover:bg-green-500 py-2 text-xs font-bold text-white disabled:opacity-40 transition-colors"
                      >
                        {isActing ? "…" : "✓ Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => reject(reg.id)}
                        disabled={isActing}
                        className="flex-1 rounded-lg bg-red-900/50 hover:bg-red-700 border border-red-700/40 py-2 text-xs font-bold text-red-300 disabled:opacity-40 transition-colors"
                      >
                        {isActing ? "…" : "✗ Reject"}
                      </button>
                    </div>
                  )}

                  {reg.status === "rejected" && reg.rejectionReason && (
                    <p className="text-xs text-red-400 italic">Reason: {reg.rejectionReason}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LiveVehiclesPanel() {
  const [schools, setSchools] = useState<LiveSchool[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const fetchedRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/superadmin/live-vehicles`);
      const data = await r.json() as LiveSchool[];
      setSchools(data);
      setLastRefresh(new Date());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  function handleToggle() {
    const opening = !open;
    setOpen(opening);
    if (opening && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchData();
    }
  }

  const totalOnline = schools.reduce((s, sc) => s + sc.onlineCount, 0);
  const totalVehicles = schools.reduce((s, sc) => s + sc.vehicleCount, 0);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1e293b] border border-slate-700 shadow-2xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-700 border border-slate-600">
          <Bus size={16} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-100 text-sm">Live Vehicles</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {open
              ? totalOnline > 0
                ? `${totalOnline} online · ${totalVehicles} total across ${schools.length} school${schools.length !== 1 ? "s" : ""}`
                : `${totalVehicles} vehicles · ${schools.length} school${schools.length !== 1 ? "s" : ""} — none online`
              : "Live status + Google Maps for every school's fleet"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {totalOnline > 0 && open && (
            <span className="flex items-center gap-1 rounded-full bg-green-900/50 border border-green-700 px-2 py-0.5 text-[10px] font-bold text-green-400">
              <Wifi size={9} />{totalOnline} live
            </span>
          )}
          {open ? <ChevronDown size={16} className="text-amber-400" /> : <ChevronRight size={16} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-700">
          {/* Refresh bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/30">
            <p className="text-[10px] text-slate-600">
              {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Loading…"}
            </p>
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-amber-400 hover:bg-amber-950/30 disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Per-school list */}
          <div className="p-3 space-y-2 max-h-[520px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700">
            {loading && schools.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Loading fleet data…</p>
            ) : schools.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">No schools found</p>
            ) : (
              schools.map((sc) => (
                <LiveSchoolCard key={sc.tenantId} school={sc} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TenantAccordion({ tenants, onPlanChange }: {
  tenants: TenantItem[];
  onPlanChange: (id: number, tier: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${open ? "bg-slate-700/50" : "bg-slate-800/40 hover:bg-slate-800/70"}`}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-700 border border-slate-600">
          <Building2 size={13} className="text-slate-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100">Active Tenants</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {tenants.length} school{tenants.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
            {tenants.length}
          </span>
          {open
            ? <ChevronDown size={14} className="text-amber-400" />
            : <ChevronRight size={14} className="text-slate-500" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-700 bg-slate-900/30 p-3 space-y-2">
          {tenants.map((t) => (
            <TenantRow key={t.id} tenant={t} onPlanChange={onPlanChange} />
          ))}
        </div>
      )}
    </div>
  );
}

type PayingUserItem = {
  id: number;
  name: string;
  phone: string | null;
  routeId: number | null;
  routeSubscribedAt: string | null;
  status: string;
  isPaying: boolean;
  isExpired: boolean;
  daysLeft: number | null;
};

type PayingSchool = {
  tenantId: number;
  tenantName: string;
  passengers: PayingUserItem[];
};

function PayingUserRow({ user, onRenew }: { user: PayingUserItem; onRenew: (id: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewed, setRenewed] = useState(false);

  async function handleRenew() {
    setRenewing(true);
    try {
      await onRenew(user.id);
      setRenewed(true);
      setTimeout(() => setRenewed(false), 3000);
    } finally { setRenewing(false); }
  }

  const statusColor = user.isExpired
    ? "bg-red-900/40 border-red-700 text-red-300"
    : (user.daysLeft ?? 30) <= 5
    ? "bg-orange-900/40 border-orange-600 text-orange-300"
    : "bg-green-900/40 border-green-700 text-green-300";

  const statusLabel = user.isExpired
    ? "Expired"
    : user.isPaying
    ? `${user.daysLeft}d left`
    : "No sub";

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${open ? "bg-slate-700/60" : "bg-slate-800/50 hover:bg-slate-800"}`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-amber-400 font-bold text-sm">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{user.name}</p>
          <p className="text-[10px] text-slate-500">{user.phone ?? "No phone"}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusColor}`}>
          {statusLabel}
        </span>
        {open ? <ChevronDown size={13} className="text-amber-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-500 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-slate-700 bg-slate-900/60 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-500 mb-0.5">Status</p>
              <p className={`font-semibold ${user.isExpired ? "text-red-400" : "text-green-400"}`}>
                {user.isExpired ? "Expired" : "Active"}
              </p>
            </div>
            <div>
              <p className="text-slate-500 mb-0.5">Route ID</p>
              <p className="text-slate-200 font-semibold">#{user.routeId ?? "—"}</p>
            </div>
            <div>
              <p className="text-slate-500 mb-0.5">Subscribed</p>
              <p className="text-slate-200">
                {user.routeSubscribedAt
                  ? new Date(user.routeSubscribedAt).toLocaleDateString("en-NP", { day: "numeric", month: "short", year: "numeric" })
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500 mb-0.5">Days Remaining</p>
              <p className={`font-bold ${user.isExpired ? "text-red-400" : (user.daysLeft ?? 30) <= 5 ? "text-orange-400" : "text-green-400"}`}>
                {user.isExpired ? "Expired" : `${user.daysLeft ?? "—"} days`}
              </p>
            </div>
          </div>

          {user.isExpired && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2">
              <AlertTriangle size={12} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-300">Subscription expired — student cannot see GPS tracking</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleRenew}
              disabled={renewing || renewed}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-60 transition-colors"
            >
              {renewing ? (
                <><RefreshCw size={12} className="animate-spin" /> Renewing…</>
              ) : renewed ? (
                <><CheckCircle size={12} /> Renewed!</>
              ) : (
                <><RotateCcw size={12} /> Renew 30 Days</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PayingUsersPanel() {
  const [open, setOpen] = useState(false);
  const [schools, setSchools] = useState<PayingSchool[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<number | "all">("all");
  const [filter, setFilter] = useState<"all" | "paying" | "expired">("all");
  const fetchedRef = useRef(false);

  async function fetchPayingUsers() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/superadmin/paying-users`);
      const data = await r.json() as PayingSchool[];
      setSchools(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleRenew(passengerId: number) {
    await fetch(`${BASE}/api/passengers/${passengerId}/renew`, { method: "POST" });
    await fetchPayingUsers();
  }

  function handleToggle() {
    const opening = !open;
    setOpen(opening);
    if (opening && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchPayingUsers();
    }
  }

  const allPassengers = schools.flatMap((s) => s.passengers.map((p) => ({ ...p, tenantName: s.tenantName, tenantId: s.tenantId })));
  const filteredByTenant = selectedTenant === "all" ? allPassengers : allPassengers.filter((p) => p.tenantId === selectedTenant);
  const filtered = filteredByTenant.filter((p) => {
    if (filter === "paying") return p.isPaying;
    if (filter === "expired") return p.isExpired;
    return true;
  });

  const payingCount = allPassengers.filter((p) => p.isPaying).length;
  const expiredCount = allPassengers.filter((p) => p.isExpired).length;
  const totalCount = allPassengers.length;

  const FILTER_TABS: { id: "all" | "paying" | "expired"; label: string; color: string }[] = [
    { id: "all", label: `All (${totalCount})`, color: "bg-slate-700 text-slate-200" },
    { id: "paying", label: `Active (${payingCount})`, color: "bg-green-900/60 text-green-300 border-green-700" },
    { id: "expired", label: `Expired (${expiredCount})`, color: "bg-red-900/60 text-red-300 border-red-700" },
  ];

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1e293b] border border-slate-700 shadow-2xl overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30">
          <CreditCard size={16} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-100 text-sm">Paying Users</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {open
              ? `${totalCount} users with routes · ${payingCount} active · ${expiredCount} expired`
              : "Click to view student subscription status across all schools"}
          </p>
        </div>
        <div className="shrink-0">
          {open
            ? <ChevronDown size={16} className="text-blue-400" />
            : <ChevronRight size={16} className="text-slate-500" />
          }
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-700">
          {/* Controls */}
          <div className="px-4 py-3 space-y-3 border-b border-slate-800">
            {/* School filter */}
            <div className="flex items-center gap-2">
              <Building2 size={12} className="text-slate-500 shrink-0" />
              <select
                value={selectedTenant === "all" ? "all" : String(selectedTenant)}
                onChange={(e) => setSelectedTenant(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500"
              >
                <option value="all">All Schools ({schools.length})</option>
                {schools.map((s) => (
                  <option key={s.tenantId} value={s.tenantId}>
                    {s.tenantName} ({s.passengers.length})
                  </option>
                ))}
              </select>
              <button onClick={() => { fetchedRef.current = false; fetchPayingUsers(); }}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors" title="Refresh">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-1.5">
              {FILTER_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={`flex-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors ${
                    filter === t.id
                      ? t.color + " border-transparent ring-1 ring-blue-500/50"
                      : "border-slate-700 bg-slate-800/50 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* User list */}
          <div className="p-3 space-y-2 max-h-[480px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700">
            {loading ? (
              <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                {totalCount === 0 ? "No students have selected a route yet" : "No users match this filter"}
              </p>
            ) : (
              filtered.map((user) => (
                <PayingUserRow key={user.id} user={user} onRenew={handleRenew} />
              ))
            )}
          </div>

          {filtered.length > 0 && (
            <div className="border-t border-slate-800 px-5 py-3">
              <p className="text-xs text-slate-500">{filtered.length} user{filtered.length !== 1 ? "s" : ""} shown</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SuperadminPortal() {
  const { data: stats } = useGetDashboardStats();
  const { data: tenants } = useListTenants();

  const [ads, setAds] = useState<Ad[]>([]);
  const [adsLoading, setAdsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formTargetUrl, setFormTargetUrl] = useState("");
  const [formErr, setFormErr] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const fetchAds = useCallback(async () => {
    setAdsLoading(true);
    try {
      const data = await apiReq("GET", "/advertisements?showAll=true");
      setAds(data);
    } catch { /* ignore */ }
    finally { setAdsLoading(false); }
  }, []);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  const handleToggle = useCallback(async (id: number, current: number) => {
    try {
      await apiReq("PATCH", `/advertisements/${id}`, { active: current ? 0 : 1 });
      setAds((prev) => prev.map((a) => a.id === id ? { ...a, active: current ? 0 : 1 } : a));
    } catch { /* ignore */ }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Delete this ad permanently?")) return;
    try {
      await apiReq("DELETE", `/advertisements/${id}`);
      setAds((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ }
  }, []);

  const handleSaveAd = useCallback(async (id: number, patch: Partial<Ad>) => {
    const updated = await apiReq("PATCH", `/advertisements/${id}`, patch);
    setAds((prev) => prev.map((a) => a.id === id ? { ...a, ...updated } : a));
  }, []);

  const handleMove = useCallback(async (id: number, dir: "up" | "down") => {
    setAds((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      if (idx < 0) return prev;
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      // Persist new sortOrders
      next.forEach((ad, i) => {
        apiReq("PATCH", `/advertisements/${ad.id}`, { sortOrder: i + 1 }).catch(() => null);
      });
      return next.map((ad, i) => ({ ...ad, sortOrder: i + 1 }));
    });
  }, []);

  const handleAddAd = useCallback(async () => {
    setFormErr(""); setFormLoading(true);
    try {
      const newAd = await apiReq("POST", "/advertisements", {
        title: formTitle,
        subtitle: formSubtitle || undefined,
        imageUrl: formImageUrl,
        targetUrl: formTargetUrl || undefined,
        sortOrder: ads.length + 1,
      });
      setAds((prev) => [...prev, newAd]);
      setShowAddForm(false);
      setFormTitle(""); setFormSubtitle(""); setFormImageUrl(""); setFormTargetUrl("");
    } catch (e: unknown) { setFormErr(e instanceof Error ? e.message : "Failed"); }
    finally { setFormLoading(false); }
  }, [formTitle, formSubtitle, formImageUrl, formTargetUrl, ads.length]);

  const handlePlanChange = useCallback(async (id: number, tier: string) => {
    await apiReq("PATCH", `/tenants/${id}`, { subscriptionTier: tier });
  }, []);

  const liveCount = ads.filter((a) => a.active).length;

  return (
    <div className="mx-auto w-full max-w-[700px] p-4 sm:p-6 space-y-5">

      {/* Dark themed stats card */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1e293b] p-6 text-white shadow-2xl border border-slate-700">
        <header className="mb-6 flex items-center gap-3 border-b border-slate-700 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 shadow">
            <Shield size={20} className="text-slate-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">SuperAdmin</h1>
            <p className="text-xs text-slate-400">Global Platform Overview</p>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
          {[
            { label: "Tenants",    value: stats?.totalTenants ?? 0, Icon: Building2, color: "text-slate-100" },
            { label: "Passengers", value: stats?.totalPassengers ?? 0, Icon: Users, color: "text-blue-300" },
            { label: "API Pings",  value: stats?.whatsappSmsPings ?? 0, Icon: Radio, color: "text-amber-300" },
            { label: "MRR (NPR)",  value: `${(stats?.monthlyMrr ?? 0).toLocaleString()}`, Icon: Banknote, color: "text-emerald-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-800/70 border border-slate-700 p-4">
              <s.Icon size={20} className="mb-1 text-slate-400" />
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Subscription breakdown */}
        {stats?.subscriptionBreakdown && (
          <div className="mb-6 rounded-xl bg-slate-800/50 border border-slate-700 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Subscription Tiers</p>
            <div className="flex gap-4">
              {Object.entries(stats.subscriptionBreakdown).map(([tier, count]) => (
                <div key={tier} className="flex-1 text-center">
                  <p className="text-lg font-bold text-slate-100">{count as number}</p>
                  <p className="text-xs text-slate-400 capitalize">{tier}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tenant Table — collapsible */}
        <TenantAccordion tenants={tenants ?? []} onPlanChange={handlePlanChange} />
      </div>

      {/* User Manager */}
      <UserManager />

      {/* School Registration Applications */}
      <PendingRegistrationsPanel />

      {/* Live Vehicles by School */}
      <LiveVehiclesPanel />

      {/* Paying Users Panel */}
      <PayingUsersPanel />

      {/* Ad Carousel Manager */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1e293b] border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <Megaphone size={18} className="text-slate-300 shrink-0" />
              <h2 className="font-bold text-slate-100">Ad Carousel Manager</h2>
              <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-xs font-semibold text-amber-400">
                {liveCount} Live
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Manage banners shown on all dashboards · drag ▲▼ to reorder</p>
          </div>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setFormErr(""); }}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-400 transition-colors shrink-0"
          >
            {showAddForm ? "✕ Cancel" : "+ New Ad"}
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="border-b border-slate-700 bg-slate-900/60 p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">New Banner Ad</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">School / Ad Title *</label>
                <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Sunrise Academy"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-400">Subtitle / Tagline</label>
                <input value={formSubtitle} onChange={(e) => setFormSubtitle(e.target.value)} placeholder="Admissions Open 2081"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Banner Image *</label>
              <div className="flex gap-2">
                <input value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} placeholder="https://images.unsplash.com/… or upload →"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500" />
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-600 transition-colors">
                  <Upload size={13} />Upload
                  <input type="file" accept="image/*" className="hidden"
                    onChange={async (e) => { const f = e.target.files?.[0]; if (f) setFormImageUrl(await fileToDataUrl(f)); e.target.value = ""; }} />
                </label>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-400">Target URL (click destination)</label>
              <input value={formTargetUrl} onChange={(e) => setFormTargetUrl(e.target.value)} placeholder="/school/6 or https://..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500" />
            </div>
            {/* Preview */}
            {formImageUrl && (
              <div className="relative h-24 w-full overflow-hidden rounded-xl border border-slate-700">
                <img src={formImageUrl} alt="preview" className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/600x96/1e293b/64748b?text=Invalid+URL"; }} />
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent flex items-center px-4">
                  <div>
                    <p className="text-sm font-bold text-white">{formTitle || "Ad Title"}</p>
                    {formSubtitle && <p className="text-xs text-slate-300">{formSubtitle}</p>}
                  </div>
                </div>
                <span className="absolute top-2 right-2 rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-bold text-white">PREVIEW</span>
              </div>
            )}
            {formErr && <p className="text-xs text-red-400">{formErr}</p>}
            <button
              onClick={handleAddAd}
              disabled={!formTitle || !formImageUrl || formLoading}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {formLoading ? "Publishing…" : "Publish Banner Ad"}
            </button>
          </div>
        )}

        {/* Ad List */}
        <div className="p-4 space-y-2">
          {adsLoading ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading ads…</div>
          ) : ads.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No ads yet. Add the first one above.</div>
          ) : (
            ads.map((ad, idx) => (
              <AdRow
                key={ad.id}
                ad={ad}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onSave={handleSaveAd}
                onMoveUp={(id) => handleMove(id, "up")}
                onMoveDown={(id) => handleMove(id, "down")}
                isFirst={idx === 0}
                isLast={idx === ads.length - 1}
              />
            ))
          )}
        </div>

        {ads.length > 0 && (
          <div className="border-t border-slate-800 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">{ads.length} total · {liveCount} live on carousel</p>
            <p className="text-[10px] text-slate-600">Changes save instantly</p>
          </div>
        )}
      </div>
    </div>
  );
}
