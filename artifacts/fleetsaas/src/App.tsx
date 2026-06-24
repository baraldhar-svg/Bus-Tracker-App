import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { useEffect } from "react";
import { sendWhatsAppNotification } from "@/lib/whatsapp";
import { useRealtime } from "@/hooks/use-realtime";

const queryClient = new QueryClient();

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
          <Dashboard />
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
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
