import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type AuthUser = {
  id: number;
  phone: string;
  name: string;
  title?: string | null;
  role: string;
  schoolCode?: string | null;
  tenantId?: number | null;
  photoUrl?: string | null;
  tenant?: { id: number; name: string; bannerUrl?: string | null; address?: string | null } | null;
};

const SESSION_KEY = "orbittrack_user";

function readSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeSession(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

type AuthCtx = {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx>({ user: null, login: () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readSession());

  const login = useCallback((u: AuthUser) => {
    writeSession(u);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    writeSession(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
