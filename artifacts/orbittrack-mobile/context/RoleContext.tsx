import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type AppRole = "parent" | "driver" | null;

interface RoleContextValue {
  role: AppRole;
  setRole: (role: AppRole) => Promise<void>;
  isLoading: boolean;
  parentPhone: string | null;
  setParentPhone: (phone: string | null) => Promise<void>;
}

const RoleContext = createContext<RoleContextValue>({
  role: null,
  setRole: async () => {},
  isLoading: true,
  parentPhone: null,
  setParentPhone: async () => {},
});

const ROLE_KEY = "@orbittrack/role";
const PARENT_PHONE_KEY = "@orbittrack/parentPhone";

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<AppRole>(null);
  const [parentPhone, setParentPhoneState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ROLE_KEY),
      AsyncStorage.getItem(PARENT_PHONE_KEY),
    ])
      .then(([storedRole, storedPhone]) => {
        if (storedRole === "parent" || storedRole === "driver") {
          setRoleState(storedRole);
        }
        if (storedPhone) {
          setParentPhoneState(storedPhone);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setRole = useCallback(async (newRole: AppRole) => {
    setRoleState(newRole);
    if (newRole) {
      await AsyncStorage.setItem(ROLE_KEY, newRole);
    } else {
      await AsyncStorage.removeItem(ROLE_KEY);
    }
    if (!newRole) {
      setParentPhoneState(null);
      await AsyncStorage.removeItem(PARENT_PHONE_KEY);
    }
  }, []);

  const setParentPhone = useCallback(async (phone: string | null) => {
    setParentPhoneState(phone);
    if (phone) {
      await AsyncStorage.setItem(PARENT_PHONE_KEY, phone);
    } else {
      await AsyncStorage.removeItem(PARENT_PHONE_KEY);
    }
  }, []);

  return (
    <RoleContext.Provider value={{ role, setRole, isLoading, parentPhone, setParentPhone }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
