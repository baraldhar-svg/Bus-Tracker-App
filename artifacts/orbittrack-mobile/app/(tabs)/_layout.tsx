import { Ionicons, Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useRole } from "@/context/RoleContext";

function ParentNativeTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="map">
        <Icon sf={{ default: "map", selected: "map.fill" }} />
        <Label>Map</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="boarding">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>Boarding</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alerts">
        <Icon sf={{ default: "bell", selected: "bell.fill" }} />
        <Label>Alerts</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function DriverNativeTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="route">
        <Icon sf={{ default: "road.lanes", selected: "road.lanes" }} />
        <Label>Route</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="passengers">
        <Icon sf={{ default: "checklist", selected: "checklist" }} />
        <Label>Passengers</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabs({ isParent }: { isParent: boolean }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          paddingBottom: isWeb ? 0 : insets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
      }}
    >
      {isParent ? (
        <>
          <Tabs.Screen
            name="map"
            options={{
              title: "Map",
              tabBarIcon: ({ color }) =>
                Platform.OS === "ios" ? (
                  <SymbolView name="map.fill" tintColor={color} size={22} />
                ) : (
                  <Ionicons name="map" size={22} color={color} />
                ),
            }}
          />
          <Tabs.Screen
            name="boarding"
            options={{
              title: "Boarding",
              tabBarIcon: ({ color }) =>
                Platform.OS === "ios" ? (
                  <SymbolView name="person.2.fill" tintColor={color} size={22} />
                ) : (
                  <Ionicons name="people" size={22} color={color} />
                ),
            }}
          />
          <Tabs.Screen
            name="alerts"
            options={{
              title: "Alerts",
              tabBarIcon: ({ color }) =>
                Platform.OS === "ios" ? (
                  <SymbolView name="bell.fill" tintColor={color} size={22} />
                ) : (
                  <Ionicons name="notifications" size={22} color={color} />
                ),
            }}
          />
          <Tabs.Screen name="route" options={{ href: null }} />
          <Tabs.Screen name="passengers" options={{ href: null }} />
        </>
      ) : (
        <>
          <Tabs.Screen
            name="route"
            options={{
              title: "Route",
              tabBarIcon: ({ color }) =>
                Platform.OS === "ios" ? (
                  <SymbolView name="road.lanes" tintColor={color} size={22} />
                ) : (
                  <Feather name="navigation" size={22} color={color} />
                ),
            }}
          />
          <Tabs.Screen
            name="passengers"
            options={{
              title: "Passengers",
              tabBarIcon: ({ color }) =>
                Platform.OS === "ios" ? (
                  <SymbolView name="checklist" tintColor={color} size={22} />
                ) : (
                  <Feather name="check-square" size={22} color={color} />
                ),
            }}
          />
          <Tabs.Screen name="map" options={{ href: null }} />
          <Tabs.Screen name="boarding" options={{ href: null }} />
          <Tabs.Screen name="alerts" options={{ href: null }} />
        </>
      )}
    </Tabs>
  );
}

export default function TabLayout() {
  const { role, isLoading } = useRole();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!role) {
    return <Redirect href="/" />;
  }

  const isParent = role === "parent";

  if (isLiquidGlassAvailable()) {
    return isParent ? <ParentNativeTabs /> : <DriverNativeTabs />;
  }

  return <ClassicTabs isParent={isParent} />;
}
