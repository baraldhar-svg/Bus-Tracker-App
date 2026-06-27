import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useRole } from "@/context/RoleContext";

export default function RoleSelector() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role, setRole, isLoading } = useRole();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSelect = async (selected: "parent" | "driver") => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setRole(selected);
    router.replace(selected === "parent" ? "/(tabs)/map" : "/(tabs)/route");
  };

  if (isLoading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: topPad + 20,
          paddingBottom: bottomPad + 20,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.logoRing, { borderColor: colors.primary }]}>
          <Ionicons name="bus" size={36} color={colors.primary} />
        </View>
        <Text style={[styles.brand, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          OrbitTrack
        </Text>
        <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Live school bus tracking
        </Text>
      </View>

      <Text style={[styles.prompt, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Continue as
      </Text>

      <View style={styles.cards}>
        <RoleCard
          icon="people"
          title="Parent"
          subtitle="Track your child's bus live"
          onPress={() => handleSelect("parent")}
          colors={colors}
          selected={role === "parent"}
        />
        <RoleCard
          icon="car"
          title="Driver"
          subtitle="Manage route & board passengers"
          onPress={() => handleSelect("driver")}
          colors={colors}
          selected={role === "driver"}
        />
      </View>

      {role && (
        <Pressable
          style={({ pressed }) => [
            styles.continueBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => router.replace(role === "parent" ? "/(tabs)/map" : "/(tabs)/route")}
        >
          <Text style={[styles.continueTxt, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Continue as {role === "parent" ? "Parent" : "Driver"}
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.primaryForeground} />
        </Pressable>
      )}
    </View>
  );
}

function RoleCard({
  icon,
  title,
  subtitle,
  onPress,
  colors,
  selected,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  selected: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected ? colors.primary + "22" : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.primary + "22" }]}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <View style={styles.cardText}>
        <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {title}
        </Text>
        <Text style={[styles.cardSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {subtitle}
        </Text>
      </View>
      {selected && (
        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, paddingHorizontal: 24 },
  header: { alignItems: "center", marginBottom: 48 },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  brand: { fontSize: 32, marginBottom: 6 },
  tagline: { fontSize: 14 },
  prompt: { fontSize: 13, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 16 },
  cards: { gap: 12, marginBottom: 32 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 14,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 17, marginBottom: 2 },
  cardSub: { fontSize: 13 },
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  continueTxt: { fontSize: 16 },
});
