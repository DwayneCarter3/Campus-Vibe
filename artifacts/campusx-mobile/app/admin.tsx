import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useListAdminUsers,
  getListAdminUsersQueryKey,
  useUpdateUserRole,
  useListPendingVerifications,
  getListPendingVerificationsQueryKey,
  useApproveBadge,
} from "@workspace/api-client-react";
import type { AdminUserItem, PendingVerificationItem } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@clerk/expo";

const CEO_EMAIL = "dwaynecartergabriel@gmail.com";

type AdminTab = "verifications" | "users";
type UserRole = "student" | "moderator" | "admin" | "ceo";

const ROLES: UserRole[] = ["student", "moderator", "admin", "ceo"];

const ROLE_COLORS: Record<UserRole, string> = {
  ceo: "#F59E0B",
  admin: "#A855F7",
  moderator: "#3B82F6",
  student: "#6B7280",
};

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<AdminTab>("verifications");
  const [search, setSearch] = useState("");

  const { user: clerkUser } = useUser();
  const { data: profile, isLoading: profileLoading } = useGetMyProfile();
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
  const isCEO = profile?.role === "ceo" || clerkEmail === CEO_EMAIL;
  const isAdminOrCEO = isCEO || profile?.role === "admin";

  const { data: usersData, isLoading: usersLoading } = useListAdminUsers(
    { search: search || undefined },
    {
      query: {
        queryKey: getListAdminUsersQueryKey({ search: search || undefined }),
        enabled: isCEO,
      },
    }
  );

  const { data: pendingData, isLoading: pendingLoading } = useListPendingVerifications({
    query: {
      queryKey: getListPendingVerificationsQueryKey(),
      enabled: isAdminOrCEO,
    },
  });

  const updateRole = useUpdateUserRole();
  const approveBadge = useApproveBadge();

  const handleRoleChange = (userId: string, currentRole: string) => {
    const currentIdx = ROLES.indexOf(currentRole as UserRole);
    const options = ROLES.filter((r) => r !== currentRole);
    Alert.alert(
      "Change Role",
      `Select new role for this user (currently: ${currentRole})`,
      [
        ...options.map((role) => ({
          text: role.charAt(0).toUpperCase() + role.slice(1),
          onPress: () =>
            updateRole.mutate(
              { userId, data: { role: role as any } },
              {
                onSuccess: () =>
                  queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }),
                onError: () =>
                  Alert.alert("Error", "Failed to update role. Try again."),
              }
            ),
        })),
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleApprove = (userId: string, name: string) => {
    Alert.alert(
      "Approve Badge",
      `Approve Verified Student badge for ${name}?`,
      [
        {
          text: "Approve",
          onPress: () =>
            approveBadge.mutate(
              { userId },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
                  Alert.alert("Done", `${name}'s badge has been approved! ✅`);
                },
                onError: () => Alert.alert("Error", "Failed to approve badge."),
              }
            ),
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  if (profileLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!isAdminOrCEO) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, padding: 32 }]}>
        <Feather name="lock" size={48} color={colors.mutedForeground} />
        <Text style={[styles.accessTitle, { color: colors.foreground, marginTop: 16 }]}>
          Access Denied
        </Text>
        <Text style={[styles.accessSub, { color: colors.mutedForeground, marginTop: 8 }]}>
          This area is for CampusX admins only.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.primary, marginTop: 24 }]}
        >
          <Text style={[styles.backBtnText]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: "verifications", label: "Pending Badges", icon: "shield" },
    ...(isCEO ? [{ id: "users" as AdminTab, label: "All Users", icon: "users" }] : []),
  ];

  const pendingList = pendingData?.users ?? [];
  const usersList = usersData?.users ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {isCEO ? "CEO Dashboard" : "Admin Panel"}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {isCEO ? "Full control" : "Badge approvals"}
          </Text>
        </View>
        <View style={[styles.rolePill, { backgroundColor: isCEO ? "#F59E0B20" : "#A855F720", borderColor: isCEO ? "#F59E0B40" : "#A855F740" }]}>
          <Feather name="award" size={11} color={isCEO ? "#F59E0B" : "#A855F7"} />
          <Text style={[styles.rolePillText, { color: isCEO ? "#F59E0B" : "#A855F7" }]}>
            {isCEO ? "CEO" : "Admin"}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      {isCEO && (
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tab, activeTab === tab.id && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Feather
                name={tab.icon as any}
                size={14}
                color={activeTab === tab.id ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.tabText, { color: activeTab === tab.id ? colors.primary : colors.mutedForeground }]}>
                {tab.label}
                {tab.id === "verifications" && pendingList.length > 0 && (
                  ` (${pendingList.length})`
                )}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

        {/* Pending Verifications */}
        {activeTab === "verifications" && (
          <>
            {pendingLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : pendingList.length === 0 ? (
              <View style={[styles.emptyState]}>
                <Feather name="check-circle" size={48} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All clear!</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  No pending badge verifications right now.
                </Text>
              </View>
            ) : (
              pendingList.map((u: PendingVerificationItem) => (
                <View
                  key={u.clerkUserId}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={[styles.cardAvatar, { backgroundColor: colors.primary + "25", borderColor: colors.primary + "40" }]}>
                    <Text style={[styles.cardAvatarText, { color: colors.primary }]}>
                      {u.fullName.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
                      {u.fullName}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {u.faculty} · {u.level}
                    </Text>
                    <View style={styles.cardMetaRow}>
                      <Feather name="lock" size={10} color={colors.mutedForeground} />
                      <Text style={[styles.cardMatric, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {u.matricNumber || "No matric"}
                      </Text>
                      <View style={[styles.badgeTypePill, {
                        backgroundColor: u.badgeType.includes("Paid") ? "#10B98120" : "#3B82F620",
                        borderColor: u.badgeType.includes("Paid") ? "#10B98140" : "#3B82F640",
                      }]}>
                        <Text style={[styles.badgeTypePillText, { color: u.badgeType.includes("Paid") ? "#10B981" : "#3B82F6" }]}>
                          {u.badgeType}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleApprove(u.clerkUserId, u.fullName)}
                    disabled={approveBadge.isPending}
                    style={[styles.approveBtn, { backgroundColor: "#10B98120", borderColor: "#10B98140" }]}
                  >
                    <Feather name="check-circle" size={14} color="#10B981" />
                    <Text style={[styles.approveBtnText, { color: "#10B981" }]}>Approve</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {/* User Management (CEO only) */}
        {activeTab === "users" && isCEO && (
          <>
            {/* Search */}
            <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, matric or email..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Feather name="x" size={15} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            {usersLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : usersList.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="users" size={48} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No users found.</Text>
              </View>
            ) : (
              usersList.map((u: AdminUserItem) => (
                <View
                  key={u.clerkUserId}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={[styles.cardAvatar, { backgroundColor: colors.primary + "25", borderColor: colors.primary + "40" }]}>
                    <Text style={[styles.cardAvatarText, { color: colors.primary }]}>
                      {u.fullName.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
                      {u.fullName}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {u.faculty} · {u.level} · {u.postCount} posts
                    </Text>
                    {u.matricNumber ? (
                      <View style={styles.cardMetaRow}>
                        <Feather name="lock" size={10} color={colors.mutedForeground} />
                        <Text style={[styles.cardMatric, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {u.matricNumber}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRoleChange(u.clerkUserId, u.role)}
                    disabled={updateRole.isPending}
                    style={[styles.roleBtn, {
                      backgroundColor: (ROLE_COLORS[u.role as UserRole] ?? "#6B7280") + "20",
                      borderColor: (ROLE_COLORS[u.role as UserRole] ?? "#6B7280") + "40",
                    }]}
                  >
                    <Text style={[styles.roleBtnText, { color: ROLE_COLORS[u.role as UserRole] ?? "#6B7280" }]}>
                      {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </Text>
                    <Feather name="chevron-down" size={11} color={ROLE_COLORS[u.role as UserRole] ?? "#6B7280"} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backArrow: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.4 },
  headerSub: { fontSize: 11, marginTop: 1 },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  rolePillText: { fontSize: 11, fontWeight: "700" },
  tabs: { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 16 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: "600" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  cardAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1.5, flexShrink: 0 },
  cardAvatarText: { fontSize: 18, fontWeight: "700" },
  cardName: { fontSize: 14, fontWeight: "700" },
  cardMeta: { fontSize: 11, marginTop: 2 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" },
  cardMatric: { fontSize: 11, fontFamily: "monospace" },
  badgeTypePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  badgeTypePillText: { fontSize: 10, fontWeight: "700" },
  approveBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, flexShrink: 0 },
  approveBtnText: { fontSize: 12, fontWeight: "700" },
  roleBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, flexShrink: 0 },
  roleBtnText: { fontSize: 12, fontWeight: "700" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  accessTitle: { fontSize: 22, fontWeight: "700" },
  accessSub: { fontSize: 14, textAlign: "center" },
  backBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  backBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
