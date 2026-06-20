import { useState, useEffect, useRef } from "react";
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

function AdCarousel({ ads, onAdClick }: { ads: Ad[]; onAdClick: (ad: Ad) => void }) {
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setIdx((i) => (i + 1) % ads.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [ads.length]);

  useEffect(() => {
    if (scrollRef.current) {
      const child = scrollRef.current.children[idx] as HTMLElement;
      child?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [idx]);

  return (
    <div className="relative w-full">
      <p className="px-4 pt-3 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Featured Schools</p>
      {/* Carousel */}
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto px-4 pb-3 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: "none" }}>
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
          </button>
        ))}
      </div>
      {/* Dots */}
      <div className="flex justify-center gap-1.5 pb-1">
        {ads.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-amber-500" : "w-1.5 bg-border"}`} />
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [role, setRole] = useState<Role>(() => {
    if (user?.role === "admin") return "admin";
    if (user?.role === "driver") return "driver";
    if (user?.role === "superadmin") return "superadmin";
    return "student";
  });
  const [dark, setDark] = useState(() => localStorage.getItem("fleetDark") === "1");
  const [ads, setAds] = useState<Ad[]>([]);
  const { data: subscription } = useGetMySubscription();

  useEffect(() => {
    localStorage.setItem("fleetDark", dark ? "1" : "0");
  }, [dark]);

  useEffect(() => {
    fetch(`${BASE}/api/advertisements`)
      .then((r) => r.json())
      .then((data: Ad[]) => setAds(data))
      .catch(() => {});
  }, []);

  function handleAdClick(ad: Ad) {
    if (ad.targetUrl) navigate(ad.targetUrl);
  }

  const ROLE_LABELS: Record<Role, string> = {
    student: "Student / Staff",
    driver: "Driver",
    admin: "Admin",
    superadmin: "Superadmin",
  };

  const userInitial = user?.name?.charAt(0)?.toUpperCase() ?? "?";
  const avatarSrc = user?.photoUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.name ?? "U")}&backgroundColor=0F172A&textColor=D97706`;

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">

        {/* Top Bar */}
        <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur shadow-sm">
          <div className="flex h-14 items-center justify-between px-4">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-[15px]">🚌</span>
              <span className="font-black text-primary text-sm">
                Orbit<span className="text-amber-500">Track</span>
              </span>
            </div>

            {/* Tabs */}
            <nav className="flex items-center gap-1 overflow-x-auto">
              {(["student", "driver", "admin", "superadmin"] as Role[]).map((r) => (
                <button key={r} onClick={() => setRole(r)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                    role === r ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                  }`}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </nav>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              <button onClick={() => setDark((d) => !d)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-base hover:bg-muted/70 transition-colors">
                {dark ? "☀️" : "🌙"}
              </button>
              {/* User avatar + logout */}
              <div className="relative group">
                <img src={avatarSrc} alt={user?.name} className="h-8 w-8 rounded-full border-2 border-amber-500 cursor-pointer object-cover" />
                <div className="absolute right-0 top-10 hidden group-hover:block z-50 min-w-[160px] rounded-xl border border-border bg-card shadow-xl p-2">
                  <p className="px-2 py-1 text-xs font-semibold text-foreground truncate">{user?.name}</p>
                  <p className="px-2 pb-1 text-[10px] text-muted-foreground">{user?.phone}</p>
                  <hr className="border-border my-1" />
                  <button onClick={() => { logout(); navigate("/"); }}
                    className="w-full rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-left transition-colors">
                    Sign Out
                  </button>
                </div>
              </div>
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
            {user.tenant?.name && (
              <span className="text-xs text-muted-foreground">· {user.tenant.name}</span>
            )}
          </div>
        )}

        {/* School Banner (if school admin and tenant has banner) */}
        {user?.tenant?.bannerUrl && (
          <div className="w-full">
            <img src={user.tenant.bannerUrl} alt={user.tenant.name ?? "School"} className="h-28 w-full object-cover" />
          </div>
        )}

        {/* Ad Carousel */}
        {ads.length > 0 && (
          <div className="border-b border-border bg-card">
            <AdCarousel ads={ads} onAdClick={handleAdClick} />
          </div>
        )}

        {/* Main Portal */}
        <main className="flex-1 bg-background">
          {role === "student" && <StudentPortal />}
          {role === "driver" && <DriverPortal />}
          {role === "admin" && <AdminPortal />}
          {role === "superadmin" && <SuperadminPortal />}
        </main>

        {subscription?.paywallActive && <PaywallModal subscription={subscription} />}
      </div>
    </div>
  );
}
