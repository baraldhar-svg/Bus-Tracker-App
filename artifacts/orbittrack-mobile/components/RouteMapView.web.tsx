import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Station {
  id: number;
  stationName: string;
  lat: number;
  lng: number;
  eta?: string | null;
}

interface Props {
  busLat: number;
  busLng: number;
  hasTrip: boolean;
  stations?: Station[];
}

export default function RouteMapView({ stations }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <Ionicons name="navigate-outline" size={40} color={colors.mutedForeground} />
      <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Route map available in Expo Go
      </Text>
      {stations && stations.length > 0 && (
        <View style={[styles.list, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {stations.slice(0, 5).map((s, idx) => (
            <View key={s.id} style={styles.listRow}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.stationName, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {idx + 1}. {s.stationName}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  label: { fontSize: 14 },
  list: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, gap: 8 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stationName: { fontSize: 13 },
});
