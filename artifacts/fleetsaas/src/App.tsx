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
import Dashboard from "@/pages/dashboard";
import SchoolProfile from "@/pages/school-profile";
import { useEffect } from "react";

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

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
