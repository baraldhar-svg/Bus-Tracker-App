import { Ionicons } from "@expo/vector-icons";
import {
  useGetActiveTrip,
  useListRoutes,
  useListRouteStations,
  useStartJourney,
  useCompleteJourney,
  useGetActiveDriver,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import RouteMapView from "@/components/RouteMapView";
import { useColors } from "@/hooks/useColors";
import { useRole } from "@/context/RoleContext";

const KATHMANDU_LAT = 27.7172;
const KATHMANDU_LNG = 85.324;

export default function RouteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setRole } = useRole();
  const queryClient = useQueryClient();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  const { data: trip } = useGetActiveTrip({ query: { refetchInterval: 15_000 } });
  const { data: routes } = useListRoutes();
  const activeRoute = routes?.find((r) => r.isActive) ?? routes?.[0];
  const { data: stations } = useListRouteStations(activeRoute?.id ?? 0, { query: { enabled: !!activeRoute } });
  const { data: driver } = useGetActiveDriver();

  const startMutation = useStartJourney();
  const completeMutation = useCompleteJourney();

  const hasActiveTrip = !!trip;
  const busLat = trip?.currentLat ?? KATHMANDU_LAT;
  const busLng = trip?.currentLng ?? KATHMANDU_LNG;

  const handleStart = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert("Start Journey", "Notify all passengers and admins that the bus has departed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Start",
        onPress: async () => {
          try {
            await startMutation.mutateAsync({});
            await queryClient.invalidateQueries();
          } catch {
            Alert.alert("Error", "Failed to start journey. Please try again.");
          }
        },
      },
    ]);
  };

  const handleComplete = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert("Complete Journey", "Mark this journey as complete?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete",
        style: "destructive",
        onPress: async () => {
          try {
            await completeMutation.mutateAsync({});
            await queryClient.invalidateQueries();
          } catch {
            Alert.alert("Error", "Failed to complete journey. Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {activeRoute?.name ?? "Route"}
          </Text>
          {driver && (
            <Text style={[styles.driverName, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              {driver.name} · {driver.vehicleNumber}
            </Text>
          )}
        </View>
        <Pressable
          onPress={async () => { await setRole(null); router.replace("/"); }}
          style={[styles.switchBtn, { backgroundColor: colors.muted }]}
        >
          <Ionicons name="swap-horizontal" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <RouteMapView
        busLat={busLat}
        busLng={busLng}
        hasTrip={hasActiveTrip}
        stations={stations}
      />

      <View style={[styles.bottomPanel, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
        <View style={styles.tripStatus}>
          <View style={[styles.statusDot, { backgroundColor: hasActiveTrip ? "#22c55e" : colors.mutedForeground }]} />
          <Text style={[styles.statusTxt, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
            {hasActiveTrip
              ? `En route · Next: ${trip!.nextStationName} (${trip!.etaMinutes} min)`
              : "Bus not yet departed"}
          </Text>
        </View>

        {stations && stations.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stationsScroll}>
            {stations.slice(0, 8).map((s, idx) => (
              <View key={s.id} style={styles.stationChip}>
                <View style={[styles.stationNum, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.stationNumTxt, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                    {idx + 1}
                  </Text>
                </View>
                <Text style={[styles.stationChipName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {s.stationName}
                </Text>
                {s.eta && (
                  <Text style={[styles.stationEta, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
                    {s.eta}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.actionRow}>
          {!hasActiveTrip ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: "#22c55e", opacity: pressed || startMutation.isPending ? 0.7 : 1 },
              ]}
              onPress={handleStart}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="play" size={20} color="#fff" />
              )}
              <Text style={[styles.actionTxt, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
                Start Journey
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1, opacity: pressed || completeMutation.isPending ? 0.7 : 1 },
              ]}
              onPress={handleComplete}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <Ionicons name="checkmark-done" size={20} color={colors.foreground} />
              )}
              <Text style={[styles.actionTxt, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Complete Journey
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 20 },
  driverName: { fontSize: 13, marginTop: 2 },
  switchBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  bottomPanel: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  tripStatus: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 13, flex: 1 },
  stationsScroll: { marginHorizontal: -4 },
  stationChip: { alignItems: "center", marginHorizontal: 6, gap: 4 },
  stationNum: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stationNumTxt: { fontSize: 12 },
  stationChipName: { fontSize: 10, maxWidth: 60, textAlign: "center" },
  stationEta: { fontSize: 10 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", paddingVertical: 14, borderRadius: 10, gap: 8,
  },
  actionTxt: { fontSize: 15 },
});
