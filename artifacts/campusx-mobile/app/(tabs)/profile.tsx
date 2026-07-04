import { useAuth, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDistanceToNow } from "date-fns";
import {
  useGetMyProfile,
  useGetUserPosts,
  useGetUserServices,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { user: clerkUser } = useUser();
  const [activeTab, setActiveTab] = useState<"gist" | "hustles">("gist");

  const { data: profile, isLoading } = useGetMyProfile();
  const clerkUserId = clerkUser?.id ?? "";
  const { data: postsData } = useGetUserPosts(clerkUserId, {}, { query: { enabled: !!clerkUserId } });
  const { data: servicesData } = useGetUserServices(clerkUserId, {}, { query: { enabled: !!clerkUserId } });

  const myPosts = postsData?.posts ?? [];
  const myServices = servicesData?.services ?? [];

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 0;

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signOut();
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
          <View style={[styles.bigAvatar, { backgroundColor: colors.primary + "25", borderColor: colors.primary + "40" }]}>
            <Text style={[styles.bigAvatarText, { color: colors.primary }]}>{displayName.charAt(0)}</Text>
          </View>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{displayName}</Text>

          {profile && (
            <View style={styles.profileBadges}>
              <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{faculty}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.accent + "20" }]}>
                <Text style={[styles.badgeText, { color: colors.accent }]}>{level}</Text>
              </View>
            </View>
          )}

          <View style={[styles.campusRow, { backgroundColor: colors.surface }]}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.campusText, { color: colors.mutedForeground }]}>{campus}</Text>
          </View>

          {profile && !profile.matricNumber && (
            <View style={[styles.onboardingBanner, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "40" }]}>
              <Feather name="alert-circle" size={14} color={colors.accent} />
              <Text style={[styles.onboardingText, { color: colors.accent }]}>
                Complete your profile on the web app to get verified ✓
              </Text>
            </View>
          )}

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
  bigAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", borderWidth: 2, marginBottom: 12 },
  bigAvatarText: { fontSize: 36, fontWeight: "700" },
  profileName: { fontSize: 20, fontWeight: "700", marginBottom: 10 },
  profileBadges: { flexDirection: "row", gap: 8, marginBottom: 10 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  campusRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  campusText: { fontSize: 12 },
  onboardingBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginTop: 10, maxWidth: "100%" },
  onboardingText: { flex: 1, fontSize: 12, lineHeight: 16 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", width: "100%", marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  statItem: { alignItems: "center" },
  statNum: { fontSize: 22, fontWeight: "700" },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 30 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16 },
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
  emptyState: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
