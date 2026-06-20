import { useState, useEffect } from "react";

export type DriverMessage = {
  id: string;
  driverName: string;
  vehiclePlate: string;
  text: string;
  timestamp: string;
  isCustom: boolean;
};

const EVENT_KEY = "orbittrack:driver-message";
const _messages: DriverMessage[] = [];

export function getDriverMessages(vehiclePlate?: string): DriverMessage[] {
  return vehiclePlate ? _messages.filter((m) => m.vehiclePlate === vehiclePlate) : [..._messages];
}

export function sendDriverMessage(msg: Omit<DriverMessage, "id" | "timestamp">) {
  const full: DriverMessage = {
    ...msg,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
  _messages.unshift(full);
  window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: full }));
  return full;
}

export function useDriverMessages(vehiclePlate?: string): DriverMessage[] {
  const [msgs, setMsgs] = useState<DriverMessage[]>(() => getDriverMessages(vehiclePlate));

  useEffect(() => {
    const handler = () => setMsgs(getDriverMessages(vehiclePlate));
    window.addEventListener(EVENT_KEY, handler);
    return () => window.removeEventListener(EVENT_KEY, handler);
  }, [vehiclePlate]);

  return msgs;
}
