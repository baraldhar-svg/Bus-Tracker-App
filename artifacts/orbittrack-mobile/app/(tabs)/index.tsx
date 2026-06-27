import { Redirect } from "expo-router";
import { useRole } from "@/context/RoleContext";
import { ActivityIndicator, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function TabIndex() {
  const { role, isLoading } = useRole();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!role) return <Redirect href="/" />;
  if (role === "parent") return <Redirect href="/(tabs)/map" />;
  return <Redirect href="/(tabs)/route" />;
}
