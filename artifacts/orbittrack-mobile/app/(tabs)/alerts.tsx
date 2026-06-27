import { Ionicons } from "@expo/vector-icons";
import { useListAnnouncements, useGetTenantMe } from "@workspace/api-client-react";
import type { Announcement } from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const SEVERITY_CONFIG = {
  info: { icon: "information-circle" as const, color: "#3b82f6", label: "Info" },
  warning: { icon: "warning" as const, color: "#f59e0b", label: "Warning" },
  emergency: { icon: "alert-circle" as const, color: "#ef4444", label: "Emergency" },
};

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  const { data: announcements, isLoading, error, refetch, isRefetching } = useListAnnouncements({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { refetchInterval: 30_000 } as any,
  });

  const { data: tenant } = useGetTenantMe();

  const sorted = announcements
    ? [...announcements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  const emergencyCount = announcements?.filter((a) => a.severity === "emergency").length ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Notices
          </Text>
          {emergencyCount > 0 && (
            <View style={[styles.emergencyBadge, { backgroundColor: "#ef444422" }]}>
              <Ionicons name="alert-circle" size={14} color="#ef4444" />
              <Text style={[styles.emergencyCount, { color: "#ef4444", fontFamily: "Inter_700Bold" }]}>
                {emergencyCount} Emergency
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.schoolName, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {tenant?.name ?? "School"}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Could not load notices
          </Text>
          <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.retryTxt, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(a) => String(a.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          scrollEnabled={!!sorted.length}
          renderItem={({ item }) => <AlertCard announcement={item} colors={colors} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No notices right now
              </Text>
              <Text style={[styles.emptySubtxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Emergency alerts from the school will appear here
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function AlertCard({ announcement, colors }: {
  announcement: Announcement;
  colors: ReturnType<typeof useColors>;
}) {
  const config = SEVERITY_CONFIG[announcement.severity] ?? SEVERITY_CONFIG.info;
  const timeAgo = formatTimeAgo(announcement.createdAt);

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: colors.card,
        borderColor: config.color + "66",
        borderLeftColor: config.color,
      },
    ]}>
      <View style={styles.cardTop}>
        <View style={[styles.iconBox, { backgroundColor: config.color + "22" }]}>
          <Ionicons name={config.icon} size={22} color={config.color} />
        </View>
        <View style={styles.cardMeta}>
          <View style={[styles.severityBadge, { backgroundColor: config.color + "22" }]}>
            <Text style={[styles.severityTxt, { color: config.color, fontFamily: "Inter_600SemiBold" }]}>
              {config.label}
            </Text>
          </View>
          <Text style={[styles.timeAgo, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {timeAgo}
          </Text>
        </View>
      </View>
      <Text style={[styles.message, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
        {announcement.message}
      </Text>
      {announcement.messageNe && (
        <Text style={[styles.messageNe, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {announcement.messageNe}
        </Text>
      )}
    </View>
  );
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  title: { fontSize: 24 },
  emergencyBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  emergencyCount: { fontSize: 12 },
  schoolName: { fontSize: 13 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyTxt: { fontSize: 15 },
  emptySubtxt: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryTxt: { fontSize: 14 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardMeta: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  severityTxt: { fontSize: 12 },
  timeAgo: { fontSize: 12 },
  message: { fontSize: 15, lineHeight: 22 },
  messageNe: { fontSize: 14, lineHeight: 20, marginTop: 4 },
});
