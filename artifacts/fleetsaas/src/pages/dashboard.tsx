import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Bus, Globe, Phone, Building2, Sun, Moon, Upload, Camera, Copy, Check } from "lucide-react";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { useLang, useT, LANGUAGES } from "@/lib/i18n";
import StudentPortal from "@/components/portals/student-portal";
import DriverPortal from "@/components/portals/driver-portal";
import AdminPortal from "@/components/portals/admin-portal";
import SuperadminPortal from "@/components/portals/superadmin-portal";
import PaywallModal from "@/components/paywall-modal";
import AppFooter from "@/components/app-footer";
import { useGetMySubscription } from "@workspace/api-client-react";

type Role = "student" | "driver" | "admin" | "superadmin";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Ad = { id: number; title: string; subtitle?: string | null; imageUrl: string; targetUrl?: string | null; };
type TenantInfo = { id: number; name: string; bannerUrl?: string | null; address?: string | null; contactPhone?: string | null; schoolCode?: string | null; };

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
            className={`relative shrink-0 w-[280px] sm:w-[320px] rounded-2xl overflow-hidden snap-center transition-all cursor-pointer ${i === idx ? "ring-2 ring-amber-500 shadow-lg shadow-amber-500/20" : "opacity-80 hover:opacity-100"}`}
          >
            <img src={ad.imageUrl} alt={ad.title} className="h-36 w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
              <p className="font-bold text-white text-sm leading-tight">{ad.title}</p>
              {ad.subtitle && <p className="text-xs text-slate-300 mt-0.5 leading-snug">{ad.subtitle}</p>}
              {ad.targetUrl && (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-300">
                  <Globe size={9} />Visit →
                </p>
              )}
            </div>
            <div className="absolute top-2 right-2 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold text-slate-900">AD</div>
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
  user, onClose, onSave, dark, onToggleDark,
}: {
  user: AuthUser;
  onClose: () => void;
  onSave: (updated: AuthUser) => void;
  dark: boolean;
  onToggleDark: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title ?? "");
  const [photo, setPhoto] = useState(user.photoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { lang, setLang } = useLang();
  const t = useT();
  const { logout } = useAuth();
  const [, navigate] = useLocation();

  const avatarSrc = photo ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=0F172A&textColor=D97706`;

  async function handleSave() {
    if (!name.trim()) { setErr(t.nameRequired); return; }
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

  const currentLang = LANGUAGES.find((l) => l.code === lang);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <h2 className="text-base font-bold text-foreground">{t.myProfile}</h2>
            <div className="flex items-center gap-2">
              {!editing && (
                <button onClick={() => setEditing(true)}
                  className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-400 transition-colors">
                  {t.edit}
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

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <img src={avatarSrc} alt={user.name}
                  className="h-20 w-20 rounded-full border-4 border-amber-500 object-cover shadow-lg" />
                {editing && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    <button onClick={() => galleryRef.current?.click()}
                      title="Upload from gallery"
                      className="flex items-center gap-1 rounded-lg bg-card border border-border shadow px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <Upload size={10} className="shrink-0" /> <span>Gallery</span>
                    </button>
                    <button onClick={() => cameraRef.current?.click()}
                      title="Take a photo"
                      className="flex items-center gap-1 rounded-lg bg-card border border-border shadow px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <Camera size={10} className="shrink-0" /> <span>Camera</span>
                    </button>
                  </div>
                )}
              </div>
              {editing && photo && (
                <button onClick={() => setPhoto("")} className="text-xs text-red-500 hover:text-red-400">{t.removePhoto}</button>
              )}
            </div>

            {/* Fields */}
            <div className="space-y-3">
              {editing ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t.titleLabel}</label>
                      <select value={title} onChange={(e) => setTitle(e.target.value)}
                        className="w-full rounded-xl border border-border bg-muted px-2 py-2.5 text-sm text-foreground outline-none focus:border-amber-500">
                        {TITLES.map((tt) => <option key={tt} value={tt}>{tt || "—"}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t.fullName}</label>
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
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={11} />{t.phone}</span>
                  <span className="text-sm font-medium text-foreground">{user.phone}</span>
                </div>
                {user.schoolCode && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 size={11} />{t.schoolCode}</span>
                    <span className="text-sm font-mono font-bold text-[#FFF078]">{user.schoolCode}</span>
                  </div>
                )}
                {user.tenant?.name && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 size={11} />{t.school}</span>
                    <span className="text-sm font-medium text-foreground">{user.tenant.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Dark Mode toggle */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">{dark ? <Sun size={13} /> : <Moon size={13} />} {dark ? "Light Mode" : "Dark Mode"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{dark ? "Switch to light theme" : "Switch to dark theme"}</p>
              </div>
              <button
                onClick={onToggleDark}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${dark ? "bg-amber-500" : "bg-muted"}`}
                role="switch"
                aria-checked={dark}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${dark ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>

            {/* Language picker — compact trigger */}
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Globe size={12} />{t.appLanguage}</p>
              <button
                onClick={() => setLangPickerOpen(true)}
                className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:border-amber-500 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Globe size={20} className="text-muted-foreground shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">{currentLang?.native ?? "English"}</p>
                    <p className="text-xs text-muted-foreground">{currentLang?.name ?? "English"}</p>
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-[#FFF078] transition-colors text-xs">▼</span>
              </button>
            </div>

            {err && <p className="text-xs text-red-500">{err}</p>}

            {editing && (
              <div className="flex gap-2">
                <button onClick={() => { setEditing(false); setName(user.name); setTitle(user.title ?? ""); setPhoto(user.photoUrl ?? ""); setErr(""); }}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
                  {t.cancel}
                </button>
                <button onClick={handleSave} disabled={saving || !name.trim()}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                  {saving ? t.saving : t.saveChanges}
                </button>
              </div>
            )}

            {/* Sign Out */}
            <div className="pt-1 pb-3">
              <button
                onClick={() => { logout(); navigate("/"); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 py-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                </svg>
                {t.signOut}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Language picker bottom sheet — z above the profile panel */}
      {langPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setLangPickerOpen(false); }}>
          <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl flex flex-col max-h-[70dvh] animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Globe size={16} />{t.selectLanguage}</h2>
              <button onClick={() => setLangPickerOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 text-sm">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-border">
              {LANGUAGES.map((l) => (
                <button key={l.code}
                  onClick={() => { setLang(l.code); setLangPickerOpen(false); }}
                  className={`w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors ${
                    lang === l.code ? "bg-amber-50 dark:bg-amber-950/20" : "hover:bg-muted/40"
                  }`}>
                  <div>
                    <p className={`text-sm font-semibold ${lang === l.code ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                      {l.native}
                    </p>
                    <p className="text-xs text-muted-foreground">{l.name}</p>
                  </div>
                  {lang === l.code && <span className="text-[#FFF078] font-bold text-base">✓</span>}
                </button>
              ))}
            </div>
            <div className="pb-6 shrink-0" />
          </div>
        </div>
      )}
    </>
  );
}

function SchoolCodeWidget({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5">
      <div className="hidden sm:block">
        <p className="text-[9px] font-bold text-[#FFF078] uppercase tracking-wide leading-none mb-0.5">School Code</p>
        <p className="text-xs font-black text-foreground font-mono tracking-wider leading-none">{code}</p>
      </div>
      <p className="block sm:hidden text-xs font-black text-foreground font-mono tracking-wider">{code}</p>
      <button
        onClick={handleCopy}
        title="Copy school code"
        className="ml-1 rounded-md p-1 hover:bg-amber-500/20 transition-colors text-[#FFF078]"
      >
        {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function SchoolBanner({ tenant }: { tenant: TenantInfo }) {
  if (!tenant.bannerUrl) return null;
  return (
    <div className="mx-4 mt-3 mb-1 rounded-xl overflow-hidden border border-amber-500/30 dark:border-amber-600/20 shadow-lg shadow-slate-900/20 ring-1 ring-[#0F172A]/10 dark:ring-[#D97706]/10">
      <div className="relative w-full" style={{ height: 148 }}>
        <img src={tenant.bannerUrl} alt={tenant.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A]/70 via-[#0F172A]/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
          <div>
            <p className="text-base font-black text-white leading-tight drop-shadow">{tenant.name}</p>
            {tenant.address && <p className="text-xs text-slate-300 mt-0.5">{tenant.address}</p>}
            {tenant.contactPhone && <p className="text-xs text-amber-300 font-semibold mt-0.5">{tenant.contactPhone}</p>}
          </div>
          <div className="shrink-0 rounded-lg bg-amber-500/20 border border-amber-500/40 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Official</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout, login } = useAuth();
  const [, navigate] = useLocation();
  const t = useT();
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
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500"><Bus size={15} className="text-slate-900" /></span>
              <span className="font-black text-primary text-sm">
                Orbit<span className="text-[#FFF078]">Track</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {userRole === "admin" && (tenant?.schoolCode || user?.tenant?.schoolCode) && (
                <SchoolCodeWidget code={(tenant?.schoolCode ?? user?.tenant?.schoolCode)!} />
              )}
              <button onClick={() => setProfileOpen(true)}
                className="relative rounded-full ring-2 ring-amber-500 hover:ring-amber-400 transition-all focus:outline-none"
                title="My Profile">
                <img src={avatarSrc} alt={user?.name} className="h-8 w-8 rounded-full object-cover shrink-0" />
              </button>
            </div>
          </div>
        </header>

        {/* School Banner — premium institutional poster at top */}
        {(tenant?.bannerUrl || user?.tenant?.bannerUrl) && (
          <SchoolBanner tenant={tenant ?? user!.tenant!} />
        )}

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

        {/* Ad Carousel — pushed below welcome bar; only for students/staff and superadmin */}
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

        <AppFooter />

        {subscription?.paywallActive && <PaywallModal subscription={subscription} />}

        {profileOpen && user && (
          <ProfilePanel
            user={user}
            onClose={() => setProfileOpen(false)}
            onSave={(updated) => {
              login(updated);
              setProfileOpen(false);
            }}
            dark={dark}
            onToggleDark={() => setDark((d) => !d)}
          />
        )}
      </div>
    </div>
  );
}
