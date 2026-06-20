import { useState, useEffect } from "react";
import StudentPortal from "@/components/portals/student-portal";
import DriverPortal from "@/components/portals/driver-portal";
import AdminPortal from "@/components/portals/admin-portal";
import SuperadminPortal from "@/components/portals/superadmin-portal";
import PaywallModal from "@/components/paywall-modal";
import { useGetMySubscription } from "@workspace/api-client-react";

type Role = "student" | "driver" | "admin" | "superadmin";

const ROLE_LABELS: Record<Role, string> = {
  student: "Student / Staff",
  driver: "Driver",
  admin: "Admin",
  superadmin: "Superadmin",
};

export default function Home() {
  const [role, setRole] = useState<Role>("student");
  const [dark, setDark] = useState(() => {
    return localStorage.getItem("fleetDark") === "1";
  });

  const { data: subscription } = useGetMySubscription();

  useEffect(() => {
    localStorage.setItem("fleetDark", dark ? "1" : "0");
  }, [dark]);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground transition-colors duration-300">
        {/* Top Bar */}
        <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur shadow-sm">
          <div className="container mx-auto flex h-14 items-center justify-between px-4">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#ffee47] text-[15px]">🚌</span>
              <span className="hidden font-bold text-primary text-sm sm:block">FleetSaaS</span>
            </div>

            {/* Role Tabs */}
            <nav className="flex items-center gap-1 overflow-x-auto">
              {(["student", "driver", "admin", "superadmin"] as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                    role === r
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </nav>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark((d) => !d)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-base hover:bg-muted/70 transition-colors"
              title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 w-full bg-background relative flex flex-col">
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
