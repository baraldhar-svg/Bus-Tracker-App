import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";

import { useColors } from "@/hooks/useColors";

interface Station {
  id: number;
  stationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  eta?: string | null;
}

interface Props {
  busLat: number;
  busLng: number;
  hasTrip: boolean;
  stations?: Station[];
}

export default function RouteMapView({ busLat, busLng, hasTrip, stations }: Props) {
  const colors = useColors();
  const validStations = stations?.filter((s) => s.lat != null && s.lng != null) ?? [];
  const mapCoords = validStations.map((s) => ({ latitude: s.lat!, longitude: s.lng! }));

  return (
    <MapView
      style={styles.map}
      provider={PROVIDER_DEFAULT}
      initialRegion={{ latitude: busLat, longitude: busLng, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
    >
      {hasTrip && (
        <Marker coordinate={{ latitude: busLat, longitude: busLng }}>
          <View style={[styles.busMarker, { backgroundColor: colors.primary }]}>
            <Ionicons name="bus" size={18} color={colors.primaryForeground} />
          </View>
        </Marker>
      )}
      {validStations.map((s) => (
        <Marker key={s.id} coordinate={{ latitude: s.lat!, longitude: s.lng! }} title={s.stationName ?? undefined}>
          <View style={[styles.stationMarker, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="location" size={14} color={colors.primary} />
          </View>
        </Marker>
      ))}
      {mapCoords.length >= 2 && (
        <Polyline coordinates={mapCoords} strokeColor={colors.primary} strokeWidth={2} lineDashPattern={[8, 4]} />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  busMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  stationMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
