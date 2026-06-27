import { Ionicons } from "@expo/vector-icons";
import { useGetActiveTrip, useGetTripTimeline, useGetTenantMe, useListPassengers } from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BusMapView from "@/components/BusMapView";
import { useColors } from "@/hooks/useColors";
import { useRole } from "@/context/RoleContext";
import { useRouter } from "expo-router";

const KATHMANDU_LAT = 27.7172;
const KATHMANDU_LNG = 85.324;

export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setRole, parentPhone } = useRole();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: trip, isLoading, error, refetch } = useGetActiveTrip({
    query: { refetchInterval: 15_000 },
  });
  const { data: timeline } = useGetTripTimeline({ query: { refetchInterval: 30_000 } });
  const { data: tenant } = useGetTenantMe();
  const { data: myChildren = [] } = useListPassengers(
    parentPhone ? { phone: parentPhone } : undefined,
    { query: { enabled: !!parentPhone } },
  );

  const busLat = trip?.currentLat ?? KATHMANDU_LAT;
  const busLng = trip?.currentLng ?? KATHMANDU_LNG;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.schoolName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {tenant?.name ?? "OrbitTrack"}
          </Text>
          {myChildren.length > 0 ? (
            <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Tracking: {myChildren.map((c) => c.name).join(", ")}
            </Text>
          ) : (
            <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Live Bus Location
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

      {myChildren.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.childBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {myChildren.map((child) => {
            const statusColor =
              child.status === "boarded"
                ? "#22c55e"
                : child.status === "absent"
                ? "#ef4444"
                : child.status === "leave"
                ? "#94a3b8"
                : "#f59e0b";
            return (
              <View key={child.id} style={[styles.childChip, { backgroundColor: statusColor + "18", borderColor: statusColor + "55" }]}>
                <Ionicons
                  name={
                    child.status === "boarded"
                      ? "checkmark-circle"
                      : child.status === "absent"
                      ? "close-circle"
                      : child.status === "leave"
                      ? "moon"
                      : "time"
                  }
                  size={14}
                  color={statusColor}
                />
                <Text style={[styles.childName, { color: statusColor, fontFamily: "Inter_600SemiBold" }]}>
                  {child.name}
                </Text>
                <Text style={[styles.childStatus, { color: statusColor, fontFamily: "Inter_400Regular" }]}>
                  · {child.status.charAt(0).toUpperCase() + child.status.slice(1)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <BusMapView
        busLat={busLat}
        busLng={busLng}
        hasTrip={!!trip}
        routeName={trip?.routeName}
      />

      {isLoading && (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.background + "cc" }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingTxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Fetching bus location…
          </Text>
        </View>
      )}

      <View style={[styles.infoPanel, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="wifi-outline" size={20} color={colors.destructive} />
            <Text style={[styles.errorTxt, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
              Could not reach server
            </Text>
            <Pressable onPress={() => refetch()} style={[styles.retryBtn, { borderColor: colors.border }]}>
              <Text style={[styles.retryTxt, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Retry</Text>
            </Pressable>
          </View>
        ) : trip ? (
          <>
            <View style={styles.tripRow}>
              <View style={styles.tripInfo}>
                <Text style={[styles.routeName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {trip.routeName}
                </Text>
                <Text style={[styles.nextStation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Next: {trip.nextStationName}
                </Text>
              </View>
              <View style={[styles.etaBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.etaNum, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                  {trip.etaMinutes}
                </Text>
                <Text style={[styles.etaMin, { color: colors.primaryForeground, fontFamily: "Inter_400Regular" }]}>
                  min
                </Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.statsRow}>
              <StatChip icon="people" value={`${trip.boardedCount ?? 0}/${trip.totalPassengers ?? 0}`} label="Boarded" colors={colors} />
              {trip.driver && (
                <StatChip icon="person" value={trip.driver.name} label="Driver" colors={colors} />
              )}
            </View>
          </>
        ) : (
          <View style={styles.noTripRow}>
            <Ionicons name="bus-outline" size={24} color={colors.mutedForeground} />
            <Text style={[styles.noTripTxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No active trip right now
            </Text>
          </View>
        )}

        {timeline && timeline.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeline}>
            {timeline.slice(0, 6).map((evt) => (
              <View key={evt.id} style={[styles.timelineChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.timelineTime, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  {evt.time}
                </Text>
                <Text style={[styles.timelineDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {evt.description}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function StatChip({ icon, value, label, colors }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  value: string;
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.statChip}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={[styles.statValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{label}</Text>
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
  schoolName: { fontSize: 17 },
  headerSub: { fontSize: 12, marginTop: 2 },
  switchBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  childBar: { borderBottomWidth: 1, paddingVertical: 8 },
  childChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  childName: { fontSize: 13 },
  childStatus: { fontSize: 12 },
  loadingOverlay: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadingTxt: { fontSize: 13 },
  infoPanel: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorTxt: { flex: 1, fontSize: 13 },
  retryBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  retryTxt: { fontSize: 13 },
  tripRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  tripInfo: { flex: 1 },
  routeName: { fontSize: 18 },
  nextStation: { fontSize: 13, marginTop: 2 },
  etaBadge: { alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 28, marginLeft: 12 },
  etaNum: { fontSize: 22, lineHeight: 24 },
  etaMin: { fontSize: 10 },
  divider: { height: 1, marginVertical: 12 },
  statsRow: { flexDirection: "row", gap: 20 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { fontSize: 14 },
  statLabel: { fontSize: 12 },
  noTripRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  noTripTxt: { fontSize: 14 },
  timeline: { marginTop: 12 },
  timelineChip: { marginRight: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  timelineTime: { fontSize: 11 },
  timelineDesc: { fontSize: 11, marginTop: 1 },
});
