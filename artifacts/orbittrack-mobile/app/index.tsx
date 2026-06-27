import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useRole } from "@/context/RoleContext";

type Step = "role-select" | "parent-phone" | "parent-otp";

export default function RoleSelector() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role, setRole, isLoading, setParentPhone, parentPhone } = useRole();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [step, setStep] = useState<Step>("role-select");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [resolvedPhone, setResolvedPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otpRef = useRef<TextInput>(null);

  const handleDriverSelect = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setRole("driver");
    router.replace("/(tabs)/route");
  };

  const handleParentContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("parent-phone");
    setError(null);
  };

  const handleSendOtp = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError("Please enter your phone number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
        ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
        : "";
      const res = await fetch(`${baseUrl}/api/auth/check-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.found) {
        setError(
          data.error ??
            "This number is not registered. Contact your school administrator."
        );
        return;
      }
      setResolvedPhone((data.user?.phone as string) ?? trimmed);
      setDemoCode("123456");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("parent-otp");
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.trim() !== demoCode) {
      setError(`Incorrect code. (Hint: ${demoCode})`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await setParentPhone(resolvedPhone);
      await setRole("parent");
      router.replace("/(tabs)/map");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleBack = () => {
    setError(null);
    setOtp("");
    setPhone("");
    setStep("role-select");
  };

  if (isLoading) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
          <Text
            style={[
              styles.brand,
              { color: colors.foreground, fontFamily: "Inter_700Bold" },
            ]}
          >
            OrbitTrack
          </Text>
          <Text
            style={[
              styles.tagline,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            Live school bus tracking
          </Text>
        </View>

        {step === "role-select" && (
          <>
            <Text
              style={[
                styles.prompt,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_500Medium",
                },
              ]}
            >
              Continue as
            </Text>
            <View style={styles.cards}>
              <RoleCard
                icon="people"
                title="Parent"
                subtitle="Track your child's bus live"
                onPress={handleParentContinue}
                colors={colors}
                selected={role === "parent"}
              />
              <RoleCard
                icon="car"
                title="Driver"
                subtitle="Manage route & board passengers"
                onPress={handleDriverSelect}
                colors={colors}
                selected={role === "driver"}
              />
            </View>
            {role === "parent" && parentPhone && (
              <Pressable
                style={({ pressed }) => [
                  styles.continueBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                onPress={() => router.replace("/(tabs)/map")}
              >
                <Text
                  style={[
                    styles.continueTxt,
                    {
                      color: colors.primaryForeground,
                      fontFamily: "Inter_600SemiBold",
                    },
                  ]}
                >
                  Continue as Parent
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={colors.primaryForeground}
                />
              </Pressable>
            )}
          </>
        )}

        {step === "parent-phone" && (
          <View style={styles.authCard}>
            <Pressable style={styles.backRow} onPress={handleBack}>
              <Ionicons
                name="arrow-back"
                size={18}
                color={colors.mutedForeground}
              />
              <Text
                style={[
                  styles.backTxt,
                  {
                    color: colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                Back
              </Text>
            </Pressable>

            <Text
              style={[
                styles.authTitle,
                { color: colors.foreground, fontFamily: "Inter_700Bold" },
              ]}
            >
              Parent Login
            </Text>
            <Text
              style={[
                styles.authSubtitle,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              Enter the phone number registered at your child's school.
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: error ? colors.destructive : colors.border,
                  color: colors.foreground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              placeholder="Phone number (e.g. 9841234567)"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              autoFocus
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                setError(null);
              }}
              onSubmitEditing={handleSendOtp}
              returnKeyType="next"
            />

            {error && (
              <Text
                style={[
                  styles.errorTxt,
                  { color: colors.destructive, fontFamily: "Inter_400Regular" },
                ]}
              >
                {error}
              </Text>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: busy ? colors.muted : colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={handleSendOtp}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.actionTxt,
                    {
                      color: colors.primaryForeground,
                      fontFamily: "Inter_600SemiBold",
                    },
                  ]}
                >
                  Send OTP
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {step === "parent-otp" && (
          <View style={styles.authCard}>
            <Pressable
              style={styles.backRow}
              onPress={() => {
                setStep("parent-phone");
                setOtp("");
                setError(null);
              }}
            >
              <Ionicons
                name="arrow-back"
                size={18}
                color={colors.mutedForeground}
              />
              <Text
                style={[
                  styles.backTxt,
                  {
                    color: colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                Back
              </Text>
            </Pressable>

            <Text
              style={[
                styles.authTitle,
                { color: colors.foreground, fontFamily: "Inter_700Bold" },
              ]}
            >
              Enter OTP
            </Text>
            <Text
              style={[
                styles.authSubtitle,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              A 6-digit code was sent to {phone}.
            </Text>

            <View
              style={[
                styles.demoBox,
                { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" },
              ]}
            >
              <Ionicons name="information-circle" size={16} color={colors.primary} />
              <Text
                style={[
                  styles.demoTxt,
                  { color: colors.primary, fontFamily: "Inter_500Medium" },
                ]}
              >
                Demo code: {demoCode}
              </Text>
            </View>

            <TextInput
              ref={otpRef}
              style={[
                styles.input,
                styles.otpInput,
                {
                  backgroundColor: colors.card,
                  borderColor: error ? colors.destructive : colors.border,
                  color: colors.foreground,
                  fontFamily: "Inter_700Bold",
                },
              ]}
              placeholder="------"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={(v) => {
                setOtp(v);
                setError(null);
              }}
              onSubmitEditing={handleVerifyOtp}
              returnKeyType="done"
            />

            {error && (
              <Text
                style={[
                  styles.errorTxt,
                  { color: colors.destructive, fontFamily: "Inter_400Regular" },
                ]}
              >
                {error}
              </Text>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: busy ? colors.muted : colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={handleVerifyOtp}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.actionTxt,
                    {
                      color: colors.primaryForeground,
                      fontFamily: "Inter_600SemiBold",
                    },
                  ]}
                >
                  Verify & Continue
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
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
        <Text
          style={[
            styles.cardTitle,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.cardSub,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
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
  prompt: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 16,
  },
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
  authCard: { flex: 1, gap: 12 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  backTxt: { fontSize: 14 },
  authTitle: { fontSize: 26, marginBottom: 4 },
  authSubtitle: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  otpInput: {
    textAlign: "center",
    fontSize: 28,
    letterSpacing: 8,
  },
  demoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  demoTxt: { fontSize: 14 },
  errorTxt: { fontSize: 13, marginTop: -4 },
  actionBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  actionTxt: { fontSize: 16 },
});
