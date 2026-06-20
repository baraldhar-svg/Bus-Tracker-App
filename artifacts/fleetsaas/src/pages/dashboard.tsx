import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { useLang, LANGUAGES } from "@/lib/i18n";
import StudentPortal from "@/components/portals/student-portal";
import DriverPortal from "@/components/portals/driver-portal";
import AdminPortal from "@/components/portals/admin-portal";
import SuperadminPortal from "@/components/portals/superadmin-portal";
import PaywallModal from "@/components/paywall-modal";
import { useGetMySubscription } from "@workspace/api-client-react";

type Role = "student" | "driver" | "admin" | "superadmin";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Ad = { id: number; title: string; subtitle?: string | null; imageUrl: string; targetUrl?: string | null; };
type TenantInfo = { id: number; name: string; bannerUrl?: string | null; address?: string | null; contactPhone?: string | null; };

function AdCarousel({ ads, onAdClick }: { ads: Ad[]; onAdClick: (ad: Ad) => void }) {
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);

  // Auto-advance index
  useEffect(() => {
    const interval = setInterval(() => {
      setIdx((i) => (i + 1) % ads.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [ads.length]);

  // Scroll carousel container only — never the page
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isUserScrolling.current) return;
    const child = el.children[idx] as HTMLElement | undefined;
    if (!child) return;
    const targetLeft = child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2;
    el.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [idx]);

  return (
    <div className="relative w-full select-none">
      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Featured Schools</p>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto px-4 pb-3 snap-x snap-mandatory scrollbar-hide"
        onPointerDown={() => { isUserScrolling.current = true; }}
        onPointerUp={() => { setTimeout(() => { isUserScrolling.current = false; }, 600); }}
      >
        {ads.map((ad, i) => (
          <button
            key={ad.id}
            onClick={() => onAdClick(ad)}
            className={`relative shrink-0 w-[280px] sm:w-[320px] rounded-2xl overflow-hidden snap-center transition-all ${i === idx ? "ring-2 ring-amber-500 shadow-lg shadow-amber-500/20" : "opacity-80"}`}
          >
            <img src={ad.imageUrl} alt={ad.title} className="h-36 w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
              <p className="font-bold text-white text-sm leading-tight">{ad.title}</p>
              {ad.subtitle && <p className="text-xs text-slate-300 mt-0.5 leading-snug">{ad.subtitle}</p>}
            </div>
            <div className="absolute top-2 right-2 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold text-slate-900">AD</div>
            {ad.targetUrl && (
              <div className="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] text-white flex items-center gap-0.5">
                <span>🌐</span>
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 pb-1">
        {ads.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-amber-500" : "w-1.5 bg-border"}`} />
        ))}
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TITLES = ["", "Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];

function ProfilePanel({
  user, onClose, onSave,
}: {
  user: AuthUser;
  onClose: () => void;
  onSave: (updated: AuthUser) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title ?? "");
  const [photo, setPhoto] = useState(user.photoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { lang, setLang } = useLang();

  const avatarSrc = photo ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=0F172A&textColor=D97706`;

  async function handleSave() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${BASE}/api/auth/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: name.trim(), title: title || null, photoUrl: photo || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onSave({ ...user, name: data.name, title: data.title, photoUrl: data.photoUrl });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-bold text-foreground">My Profile</h2>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)}
                className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-400 transition-colors">
                Edit
              </button>
            )}
            <button onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 text-sm">
              ✕
            </button>
          </div>
        </div>

        {/* Hidden file inputs */}
        <input ref={galleryRef} type="file" accept="image/*" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await fileToDataUrl(f)); }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await fileToDataUrl(f)); }} />

        <div className="px-5 py-5 space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <img src={avatarSrc} alt={user.name}
                className="h-20 w-20 rounded-full border-4 border-amber-500 object-cover shadow-lg" />
              {editing && (
                <div className="absolute -bottom-1 -right-1 flex gap-1">
                  <button onClick={() => galleryRef.current?.click()}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-card border border-border shadow text-sm hover:bg-muted">📁</button>
                  <button onClick={() => cameraRef.current?.click()}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-card border border-border shadow text-sm hover:bg-muted">📷</button>
                </div>
              )}
            </div>
            {editing && photo && (
              <button onClick={() => setPhoto("")} className="text-xs text-red-500 hover:text-red-400">Remove photo</button>
            )}
          </div>

          {/* Fields */}
          <div className="space-y-3">
            {editing ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">Title</label>
                    <select value={title} onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted px-2 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                      {TITLES.map((t) => <option key={t} value={t}>{t || "—"}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">Full Name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-amber-500" />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{user.title ? `${user.title} ` : ""}{user.name}</p>
                <span className="inline-block rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase mt-1">
                  {user.role}
                </span>
              </div>
            )}

            {/* Read-only info */}
            <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-muted-foreground">📞 Phone</span>
                <span className="text-sm font-medium text-foreground">{user.phone}</span>
              </div>
              {user.schoolCode && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-muted-foreground">🏫 School Code</span>
                  <span className="text-sm font-mono font-bold text-amber-500">{user.schoolCode}</span>
                </div>
              )}
              {user.tenant?.name && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-muted-foreground">🏫 School</span>
                  <span className="text-sm font-medium text-foreground">{user.tenant.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Language picker — always visible */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🌐 App Language</p>
            <div className="grid grid-cols-4 gap-1.5">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`rounded-xl border py-2 px-1 text-center transition-all ${
                    lang === l.code
                      ? "border-amber-500 bg-amber-500/10 text-amber-500 font-bold"
                      : "border-border text-muted-foreground hover:border-amber-400 hover:text-foreground"
                  }`}
                >
                  <p className="text-[11px] font-medium leading-tight truncate">{l.native}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{l.name}</p>
                </button>
              ))}
            </div>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}

          {editing && (
            <div className="flex gap-2 pb-2">
              <button onClick={() => { setEditing(false); setName(user.name); setTitle(user.title ?? ""); setPhoto(user.photoUrl ?? ""); setErr(""); }}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !name.trim()}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SchoolBanner({ tenant }: { tenant: TenantInfo }) {
  if (!tenant.bannerUrl) return null;
  return (
    <div className="relative w-full overflow-hidden" style={{ maxHeight: 140 }}>
      <img src={tenant.bannerUrl} alt={tenant.name} className="w-full object-cover" style={{ height: 140 }} />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-end p-4">
        <div>
          <p className="text-base font-bold text-white leading-tight">{tenant.name}</p>
          {tenant.address && <p className="text-xs text-slate-300">{tenant.address}</p>}
          {tenant.contactPhone && <p className="text-xs text-amber-300 font-medium">{tenant.contactPhone}</p>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout, login } = useAuth();
  const [, navigate] = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem("fleetDark") === "1");
  const [profileOpen, setProfileOpen] = useState(false);
  const [ads, setAds] = useState<Ad[]>([]);
  const [tenant, setTenant] = useState<TenantInfo | null>(user?.tenant ?? null);
  const { data: subscription } = useGetMySubscription();

  // Derive single role from logged-in user
  const userRole: Role = (() => {
    if (user?.role === "admin") return "admin";
    if (user?.role === "driver") return "driver";
    if (user?.role === "superadmin") return "superadmin";
    return "student";
  })();

  useEffect(() => { localStorage.setItem("fleetDark", dark ? "1" : "0"); }, [dark]);

  useEffect(() => {
    fetch(`${BASE}/api/advertisements`)
      .then((r) => r.json())
      .then((data: Ad[]) => setAds(data))
      .catch(() => {});
  }, []);

  // Fetch tenant banner if user has a tenantId but no tenant info yet
  useEffect(() => {
    if (user?.tenantId && !tenant) {
      fetch(`${BASE}/api/tenants/me`)
        .then((r) => r.json())
        .then((data: TenantInfo) => setTenant(data))
        .catch(() => {});
    }
  }, [user?.tenantId, tenant]);

  const handleAdClick = useCallback((ad: Ad) => {
    if (!ad.targetUrl) return;
    // External URLs open in new tab
    if (ad.targetUrl.startsWith("http://") || ad.targetUrl.startsWith("https://")) {
      window.open(ad.targetUrl, "_blank", "noopener,noreferrer");
    } else {
      navigate(ad.targetUrl);
    }
  }, [navigate]);

  const ROLE_LABELS: Record<Role, string> = {
    student: "Student / Staff",
    driver: "Driver",
    admin: "Admin",
    superadmin: "Superadmin",
  };

  const avatarSrc = user?.photoUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.name ?? "U")}&backgroundColor=0F172A&textColor=D97706`;

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">

        {/* Top Bar */}
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur shadow-sm">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-[15px]">🚌</span>
              <span className="font-black text-primary text-sm">
                Orbit<span className="text-amber-500">Track</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setDark((d) => !d)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-base hover:bg-muted/70 transition-colors">
                {dark ? "☀️" : "🌙"}
              </button>
              <button onClick={() => setProfileOpen(true)}
                className="relative rounded-full ring-2 ring-amber-500 hover:ring-amber-400 transition-all focus:outline-none"
                title="My Profile">
                <img src={avatarSrc} alt={user?.name} className="h-8 w-8 rounded-full object-cover shrink-0" />
              </button>
              <button onClick={() => { logout(); navigate("/"); }}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors">
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Welcome bar */}
        {user && (
          <div className="border-b border-border bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {user.title ? `${user.title} ` : ""}{user.name}
            </span>
            <span className="rounded-full bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">
              {user.role}
            </span>
            {(tenant?.name || user.tenant?.name) && (
              <span className="text-xs text-muted-foreground">· {tenant?.name ?? user.tenant?.name}</span>
            )}
          </div>
        )}

        {/* School Banner — shown for all users with a tenant */}
        {(tenant?.bannerUrl || user?.tenant?.bannerUrl) && (
          <SchoolBanner tenant={tenant ?? user!.tenant!} />
        )}

        {/* Ad Carousel — only for students/staff and superadmin */}
        {ads.length > 0 && (userRole === "student" || userRole === "superadmin") && (
          <div className="border-b border-border bg-card overflow-hidden">
            <AdCarousel ads={ads} onAdClick={handleAdClick} />
          </div>
        )}

        {/* Main Portal */}
        <main className="flex-1 bg-background">
          {userRole === "student" && <StudentPortal />}
          {userRole === "driver" && <DriverPortal />}
          {userRole === "admin" && <AdminPortal />}
          {userRole === "superadmin" && <SuperadminPortal />}
        </main>

        {subscription?.paywallActive && <PaywallModal subscription={subscription} />}

        {profileOpen && user && (
          <ProfilePanel
            user={user}
            onClose={() => setProfileOpen(false)}
            onSave={(updated) => {
              login(updated);
              setProfileOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
