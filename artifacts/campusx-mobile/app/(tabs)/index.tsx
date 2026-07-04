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
import { useColors } from "@/hooks/useColors";
import { useApp, Post } from "@/context/AppContext";

const FACULTIES = [
  "Arts", "Science", "Law", "Social Sciences", "Education",
  "Engineering", "Management Sciences", "Communication & Media Studies",
];

function PostCard({ post }: { post: Post }) {
  const colors = useColors();
  const { firePost, noCapPost } = useApp();

  const handleFire = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    firePost(post.id);
  };

  const handleNoCap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    noCapPost(post.id);
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
          <Text style={[styles.authorName, { color: colors.foreground }]}>{post.authorName}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>{post.authorFaculty}</Text>
            </View>
            <Text style={[styles.timeText, { color: colors.mutedForeground }]}>{timeAgo}</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.content, { color: colors.foreground }]}>{post.content}</Text>

      <View style={[styles.reactions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={handleFire}
          style={[
            styles.reactionBtn,
            post.firedByMe && { backgroundColor: "#FF791A22" },
          ]}
          activeOpacity={0.7}
        >
          <Text style={styles.reactionEmoji}>🔥</Text>
          <Text style={[styles.reactionCount, { color: post.firedByMe ? "#FF791A" : colors.mutedForeground }]}>
            {post.fireCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNoCap}
          style={[
            styles.reactionBtn,
            post.noCapByMe && { backgroundColor: "#3B82F622" },
          ]}
          activeOpacity={0.7}
        >
          <Text style={styles.reactionEmoji}>🧢</Text>
          <Text style={[styles.reactionCount, { color: post.noCapByMe ? "#3B82F6" : colors.mutedForeground }]}>
            {post.noCapCount}
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
  const { addPost, user, updateUser } = useApp();
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState(user.name);
  const [selectedFaculty, setSelectedFaculty] = useState(user.faculty);
  const [showFacultyPicker, setShowFacultyPicker] = useState(false);
  const insets = useSafeAreaInsets();

  const handlePost = () => {
    if (!content.trim()) return;
    if (authorName.trim() !== user.name) updateUser({ name: authorName.trim() });
    if (selectedFaculty !== user.faculty) updateUser({ faculty: selectedFaculty });
    addPost(content.trim());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setContent("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.modalHeaderBtn}>
              <Text style={[styles.modalHeaderBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Drop Gist 📢</Text>
            <TouchableOpacity
              onPress={handlePost}
              disabled={!content.trim()}
              style={[styles.postButton, { backgroundColor: content.trim() ? colors.primary : colors.muted }]}
            >
              <Text style={[styles.postButtonText, { color: content.trim() ? "#fff" : colors.mutedForeground }]}>
                Post
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.composeRow}>
              <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{authorName.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.nameInput, { color: colors.foreground, borderBottomColor: colors.border }]}
                  value={authorName}
                  onChangeText={setAuthorName}
                  placeholder="Your name"
                  placeholderTextColor={colors.mutedForeground}
                />
                <TouchableOpacity
                  onPress={() => setShowFacultyPicker(true)}
                  style={[styles.facultyPicker, { backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.facultyPickerText, { color: colors.primary }]}>{selectedFaculty}</Text>
                  <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
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

          {showFacultyPicker && (
            <View style={[styles.pickerOverlay, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Select Faculty</Text>
                <TouchableOpacity onPress={() => setShowFacultyPicker(false)}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              {FACULTIES.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: colors.border },
                    selectedFaculty === f && { backgroundColor: colors.primary + "18" },
                  ]}
                  onPress={() => { setSelectedFaculty(f); setShowFacultyPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, { color: selectedFaculty === f ? colors.primary : colors.foreground }]}>
                    {f}
                  </Text>
                  {selectedFaculty === f && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function AmeboFeed() {
  const colors = useColors();
  const { posts } = useApp();
  const insets = useSafeAreaInsets();
  const [composeOpen, setComposeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Amebo</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>LASU Ojo campus gist 🏛️</Text>
        </View>
        <TouchableOpacity onPress={() => setComposeOpen(true)} style={[styles.composeBtn, { backgroundColor: colors.primary }]}>
          <Feather name="edit-3" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 + bottomPad }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={posts.length > 0}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  composeBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  listContent: { paddingTop: 12, paddingHorizontal: 16, gap: 12 },
  card: {
    borderRadius: 16, borderWidth: 1,
    padding: 16, overflow: "hidden",
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center",
  },
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
  reactionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { fontSize: 13, fontWeight: "600" },
  reactionSpacer: { flex: 1 },
  fab: {
    position: "absolute", right: 20,
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#FF3399", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 40 },
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
  nameInput: {
    fontSize: 16, fontWeight: "600",
    paddingVertical: 4, borderBottomWidth: 1, marginBottom: 8,
  },
  facultyPicker: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignSelf: "flex-start",
  },
  facultyPickerText: { fontSize: 12, fontWeight: "600" },
  contentInput: { fontSize: 16, lineHeight: 24, minHeight: 120 },
  charCount: { fontSize: 12, textAlign: "right", marginTop: 8 },
  pickerOverlay: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    borderTopWidth: 1, maxHeight: 400,
  },
  pickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1,
  },
  pickerTitle: { fontSize: 16, fontWeight: "600" },
  pickerItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  pickerItemText: { fontSize: 15 },
});
