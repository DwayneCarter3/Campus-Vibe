import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Platform,
  RefreshControl,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  useListPosts,
  getListPostsQueryKey,
  useListNotifications,
  getListNotificationsQueryKey,
  useLikePost,
  useNoCapPost,
  useCreatePost,
  Post,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { UserVerificationMarks } from "@/components/UserVerificationMarks";

const FACULTIES = [
  "Arts", "Science", "Law", "Social Sciences", "Education",
  "Engineering", "Management Sciences", "Communication & Media Studies",
];

function PostCard({ post }: { post: Post }) {
  const colors = useColors();
  const queryClient = useQueryClient();

  const likeMutation = useLikePost({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() }),
    },
  });
  const noCapMutation = useNoCapPost({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() }),
    },
  });

  const handleFire = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    likeMutation.mutate({ postId: post.id });
  };

  const handleNoCap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    noCapMutation.mutate({ postId: post.id });
  };

  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {post.authorName.charAt(0)}
          </Text>
        </View>
        <View style={styles.authorInfo}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>{post.authorName}</Text>
            {!post.isAnonymous && <UserVerificationMarks status={post.authorVerificationStatus} />}
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>{post.authorFaculty}</Text>
            </View>
            {!post.isAnonymous && (
              <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{post.authorLevel}</Text>
            )}
            <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo}</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text>

      <View style={[styles.reactions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={handleFire}
          style={[styles.reactionBtn, post.isLikedByMe && { backgroundColor: "#FF791A22" }]}
          activeOpacity={0.7}
          disabled={likeMutation.isPending}
        >
          <Text style={styles.reactionEmoji}>🔥</Text>
          <Text style={[styles.reactionCount, { color: post.isLikedByMe ? "#FF791A" : colors.mutedForeground }]}>
            {post.likesCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNoCap}
          style={[styles.reactionBtn, post.isNoCapByMe && { backgroundColor: "#3B82F622" }]}
          activeOpacity={0.7}
          disabled={noCapMutation.isPending}
        >
          <Text style={styles.reactionEmoji}>🧢</Text>
          <Text style={[styles.reactionCount, { color: post.isNoCapByMe ? "#3B82F6" : colors.mutedForeground }]}>
            {post.noCapsCount}
          </Text>
        </TouchableOpacity>

        <View style={styles.reactionSpacer} />
        <Text style={[styles.timeTextSmall, { color: colors.mutedForeground }]}>LASU Ojo</Text>
      </View>
    </View>
  );
}

function ComposeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState("");
  const [showFacultyPicker, setShowFacultyPicker] = useState(false);
  const [selectedFaculty] = useState("LASU Ojo");

  const createPost = useCreatePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setContent("");
        onClose();
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    },
  });

  const handlePost = () => {
    if (!content.trim()) return;
    createPost.mutate({ data: { content: content.trim() } });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.modalHeaderBtn}>
              <Text style={[styles.modalHeaderBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Drop Gist 📢</Text>
            <TouchableOpacity
              onPress={handlePost}
              disabled={!content.trim() || createPost.isPending}
              style={[styles.postButton, { backgroundColor: content.trim() && !createPost.isPending ? colors.primary : colors.muted }]}
            >
              {createPost.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.postButtonText, { color: content.trim() ? "#fff" : colors.mutedForeground }]}>Post</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.composeRow}>
              <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>G</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={[styles.facultyPicker, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.facultyPickerText, { color: colors.primary }]}>{selectedFaculty}</Text>
                </View>
              </View>
            </View>

            <TextInput
              style={[styles.contentInput, { color: colors.foreground }]}
              value={content}
              onChangeText={setContent}
              placeholder="Wetin happen for campus today? Drop the gist... 🗣️"
              placeholderTextColor={colors.mutedForeground}
              multiline
              autoFocus
              maxLength={500}
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{content.length}/500</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function AmeboFeed() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [composeOpen, setComposeOpen] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useListPosts();
  const { data: notificationData } = useListNotifications(
    { limit: 50 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 50 }),
        refetchInterval: 12_000,
      },
    },
  );
  const posts = data?.posts ?? [];
  const unreadNotifications = notificationData?.notifications?.filter((item) => !item.isRead).length ?? 0;

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 0;

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Amebo</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>LASU Ojo campus gist 🏛️</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => router.push("/notifications")}
            style={styles.notificationBtn}
          >
            <Feather name="bell" size={20} color={colors.foreground} />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setComposeOpen(true)} style={[styles.composeBtn, { backgroundColor: colors.primary }]}>
            <Feather name="edit-3" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Couldn't load posts</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + bottomPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="radio" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No gist yet</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Be the first to drop something on the feed</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: 88 + bottomPad }]}
        onPress={() => { setComposeOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <ComposeModal visible={composeOpen} onClose={() => setComposeOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  headerTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  notificationBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", position: "relative" },
  notificationBadge: {
    position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8,
    paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#ef4444",
  },
  notificationBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  composeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  listContent: { paddingTop: 12, paddingHorizontal: 16, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700" },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 15, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  timeText: { fontSize: 11 },
  timeTextSmall: { fontSize: 11 },
  content: { fontSize: 15, lineHeight: 22, marginTop: 12 },
  reactions: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1,
  },
  reactionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontSize: 13, fontWeight: "600" },
  reactionSpacer: { flex: 1 },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#FF3399", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 40 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: "#fff", fontWeight: "700" },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  modalHeaderBtn: { padding: 4 },
  modalHeaderBtnText: { fontSize: 15 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  postButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  postButtonText: { fontSize: 15, fontWeight: "700" },
  modalBody: { flex: 1, padding: 16 },
  composeRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 16 },
  facultyPicker: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: "flex-start" },
  facultyPickerText: { fontSize: 12, fontWeight: "600" },
  contentInput: { fontSize: 16, lineHeight: 24, minHeight: 120 },
  charCount: { fontSize: 12, textAlign: "right", marginTop: 8 },
});
