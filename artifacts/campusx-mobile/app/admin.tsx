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
  getGetMyProfileQueryKey,
  useListAdminUsers,
  getListAdminUsersQueryKey,
  useUpdateUserRole,
  useListPendingVerifications,
  getListPendingVerificationsQueryKey,
  useApproveBadge,
  useRejectBadge,
  useSetUserVerification,
  useListAdminReports,
  getListAdminReportsQueryKey,
  useReviewAdminReport,
  useDeletePost,
  useDeleteService,
  getListServicesQueryKey,
} from "@workspace/api-client-react";
import type { AdminUserItem, PendingVerificationItem, ReportItem } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useUser } from "@clerk/expo";

const CEO_EMAIL = "dwaynecartergabriel@gmail.com";

type AdminTab = "verifications" | "users" | "reports";
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
        enabled: isAdminOrCEO,
        refetchOnMount: "always",
      },
    }
  );

  const { data: pendingData, isLoading: pendingLoading } = useListPendingVerifications({
    query: {
      queryKey: getListPendingVerificationsQueryKey(),
      enabled: isAdminOrCEO,
      refetchOnMount: "always",
      refetchInterval: 15000,
    },
  });

  const { data: reportsData, isLoading: reportsLoading } = useListAdminReports({
    query: {
      queryKey: getListAdminReportsQueryKey(),
      enabled: isAdminOrCEO,
      refetchOnMount: "always",
      refetchInterval: 15000,
    },
  });

  const updateRole = useUpdateUserRole();
  const approveBadge = useApproveBadge();
  const rejectBadge = useRejectBadge();
  const setUserVerification = useSetUserVerification();
  const reviewReport = useReviewAdminReport();
  const deleteReportedPost = useDeletePost();
  const deleteReportedService = useDeleteService();

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
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
                },
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
    approveBadge.mutate({ userId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      },
      onError: () => Alert.alert("Error", `Failed to approve ${name}'s badge.`),
    });
  };

  const handleVerificationToggle = (userId: string, name: string, verified: boolean) => {
    setUserVerification.mutate({ userId, data: { verified: !verified, ...(!verified ? { badgeTier: "student" } : {}) } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      },
      onError: () => Alert.alert("Error", `Could not update ${name}'s verification.`),
    });
  };

  const handleReject = (userId: string, name: string) => {
    rejectBadge.mutate({ userId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPendingVerificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
      },
      onError: () => Alert.alert("Error", `Could not reject ${name}'s verification.`),
    });
  };

  const invalidateReports = () => {
    void queryClient.invalidateQueries({ queryKey: getListAdminReportsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
  };

  const handleReviewReport = (reportId: number, status: "reviewed" | "dismissed") => {
    reviewReport.mutate({ reportId, data: { status } }, {
      onSuccess: invalidateReports,
      onError: () => Alert.alert("Error", "Could not update the report. Try again."),
    });
  };

  const handleDeleteReportedContent = (report: ReportItem) => {
    const contentLabel = report.serviceId ? "listing" : "post";
    Alert.alert(
      `Delete ${contentLabel}`,
      `Permanently delete "${report.targetTitle}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const options = {
              onSuccess: () => {
                invalidateReports();
                Alert.alert("Content deleted", `The reported ${contentLabel} was removed.`);
              },
              onError: () => Alert.alert("Error", `Could not delete this ${contentLabel}.`),
            };
            if (report.serviceId !== null) {
              deleteReportedService.mutate({ serviceId: report.serviceId }, options);
            } else if (report.postId !== null) {
              deleteReportedPost.mutate({ postId: report.postId }, options);
            }
          },
        },
      ],
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
    { id: "reports", label: "Reports", icon: "flag" },
    ...(isAdminOrCEO ? [{ id: "users" as AdminTab, label: "All Users", icon: "users" }] : []),
  ];

  const pendingList = pendingData?.users ?? [];
  const usersList = usersData?.users ?? [];
  const pendingReports = reportsData?.reports.filter((report) => report.status === "pending") ?? [];

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
      {isAdminOrCEO && (
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
                {tab.id === "reports" && pendingReports.length > 0 && ` (${pendingReports.length})`}
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
                    <Text style={[styles.approveBtnText, { color: "#10B981" }]}>Approve purchased tier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleReject(u.clerkUserId, u.fullName)}
                    disabled={rejectBadge.isPending}
                    style={[styles.approveBtn, { backgroundColor: "#EF444420", borderColor: "#EF444440" }]}
                  >
                    <Feather name="x-circle" size={14} color="#F87171" />
                    <Text style={[styles.approveBtnText, { color: "#F87171" }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {/* Pending reports */}
        {activeTab === "reports" && (
          <>
            {reportsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : pendingReports.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="check-circle" size={48} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No pending reports</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Reported posts and listings will appear here.</Text>
              </View>
            ) : (
              pendingReports.map((report: ReportItem) => (
                <View key={report.id} style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.reportHeading}>
                    <View style={[styles.reportType, { backgroundColor: colors.primary + "20" }]}>
                      <Feather name={report.serviceId ? "shopping-bag" : "file-text"} size={13} color={colors.primary} />
                      <Text style={[styles.reportTypeText, { color: colors.primary }]}>{report.serviceId ? "Listing" : "Post"}</Text>
                    </View>
                    <Text style={[styles.reportDate, { color: colors.mutedForeground }]}>{new Date(report.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.reportTitle, { color: colors.foreground }]}>{report.targetTitle}</Text>
                  <Text style={[styles.reportReason, { color: colors.mutedForeground }]}>Reason: {report.reason}</Text>
                  <View style={[styles.reportActions, { borderTopColor: colors.border }]}>
                    <TouchableOpacity
                      onPress={() => handleDeleteReportedContent(report)}
                      disabled={deleteReportedPost.isPending || deleteReportedService.isPending}
                      style={[styles.reportAction, { borderColor: "#EF444440", backgroundColor: "#EF444420" }]}
                    >
                      <Feather name="trash-2" size={13} color="#EF4444" />
                      <Text style={[styles.reportActionText, { color: "#EF4444" }]}>Delete content</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleReviewReport(report.id, "dismissed")}
                      disabled={reviewReport.isPending}
                      style={[styles.reportAction, { borderColor: colors.border }]}
                    >
                      <Feather name="x" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.reportActionText, { color: colors.mutedForeground }]}>Dismiss</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleReviewReport(report.id, "reviewed")}
                      disabled={reviewReport.isPending}
                      style={[styles.reportAction, { borderColor: "#10B98140", backgroundColor: "#10B98120" }]}
                    >
                      <Feather name="check" size={13} color="#10B981" />
                      <Text style={[styles.reportActionText, { color: "#10B981" }]}>Reviewed</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* User Management (role changes remain CEO only) */}
        {activeTab === "users" && isAdminOrCEO && (
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
                  <View style={styles.userActions}>
                    <TouchableOpacity
                      onPress={() => handleRoleChange(u.clerkUserId, u.role)}
                      disabled={updateRole.isPending || !isCEO}
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
                    {(() => {
                      const verified = ["approved", "Student_Verified", "Gold_Approved", "Premium_Approved"].includes(u.verificationStatus);
                      const protectedAccount = u.role === "admin" || u.role === "ceo";
                      return (
                        <TouchableOpacity
                          onPress={() => handleVerificationToggle(u.clerkUserId, u.fullName, verified)}
                          disabled={setUserVerification.isPending || protectedAccount}
                          style={[styles.verifyBtn, {
                            backgroundColor: protectedAccount ? "#F59E0B20" : verified ? "#EF444420" : "#10B98120",
                            borderColor: protectedAccount ? "#F59E0B40" : verified ? "#EF444440" : "#10B98140",
                          }]}
                        >
                          <Feather name={protectedAccount ? "shield" : verified ? "x-circle" : "check-circle"} size={12} color={protectedAccount ? "#FBBF24" : verified ? "#F87171" : "#34D399"} />
                          <Text style={[styles.verifyBtnText, { color: protectedAccount ? "#FBBF24" : verified ? "#F87171" : "#34D399" }]}>
                            {protectedAccount ? "Always Verified" : verified ? "Revoke Verification" : "Approve Verification"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>
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
  card: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  reportCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 9 },
  reportHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reportType: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  reportTypeText: { fontSize: 11, fontWeight: "700" },
  reportDate: { fontSize: 11 },
  reportTitle: { fontSize: 15, fontWeight: "700" },
  reportReason: { fontSize: 13 },
  reportActions: { flexDirection: "row", flexWrap: "wrap", gap: 7, borderTopWidth: 1, paddingTop: 10, marginTop: 2 },
  reportAction: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, borderWidth: 1 },
  reportActionText: { fontSize: 11, fontWeight: "700" },
  userActions: { width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 8 },
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
  verifyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, borderWidth: 1, flexShrink: 0 },
  verifyBtnText: { fontSize: 10, fontWeight: "700" },
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
