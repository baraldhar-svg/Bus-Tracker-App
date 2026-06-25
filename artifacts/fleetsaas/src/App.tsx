import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { LanguageProvider } from "@/lib/i18n";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import AuthScreen from "@/pages/auth-screen";
import RegisterScreen from "@/pages/register-screen";
import AdminVerifyScreen from "@/pages/admin-verify";
import Dashboard from "@/pages/dashboard";
import SchoolProfile from "@/pages/school-profile";
import { useEffect, useRef } from "react";
import { sendWhatsAppNotification } from "@/lib/whatsapp";
import { useRealtime } from "@/hooks/use-realtime";

const queryClient = new QueryClient();

/**
 * Clears all React Query caches whenever the logged-in user changes.
 * This prevents stale driver/passenger data from a previous session leaking
 * into a freshly logged-in driver's view.
 */
function CacheInvalidator() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    const prev = prevUserIdRef.current;
    const curr = user?.id ?? null;
    // On mount (prev === undefined) don't clear — we want the persisted cache.
    // On user change (including logout to null, and new login) clear everything.
    if (prev !== undefined && prev !== curr) {
      qc.clear();
    }
    prevUserIdRef.current = curr;
  }, [user?.id, qc]);

  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!user) navigate("/auth");
  }, [user, navigate]);
  if (!user) return null;
  return <>{children}</>;
}

function RootRedirect() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);
  return <Landing />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/auth" component={AuthScreen} />
      <Route path="/register" component={RegisterScreen} />
      <Route path="/admin-verify" component={AdminVerifyScreen} />
      <Route path="/school/:id" component={SchoolProfile} />
      <Route path="/dashboard">
        <AuthGuard>
          <DashboardKeyed />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Mounts Dashboard with a stable key tied to the logged-in user's id.
 * When a new driver logs in after logout, the key changes → React unmounts
 * the old component tree completely, resetting all local journey/GPS state.
 */
function DashboardKeyed() {
  const { user } = useAuth();
  return <Dashboard key={user?.id ?? "guest"} />;
}

function RealtimeBridge() {
  useRealtime();
  return null;
}

function App() {
  async function handleTestWhatsApp() {
    await sendWhatsAppNotification("9779840077623");
  }

  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <CacheInvalidator />
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <RealtimeBridge />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
      <button
        onClick={handleTestWhatsApp}
        title="Test WhatsApp Alert"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center h-10 w-10 rounded-full bg-green-500 text-lg shadow-lg hover:bg-green-600 active:scale-95 transition-all"
      >
        💬
      </button>
    </LanguageProvider>
  );
}

export default App;
