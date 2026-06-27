import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  busLat: number;
  busLng: number;
  hasTrip: boolean;
  routeName?: string;
}

export default function BusMapView({ busLat, busLng, hasTrip }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <Ionicons name="map-outline" size={40} color={colors.mutedForeground} />
      <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Live map available in Expo Go
      </Text>
      {hasTrip && (
        <View style={[styles.coordBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.coordTxt, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {busLat.toFixed(4)}°N · {busLng.toFixed(4)}°E
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  label: { fontSize: 14 },
  coordBox: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  coordTxt: { fontSize: 14 },
});
