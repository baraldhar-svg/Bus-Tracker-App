import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import { useEffect, useRef } from "react";

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

/**
 * Register an Expo push token for the given list of passenger IDs and store
 * them server-side (one token row per passenger so the proximity watchdog
 * can fan out to every child a parent is tracking).
 *
 * Also installs the foreground notification handler and a tap listener that
 * routes to the Map tab when a bus-proximity push is tapped.
 *
 * Only runs on native (iOS/Android) — web does not support Expo push.
 *
 * @param passengerIds  All passenger IDs linked to this parent device.
 * @param enabled       Set to false to skip registration (e.g. role is not "parent").
 */
export function usePushNotifications(passengerIds: number[], enabled: boolean) {
  const router = useRouter();
  const registeredRef = useRef(false);

  // ── Token registration ───────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || passengerIds.length === 0 || Platform.OS === "web") return;
    if (registeredRef.current) return;

    void (async () => {
      try {
        // Configure the Android notification channel
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("bus-proximity", {
            name: "Bus Proximity Alerts",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF6B35",
          });
        }

        // Request permission — cast via unknown because expo-modules-core
        // re-exports PermissionResponse with `granted` but TypeScript may
        // not resolve the inheritance across pnpm virtual store versions.
        const existing = await Notifications.getPermissionsAsync() as unknown as { granted: boolean };
        if (!existing.granted) {
          const result = await Notifications.requestPermissionsAsync() as unknown as { granted: boolean };
          if (!result.granted) return;
        }

        // Get the Expo push token
        const tokenResult = await Notifications.getExpoPushTokenAsync({
          projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
        });
        const token = tokenResult.data;

        // Register the same device token for every passenger this parent tracks.
        // The proximity watchdog fans out per-passenger so all children trigger alerts.
        const results = await Promise.allSettled(
          passengerIds.map((passengerId) =>
            fetch(`${BASE_URL}/api/push-tokens`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-tenant-id": "1" },
              body: JSON.stringify({ passengerId, token }),
            })
          )
        );

        const anyOk = results.some(
          (r) => r.status === "fulfilled" && r.value.ok
        );
        if (anyOk) {
          registeredRef.current = true;
        }
      } catch {
        // Push registration is best-effort — never crash the app
      }
    })();
  }, [enabled, passengerIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Foreground notification display handler ──────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }, []);

  // ── Tap handler — routes to Map tab ─────────────────────────────────────
  // Handles three scenarios:
  //   1. App in foreground  → listener fires immediately
  //   2. App in background  → listener fires when user taps the notification
  //   3. Cold-start (killed) → Notifications.getLastNotificationResponseAsync()
  useEffect(() => {
    if (Platform.OS === "web") return;

    // Subscribe to tap events while the app is running
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      if (data?.screen === "map") {
        router.push("/(tabs)/map");
      }
    });

    // Handle cold-start: check if the app was opened by tapping a push
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      if (data?.screen === "map") {
        // Small delay so the navigator has mounted before we push
        setTimeout(() => router.push("/(tabs)/map"), 300);
      }
    });

    return () => {
      sub.remove();
    };
  }, [router]);
}
