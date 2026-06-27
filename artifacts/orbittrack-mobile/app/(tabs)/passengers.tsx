import { Ionicons } from "@expo/vector-icons";
import {
  useListPassengers,
  useBoardPassenger,
  useUnboardPassenger,
  useSendBoardingOtp,
  useTriggerSos,
} from "@workspace/api-client-react";
import type { Passenger } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { useColors } from "@/hooks/useColors";

interface OtpTarget {
  passenger: Passenger;
  serverDemoCode: string | null;
}

export default function PassengersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [otpTarget, setOtpTarget] = useState<OtpTarget | null>(null);
  const [sosLoading, setSosLoading] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 80;

  const { data: passengers, isLoading, error, refetch, isRefetching } = useListPassengers(
    undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { refetchInterval: 20_000 } as any },
  );

  const boardMutation = useBoardPassenger();
  const unboardMutation = useUnboardPassenger();
  const sendOtpMutation = useSendBoardingOtp();
  const sosMutation = useTriggerSos();

  const pending = passengers?.filter((p) => p.status === "pending" && p.liveToday !== 0).length ?? 0;
  const boarded = passengers?.filter((p) => p.status === "boarded").length ?? 0;
  const total = passengers?.length ?? 0;

  const handleSos = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "SOS Emergency",
      "This will send an emergency alert to the school and all parents. Confirm?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "SEND SOS",
          style: "destructive",
          onPress: async () => {
            setSosLoading(true);
            try {
              await sosMutation.mutateAsync(undefined as unknown as void);
              Alert.alert("SOS Sent", "Emergency alert has been dispatched.");
            } catch {
              Alert.alert("Error", "Failed to send SOS. Please try again.");
            } finally {
              setSosLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleBoard = async (passenger: Passenger) => {
    if (passenger.status === "boarded") {
      Alert.alert(
        "Unboard Passenger",
        `Mark ${passenger.name} as unboarded?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unboard",
            onPress: async () => {
              try {
                await unboardMutation.mutateAsync({ id: passenger.id });
                await queryClient.invalidateQueries();
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              } catch {
                Alert.alert("Error", "Failed to unboard passenger.");
              }
            },
          },
        ]
      );
      return;
    }

    try {
      const result = await sendOtpMutation.mutateAsync({ id: passenger.id });
      setOtpTarget({
        passenger,
        serverDemoCode: result.demoCode ?? null,
      });
    } catch {
      Alert.alert("Error", "Failed to send boarding OTP. Please try again.");
    }
  };

  const handleOtpConfirm = async (passenger: Passenger, enteredOtp: string) => {
    try {
      await boardMutation.mutateAsync({ id: passenger.id, data: { otp: enteredOtp } });
      await queryClient.invalidateQueries();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpTarget(null);
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        err?.response?.data?.error ??
        err?.message ??
        "Incorrect or expired OTP. Please try again.";
      Alert.alert("Boarding Failed", message);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Passengers
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {boarded}/{total} boarded · {pending} awaiting
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.sosBtn,
              { backgroundColor: "#ef4444", opacity: pressed || sosLoading ? 0.7 : 1 },
            ]}
            onPress={handleSos}
            disabled={sosLoading}
          >
            {sosLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="warning" size={18} color="#fff" />
            )}
            <Text style={[styles.sosTxt, { fontFamily: "Inter_700Bold" }]}>SOS</Text>
          </Pressable>
        </View>

        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { backgroundColor: colors.primary, width: total > 0 ? `${(boarded / total) * 100}%` : "0%" },
            ]}
          />
        </View>
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
          data={passengers ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          scrollEnabled={!!(passengers?.length)}
          renderItem={({ item }) => (
            <PassengerRow
              passenger={item}
              colors={colors}
              onPress={handleBoard}
              isSendingOtp={sendOtpMutation.isPending && sendOtpMutation.variables?.id === item.id}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="people-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyTxt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No passengers registered
              </Text>
            </View>
          }
        />
      )}

      {otpTarget && (
        <OtpModal
          passenger={otpTarget.passenger}
          serverDemoCode={otpTarget.serverDemoCode}
          colors={colors}
          onConfirm={(enteredOtp) => handleOtpConfirm(otpTarget.passenger, enteredOtp)}
          onClose={() => setOtpTarget(null)}
          isLoading={boardMutation.isPending}
        />
      )}
    </View>
  );
}

function PassengerRow({ passenger, colors, onPress, isSendingOtp }: {
  passenger: Passenger;
  colors: ReturnType<typeof useColors>;
  onPress: (p: Passenger) => void;
  isSendingOtp: boolean;
}) {
  const isBoarded = passenger.status === "boarded";
  const isLeave = passenger.status === "leave";
  const isAbsent = passenger.status === "absent";

  const statusColor = isBoarded ? "#22c55e" : isLeave ? "#94a3b8" : isAbsent ? "#ef4444" : colors.mutedForeground;

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rowLeft}>
        {passenger.photoUrl ? (
          <Image source={{ uri: passenger.photoUrl }} style={[styles.avatar, { borderColor: statusColor }]} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.muted, borderColor: statusColor }]}>
            <Ionicons name="person" size={18} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {passenger.name}
          </Text>
          <Text style={[styles.rowStation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {passenger.stationName ?? `Station ${passenger.stationId}`}
          </Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.boardBtn,
          {
            backgroundColor: isBoarded ? "#22c55e22" : isLeave || isAbsent ? colors.muted : colors.primary,
            borderColor: isBoarded ? "#22c55e" : isLeave || isAbsent ? colors.border : colors.primary,
            opacity: pressed || isSendingOtp ? 0.7 : 1,
          },
        ]}
        onPress={() => onPress(passenger)}
        disabled={isLeave || isAbsent || isSendingOtp}
      >
        {isSendingOtp ? (
          <ActivityIndicator size="small" color={isBoarded ? "#22c55e" : colors.primaryForeground} />
        ) : (
          <Ionicons
            name={isBoarded ? "checkmark-circle" : "add-circle-outline"}
            size={20}
            color={isBoarded ? "#22c55e" : isLeave || isAbsent ? colors.mutedForeground : colors.primaryForeground}
          />
        )}
      </Pressable>
    </View>
  );
}

function OtpModal({ passenger, serverDemoCode, colors, onConfirm, onClose, isLoading }: {
  passenger: Passenger;
  serverDemoCode: string | null;
  colors: ReturnType<typeof useColors>;
  onConfirm: (enteredOtp: string) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const [otp, setOtp] = useState("");
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                Board Passenger
              </Text>
              <Text style={[styles.modalSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                OTP sent to parent's phone — ask them to confirm
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.passengerPreview}>
            <View style={[styles.previewAvatar, { backgroundColor: colors.muted }]}>
              {passenger.photoUrl ? (
                <Image source={{ uri: passenger.photoUrl }} style={styles.previewImg} />
              ) : (
                <Ionicons name="person" size={28} color={colors.mutedForeground} />
              )}
            </View>
            <View>
              <Text style={[styles.previewName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {passenger.name}
              </Text>
              <Text style={[styles.previewStation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {passenger.stationName ?? `Station ${passenger.stationId}`}
              </Text>
            </View>
          </View>

          {serverDemoCode && (
            <View style={[styles.demoBanner, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
              <Ionicons name="phone-portrait-outline" size={16} color={colors.primary} />
              <Text style={[styles.demoBannerTxt, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                Demo mode — OTP for this session: {serverDemoCode}
              </Text>
            </View>
          )}

          <View style={[styles.otpBox, { backgroundColor: colors.background, borderColor: otp.length === 4 ? colors.primary : colors.border }]}>
            <TextInput
              style={[styles.otpInput, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
              value={otp}
              onChangeText={setOtp}
              placeholder="Enter OTP"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.confirmBtn,
              {
                backgroundColor: otp.length === 4 ? colors.primary : colors.muted,
                opacity: pressed || isLoading ? 0.7 : 1,
              },
            ]}
            onPress={() => onConfirm(otp)}
            disabled={otp.length < 4 || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Ionicons name="checkmark" size={20} color={otp.length === 4 ? colors.primaryForeground : colors.mutedForeground} />
            )}
            <Text style={[
              styles.confirmTxt,
              { color: otp.length === 4 ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
            ]}>
              Confirm Boarding
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 24 },
  subtitle: { fontSize: 13, marginTop: 2 },
  sosBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  sosTxt: { fontSize: 13, color: "#fff" },
  progressBarBg: { height: 4, backgroundColor: "#1e293b", borderRadius: 2, overflow: "hidden" },
  progressBarFill: { height: 4, borderRadius: 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyTxt: { fontSize: 14 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryTxt: { fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2 },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15 },
  rowStation: { fontSize: 12, marginTop: 2 },
  boardBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, paddingHorizontal: 24, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#94a3b822", alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 20 },
  modalSub: { fontSize: 13, marginTop: 2 },
  passengerPreview: {
    flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, padding: 16,
    borderRadius: 12, backgroundColor: "rgba(214, 139, 9, 0.08)",
  },
  previewAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  previewImg: { width: 52, height: 52 },
  previewName: { fontSize: 17 },
  previewStation: { fontSize: 13, marginTop: 2 },
  demoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginBottom: 16,
  },
  demoBannerTxt: { fontSize: 13, flex: 1 },
  otpBox: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 16, marginBottom: 16 },
  otpInput: { height: 56, fontSize: 24, textAlign: "center", letterSpacing: 8 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 12, gap: 8 },
  confirmTxt: { fontSize: 16 },
});
