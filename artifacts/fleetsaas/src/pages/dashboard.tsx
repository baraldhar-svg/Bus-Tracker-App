import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem("fleetDark") === "1");
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
              <img src={avatarSrc} alt={user?.name} className="h-8 w-8 rounded-full border-2 border-amber-500 object-cover shrink-0" />
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
      </div>
    </div>
  );
}
