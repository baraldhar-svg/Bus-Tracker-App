import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from "react-native-maps";

import { useColors } from "@/hooks/useColors";

interface Props {
  busLat: number;
  busLng: number;
  hasTrip: boolean;
  routeName?: string;
}

export default function BusMapView({ busLat, busLng, hasTrip, routeName }: Props) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (hasTrip && mapRef.current) {
      mapRef.current.animateToRegion(
        { latitude: busLat, longitude: busLng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        600
      );
    }
  }, [busLat, busLng, hasTrip]);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={PROVIDER_DEFAULT}
      initialRegion={{ latitude: busLat, longitude: busLng, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
    >
      {hasTrip && (
        <>
          <Marker coordinate={{ latitude: busLat, longitude: busLng }} title="School Bus" description={routeName}>
            <View style={[styles.busMarker, { backgroundColor: colors.primary }]}>
              <Ionicons name="bus" size={20} color={colors.primaryForeground} />
            </View>
          </Marker>
          <Circle
            center={{ latitude: busLat, longitude: busLng }}
            radius={200}
            fillColor={colors.primary + "22"}
            strokeColor={colors.primary + "66"}
            strokeWidth={1}
          />
        </>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  busMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
