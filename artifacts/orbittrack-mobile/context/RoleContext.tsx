import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type AppRole = "parent" | "driver" | null;

interface RoleContextValue {
  role: AppRole;
  setRole: (role: AppRole) => Promise<void>;
  isLoading: boolean;
}

const RoleContext = createContext<RoleContextValue>({
  role: null,
  setRole: async () => {},
  isLoading: true,
});

const STORAGE_KEY = "@orbittrack/role";

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<AppRole>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "parent" || stored === "driver") {
          setRoleState(stored);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setRole = useCallback(async (newRole: AppRole) => {
    setRoleState(newRole);
    if (newRole) {
      await AsyncStorage.setItem(STORAGE_KEY, newRole);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <RoleContext.Provider value={{ role, setRole, isLoading }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
