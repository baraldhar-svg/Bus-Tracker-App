import { useState } from "react";
import ParentPortal from "@/components/portals/parent-portal";
import DriverPortal from "@/components/portals/driver-portal";
import AdminPortal from "@/components/portals/admin-portal";
import SuperadminPortal from "@/components/portals/superadmin-portal";
import PaywallModal from "@/components/paywall-modal";
import { useGetMySubscription } from "@workspace/api-client-react";

type Role = "parent" | "driver" | "admin" | "superadmin";

export default function Home() {
  const [role, setRole] = useState<Role>("parent");

  const { data: subscription } = useGetMySubscription();

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-background text-foreground">
      {/* Role Switcher Top Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card shadow-sm">
        <div className="container mx-auto flex h-14 items-center justify-center overflow-x-auto px-4">
          <nav className="flex items-center gap-2">
            {(["parent", "driver", "admin", "superadmin"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  role === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full bg-background relative flex flex-col">
        {role === "parent" && <ParentPortal />}
        {role === "driver" && <DriverPortal />}
        {role === "admin" && <AdminPortal />}
        {role === "superadmin" && <SuperadminPortal />}
      </main>

      {/* Paywall Modal */}
      {subscription?.paywallActive && <PaywallModal subscription={subscription} />}
    </div>
  );
}
