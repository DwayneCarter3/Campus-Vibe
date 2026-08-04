import { useAuth, useUser as useClerkUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useGetUserPosts,
  getGetUserPostsQueryKey,
  useGetUserServices,
  getGetUserServicesQueryKey,
  useRequestPremiumBadge,
  useUpdateMyProfile,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import * as ImagePicker from "expo-image-picker";

const CEO_EMAIL = "dwaynecartergabriel@gmail.com";

const CAMPUS_TITLE_COLORS: Record<string, string> = {
  "CEO": "#F59E0B",
  "Admin": "#A855F7",
  "Moderator": "#3B82F6",
  "Campus Daddy": "#F97316",
  "Godfather": "#EC4899",
  "Big Daddy": "#FF3399",
  "Campus Rep": "#10B981",
  "Rising Star": "#38BDF8",
};

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  const { user: clerkUser } = useClerkUser();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"gist" | "hustles">("gist");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);

  const { data: profile, isLoading } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });
  const requestBadge = useRequestPremiumBadge();
  const updateProfile = useUpdateMyProfile();
  const requestUploadUrl = useRequestUploadUrl();

  const clerkUserId = clerkUser?.id ?? "";
  const { data: postsData } = useGetUserPosts(clerkUserId, {}, { query: { queryKey: getGetUserPostsQueryKey(clerkUserId, {}), enabled: !!clerkUserId } });
  const { data: servicesData } = useGetUserServices(clerkUserId, {}, { query: { queryKey: getGetUserServicesQueryKey(clerkUserId, {}), enabled: !!clerkUserId } });

  const myPosts = postsData?.posts ?? [];
  const myServices = servicesData?.services ?? [];

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 0;

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signOut();
  };

  const handleRequestBadge = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    requestBadge.mutate(
      { data: { badgeType: "promo" as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          Alert.alert("Request Sent! ✅", "Your badge request has been submitted. An admin will review it shortly.");
        },
        onError: () => Alert.alert("Error", "Could not submit badge request. Try again."),
      }
    );
  };

  const handleAdminNav = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/admin");
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library to upload an avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const filename = asset.uri.split("/").pop() ?? "avatar.jpg";
    const contentType = asset.mimeType ?? "image/jpeg";

    setIsAvatarUploading(true);
    setAvatarModalOpen(false);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: { name: filename, size: asset.fileSize ?? 0, contentType },
      });
      const blob = await fetch(asset.uri).then((r) => r.blob());
      const upload = await fetch(uploadURL, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });
      if (!upload.ok) throw new Error("Upload failed");
      const newAvatarUrl = `/api/storage${objectPath}`;
      await updateProfile.mutateAsync({ data: { avatarUrl: newAvatarUrl } });
      queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Upload failed", "Could not upload your photo. Please try again.");
    } finally {
      setIsAvatarUploading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const displayName = profile?.fullName ?? clerkUser?.fullName ?? "Student";
  const faculty = profile?.faculty ?? "—";
  const level = profile?.level ?? "—";
  const campus = profile?.campus ?? "LASU Ojo";
  const campusTitle = profile?.campusTitle;
  const titleColor = campusTitle ? (CAMPUS_TITLE_COLORS[campusTitle] ?? colors.primary) : null;
  const hasMatric = !!(profile?.matricNumber && profile.matricNumber.trim());
  const verificationStatus = (profile as any)?.verificationStatus ?? "none";
  const isVerified = verificationStatus === "approved";
  const badgePending = verificationStatus === "pending_promo" || verificationStatus === "pending_paid";
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? "";
  const isAdmin = profile?.isAdmin;
  const isCEO = (profile as any)?.role === "ceo" || clerkEmail === CEO_EMAIL;
  const isAdminOrCEO = isCEO || isAdmin || (profile as any)?.role === "admin";
  const totalFires = myPosts.reduce((s, p) => s + p.likesCount, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Profile</Text>
        <TouchableOpacity onPress={handleSignOut} style={[styles.signOutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="log-out" size={15} color={colors.mutedForeground} />
          <Text style={[styles.signOutText, { color: colors.mutedForeground }]}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 + bottomPad }} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Avatar — tap for full-screen view */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setAvatarModalOpen(true)}
            style={[styles.bigAvatar, { backgroundColor: colors.primary + "25", borderColor: colors.primary + "40" }]}
            disabled={isAvatarUploading}
          >
            {isAvatarUploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.bigAvatarImg} />
            ) : (
              <Text style={[styles.bigAvatarText, { color: colors.primary }]}>{displayName.charAt(0)}</Text>
            )}
            {isVerified && !isAvatarUploading && (
              <View style={styles.verifiedDot}>
                <Feather name="check" size={8} color="#fff" />
              </View>
            )}
            {/* Camera badge */}
            {!isAvatarUploading && (
              <View style={[styles.cameraBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="camera" size={9} color={colors.mutedForeground} />
              </View>
            )}
          </TouchableOpacity>

          {/* Name + campus title */}
          <Text style={[styles.profileName, { color: colors.foreground }]}>{displayName}</Text>
          {campusTitle && (
            <View style={[styles.titlePill, { backgroundColor: (titleColor ?? colors.primary) + "20", borderColor: (titleColor ?? colors.primary) + "40" }]}>
              {isCEO && <Feather name="award" size={10} color={titleColor ?? colors.primary} />}
              <Text style={[styles.titlePillText, { color: titleColor ?? colors.primary }]}>{campusTitle}</Text>
            </View>
          )}

          {profile && (
            <View style={styles.profileBadges}>
              <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{faculty}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.accent + "20" }]}>
                <Text style={[styles.badgeText, { color: colors.accent }]}>{level}</Text>
              </View>
              {isVerified && (
                <View style={[styles.badge, { backgroundColor: "#10B98120", flexDirection: "row", gap: 4 }]}>
                  <Feather name="shield" size={11} color="#10B981" />
                  <Text style={[styles.badgeText, { color: "#10B981" }]}>Verified</Text>
                </View>
              )}
            </View>
          )}

          <View style={[styles.campusRow, { backgroundColor: colors.surface }]}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.campusText, { color: colors.mutedForeground }]}>{campus}</Text>
          </View>

          {/* Stats */}
          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.foreground }]}>{myPosts.length}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Gist</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.foreground }]}>{myServices.length}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Hustles</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.foreground }]}>{totalFires}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>🔥 Total</Text>
            </View>
          </View>
        </View>

        {/* ── Verified Student Badge Section ─────────── */}
        {hasMatric && !isVerified && (
          <TouchableOpacity
            activeOpacity={badgePending ? 1 : 0.75}
            onPress={badgePending ? undefined : handleRequestBadge}
            disabled={requestBadge.isPending || badgePending}
            style={[
              styles.actionCard,
              {
                backgroundColor: "#0EA5E910",
                borderColor: "#0EA5E940",
              },
            ]}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#0EA5E920", borderColor: "#0EA5E940" }]}>
              <Feather name="star" size={16} color="#38BDF8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: "#BAE6FD" }]}>Verified Student Badge</Text>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                {badgePending
                  ? "Your request is pending admin review ⏳"
                  : "Tap to request your blue verification badge — free!"}
              </Text>
            </View>
            {requestBadge.isPending ? (
              <ActivityIndicator size="small" color="#38BDF8" />
            ) : badgePending ? (
              <View style={[styles.pendingPill, { backgroundColor: "#F59E0B20", borderColor: "#F59E0B40" }]}>
                <Text style={[styles.pendingPillText, { color: "#F59E0B" }]}>Pending</Text>
              </View>
            ) : (
              <Feather name="chevron-right" size={16} color="#38BDF8" />
            )}
          </TouchableOpacity>
        )}

        {/* Already verified banner */}
        {isVerified && (
          <View style={[styles.actionCard, { backgroundColor: "#10B98110", borderColor: "#10B98130" }]}>
            <View style={[styles.actionIconBox, { backgroundColor: "#10B98120", borderColor: "#10B98140" }]}>
              <Feather name="shield" size={16} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: "#6EE7B7" }]}>Verified Student ✓</Text>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                Your blue verification badge is active on your profile.
              </Text>
            </View>
          </View>
        )}

        {/* No matric banner */}
        {!hasMatric && (
          <View style={[styles.actionCard, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" }]}>
            <Feather name="alert-circle" size={16} color={colors.accent} />
            <Text style={[styles.onboardingText, { color: colors.accent }]}>
              Add your matric number on the web app to unlock the Verified badge and post hustles.
            </Text>
          </View>
        )}

        {/* ── Admin Control Panel ─────────────────── */}
        {isAdminOrCEO && (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleAdminNav}
            style={[
              styles.actionCard,
              {
                backgroundColor: isCEO ? "#F59E0B10" : colors.primary + "10",
                borderColor: isCEO ? "#F59E0B40" : colors.primary + "30",
              },
            ]}
          >
            <View style={[
              styles.actionIconBox,
              {
                backgroundColor: isCEO ? "#F59E0B20" : colors.primary + "20",
                borderColor: isCEO ? "#F59E0B40" : colors.primary + "30",
              },
            ]}>
              <Feather name="award" size={16} color={isCEO ? "#F59E0B" : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: isCEO ? "#FCD34D" : colors.primary }]}>
                {isCEO ? "CEO Control Panel" : "Campus Admin Panel"}
              </Text>
              <Text style={[styles.actionSub, { color: colors.mutedForeground }]}>
                {isCEO
                  ? "Manage roles, approve badges, view all users"
                  : "Review and approve student verification badges"}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={isCEO ? "#F59E0B" : colors.primary} />
          </TouchableOpacity>
        )}

        {/* Tabs */}
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {(["gist", "hustles"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
                {tab === "gist" ? `My Gist (${myPosts.length})` : `My Hustles (${myServices.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabContent}>
          {activeTab === "gist" ? (
            myPosts.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="radio" size={36} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No gist yet</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Go to the Amebo tab and drop your first gist!</Text>
              </View>
            ) : (
              myPosts.map((post) => (
                <View key={post.id} style={[styles.miniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {(post as any).isAnonymous && (
                    <View style={[styles.anonBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Feather name="eye-off" size={10} color={colors.mutedForeground} />
                      <Text style={[styles.anonText, { color: colors.mutedForeground }]}>Anonymous</Text>
                    </View>
                  )}
                  <Text style={[styles.miniContent, { color: colors.foreground }]} numberOfLines={3}>{post.content}</Text>
                  <View style={styles.miniMeta}>
                    <Text style={[styles.miniMetaText, { color: colors.mutedForeground }]}>
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    </Text>
                    <View style={styles.miniReactions}>
                      <Text style={[styles.miniReactionText, { color: colors.mutedForeground }]}>🔥 {post.likesCount}</Text>
                      <Text style={[styles.miniReactionText, { color: colors.mutedForeground }]}>🧢 {post.noCapsCount}</Text>
                    </View>
                  </View>
                </View>
              ))
            )
          ) : (
            myServices.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="briefcase" size={36} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No listings yet</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Go to the Hustle tab to list your first service!</Text>
              </View>
            ) : (
              myServices.map((service) => (
                <View key={service.id} style={[styles.miniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.miniCardHeader}>
                    <View style={[styles.miniCategoryBadge, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={[styles.miniCategoryText, { color: colors.primary }]}>{service.category}</Text>
                    </View>
                    {service.price ? <Text style={[styles.miniPrice, { color: colors.accent }]}>{service.price}</Text> : null}
                  </View>
                  <Text style={[styles.miniTitle, { color: colors.foreground }]}>{service.title}</Text>
                  <Text style={[styles.miniDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{service.description}</Text>
                </View>
              ))
            )
          )}
        </View>
      </ScrollView>

      {/* Full-screen avatar modal */}
      <Modal
        visible={avatarModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAvatarModalOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setAvatarModalOpen(false)}
        >
          <View style={styles.modalContent}>
            {profile?.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={styles.modalAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.modalAvatarFallback, { backgroundColor: colors.primary + "30", borderColor: colors.primary + "60" }]}>
                <Text style={[styles.modalAvatarFallbackText, { color: colors.primary }]}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.modalName}>{displayName}</Text>
            <TouchableOpacity
              onPress={handlePickPhoto}
              style={styles.changePhotoBtn}
              activeOpacity={0.8}
            >
              <Feather name="camera" size={14} color="#fff" />
              <Text style={styles.changePhotoBtnText}>Change Photo</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  signOutBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  signOutText: { fontSize: 13 },

  profileCard: { margin: 16, borderRadius: 20, borderWidth: 1, padding: 20, alignItems: "center" },
  bigAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", borderWidth: 2, marginBottom: 12, position: "relative" },
  bigAvatarText: { fontSize: 36, fontWeight: "700" },
  bigAvatarImg: { width: 80, height: 80, borderRadius: 40 },
  cameraBadge: { position: "absolute", bottom: 0, left: 0, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center" },
  modalContent: { alignItems: "center", gap: 16 },
  modalAvatar: { width: 260, height: 260, borderRadius: 130, borderWidth: 3, borderColor: "rgba(255,255,255,0.2)" },
  modalAvatarFallback: { width: 260, height: 260, borderRadius: 130, alignItems: "center", justifyContent: "center", borderWidth: 3 },
  modalAvatarFallbackText: { fontSize: 100, fontWeight: "800" },
  modalName: { color: "#fff", fontSize: 18, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  changePhotoBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  changePhotoBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  verifiedDot: { position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#090912" },
  profileName: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
  titlePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginBottom: 10 },
  titlePillText: { fontSize: 11, fontWeight: "700" },
  profileBadges: { flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  campusRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  campusText: { fontSize: 12 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", width: "100%", marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  statItem: { alignItems: "center" },
  statNum: { fontSize: 22, fontWeight: "700" },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 30 },

  actionCard: { marginHorizontal: 16, marginBottom: 10, borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  actionIconBox: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, flexShrink: 0 },
  actionTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  actionSub: { fontSize: 11, lineHeight: 15 },
  onboardingText: { flex: 1, fontSize: 12, lineHeight: 16, marginLeft: 4 },
  pendingPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  pendingPillText: { fontSize: 11, fontWeight: "700" },

  tabs: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16, marginTop: 8 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
  tabText: { fontSize: 14, fontWeight: "600" },
  tabContent: { padding: 16, gap: 12 },

  miniCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  miniCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  miniCategoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  miniCategoryText: { fontSize: 11, fontWeight: "600" },
  miniPrice: { fontSize: 14, fontWeight: "700" },
  miniTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  miniDesc: { fontSize: 14, lineHeight: 20 },
  miniContent: { fontSize: 14, lineHeight: 20 },
  miniMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  miniMetaText: { fontSize: 12 },
  miniReactions: { flexDirection: "row", gap: 10 },
  miniReactionText: { fontSize: 12 },
  anonBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginBottom: 6 },
  anonText: { fontSize: 10, fontWeight: "600" },
  emptyState: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
