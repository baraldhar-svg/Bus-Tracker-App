import { Ionicons } from "@expo/vector-icons";
import { useListPassengers } from "@workspace/api-client-react";
import type { Passenger } from "@workspace/api-client-react";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const STATUS_COLORS: Record<string, string> = {
  boarded: "#22c55e",
  pending: "#f59e0b",
  absent: "#ef4444",
  leave: "#94a3b8",
};

const STATUS_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  boarded: "checkmark-circle",
  pending: "time",
  absent: "close-circle",
  leave: "moon",
};

export default function BoardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<string>("all");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  const { data: passengers, isLoading, error, refetch, isRefetching } = useListPassengers({
    query: { refetchInterval: 20_000 },
  });

  const filtered = passengers?.filter((p) => filter === "all" || p.status === filter) ?? [];

  const counts = {
    all: passengers?.length ?? 0,
    boarded: passengers?.filter((p) => p.status === "boarded").length ?? 0,
    pending: passengers?.filter((p) => p.status === "pending").length ?? 0,
    absent: passengers?.filter((p) => p.status === "absent").length ?? 0,
    leave: passengers?.filter((p) => p.status === "leave").length ?? 0,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Boarding Status
        </Text>
        <View style={styles.summaryRow}>
          <SummaryBadge label="On board" count={counts.boarded} color="#22c55e" colors={colors} />
          <SummaryBadge label="Pending" count={counts.pending} color="#f59e0b" colors={colors} />
          <SummaryBadge label="Absent" count={counts.absent} color="#ef4444" colors={colors} />
        </View>
        <FilterBar filter={filter} setFilter={setFilter} counts={counts} colors={colors} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Could not load passengers
          </Text>
          <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryTxt, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          scrollEnabled={!!filtered.length}
          renderItem={({ item }) => <PassengerCard passenger={item} colors={colors} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No passengers in this filter
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function PassengerCard({ passenger, colors }: {
  passenger: Passenger;
  colors: ReturnType<typeof useColors>;
}) {
  const statusColor = STATUS_COLORS[passenger.status] ?? colors.mutedForeground;
  const statusIcon = STATUS_ICONS[passenger.status] ?? "ellipse";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardLeft}>
        {passenger.photoUrl ? (
          <Image source={{ uri: passenger.photoUrl }} style={[styles.avatar, { borderColor: statusColor }]} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.muted, borderColor: statusColor }]}>
            <Ionicons name="person" size={20} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.passengerInfo}>
          <Text style={[styles.passengerName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {passenger.name}
          </Text>
          <Text style={[styles.stationName, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {passenger.stationName ?? `Station ${passenger.stationId}`}
          </Text>
          {passenger.boardedAt && passenger.status === "boarded" && (
            <Text style={[styles.boardedTime, { color: "#22c55e", fontFamily: "Inter_400Regular" }]}>
              Boarded at {new Date(passenger.boardedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.cardRight}>
        <Ionicons name={statusIcon} size={24} color={statusColor} />
        <Text style={[styles.statusLabel, { color: statusColor, fontFamily: "Inter_500Medium" }]}>
          {passenger.status.charAt(0).toUpperCase() + passenger.status.slice(1)}
        </Text>
      </View>
    </View>
  );
}

function SummaryBadge({ label, count, color, colors }: {
  label: string;
  count: number;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.summaryBadge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.summaryCount, { color, fontFamily: "Inter_700Bold" }]}>{count}</Text>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{label}</Text>
    </View>
  );
}

function FilterBar({ filter, setFilter, counts, colors }: {
  filter: string;
  setFilter: (f: string) => void;
  counts: Record<string, number>;
  colors: ReturnType<typeof useColors>;
}) {
  const filters = ["all", "boarded", "pending", "absent", "leave"];
  return (
    <View style={styles.filterRow}>
      {filters.map((f) => (
        <Pressable
          key={f}
          style={[
            styles.filterChip,
            {
              backgroundColor: filter === f ? colors.primary : colors.muted,
              borderColor: filter === f ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setFilter(f)}
        >
          <Text style={[
            styles.filterTxt,
            { color: filter === f ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_500Medium" },
          ]}>
            {f === "all" ? `All (${counts.all})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, marginBottom: 12 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  summaryBadge: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  summaryCount: { fontSize: 20 },
  summaryLabel: { fontSize: 11, marginTop: 2 },
  filterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  filterTxt: { fontSize: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyTxt: { fontSize: 14 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryTxt: { fontSize: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  passengerInfo: { flex: 1 },
  passengerName: { fontSize: 15 },
  stationName: { fontSize: 12, marginTop: 2 },
  boardedTime: { fontSize: 11, marginTop: 2 },
  cardRight: { alignItems: "center", gap: 2 },
  statusLabel: { fontSize: 11 },
});
