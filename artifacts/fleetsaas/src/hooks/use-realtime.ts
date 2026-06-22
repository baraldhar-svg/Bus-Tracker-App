import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  getListPassengersQueryKey,
  getListDriversQueryKey,
  getListAnnouncementsQueryKey,
  getGetActiveTripQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EventConfig {
  invalidate: readonly (readonly unknown[])[];
  toast?: string;
}

const EVENT_MAP: Record<string, EventConfig> = {
  trip_started: {
    invalidate: [getListAnnouncementsQueryKey(), getGetActiveTripQueryKey()],
    toast: "🚌 Journey started — tracking is live",
  },
  trip_completed: {
    invalidate: [
      getListAnnouncementsQueryKey(),
      getGetActiveTripQueryKey(),
      getListPassengersQueryKey(),
      getGetDashboardStatsQueryKey(),
    ],
    toast: "✅ Journey completed — all students arrived safely",
  },
  passengers_updated: {
    invalidate: [getListPassengersQueryKey(), ["boarding-logs"]],
  },
  drivers_updated: {
    invalidate: [getListDriversQueryKey(), getGetActiveTripQueryKey()],
  },
  announcements_updated: {
    invalidate: [getListAnnouncementsQueryKey()],
    toast: "📢 New notice posted on the board",
  },
};

export function useRealtime() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const es = new EventSource(`${BASE}/api/events`);

    for (const [eventName, config] of Object.entries(EVENT_MAP)) {
      es.addEventListener(eventName, () => {
        for (const queryKey of config.invalidate) {
          queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
        }
        if (config.toast) {
          toast({ description: config.toast });
        }
      });
    }

    return () => {
      es.close();
    };
  }, [queryClient, toast]);
}
