import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { formatDistanceToNow } from "date-fns";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

const LEVELS = ["100L", "200L", "300L", "400L", "500L"];
const FACULTIES = [
  "Arts", "Science", "Law", "Social Sciences", "Education",
  "Engineering", "Management Sciences", "Communication & Media Studies",
];

function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const { user, updateUser } = useApp();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(user.name);
  const [faculty, setFaculty] = useState(user.faculty);
  const [level, setLevel] = useState(user.level);
  const [showFaculty, setShowFaculty] = useState(false);
  const [showLevel, setShowLevel] = useState(false);

  const handleSave = () => {
    updateUser({ name: name.trim(), faculty, level });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Profile</Text>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.avatarLarge, { backgroundColor: colors.surface }]}>
              <Text style={[styles.avatarLargeText, { color: colors.primary }]}>{name.charAt(0)}</Text>
            </View>

            <View style={[styles.field, { borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>FULL NAME</Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.foreground }]}
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            <View style={[styles.field, { borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>FACULTY</Text>
              <TouchableOpacity onPress={() => { setShowFaculty(!showFaculty); setShowLevel(false); }} style={styles.fieldBtn}>
                <Text style={[styles.fieldBtnText, { color: colors.foreground }]}>{faculty}</Text>
                <Feather name={showFaculty ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {showFaculty && (
                <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {FACULTIES.map((f) => (
                    <TouchableOpacity
                      key={f}
                      style={[styles.dropdownItem, { borderBottomColor: colors.border }, faculty === f && { backgroundColor: colors.primary + "15" }]}
                      onPress={() => { setFaculty(f); setShowFaculty(false); }}
                    >
                      <Text style={[styles.dropdownText, { color: faculty === f ? colors.primary : colors.foreground }]}>{f}</Text>
                      {faculty === f && <Feather name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.field, { borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>LEVEL</Text>
              <TouchableOpacity onPress={() => { setShowLevel(!showLevel); setShowFaculty(false); }} style={styles.fieldBtn}>
                <Text style={[styles.fieldBtnText, { color: colors.foreground }]}>{level}</Text>
                <Feather name={showLevel ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {showLevel && (
                <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {LEVELS.map((l) => (
                    <TouchableOpacity
                      key={l}
                      style={[styles.dropdownItem, { borderBottomColor: colors.border }, level === l && { backgroundColor: colors.primary + "15" }]}
                      onPress={() => { setLevel(l); setShowLevel(false); }}
                    >
                      <Text style={[styles.dropdownText, { color: level === l ? colors.primary : colors.foreground }]}>{l}</Text>
                      {level === l && <Feather name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.field, { borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>CAMPUS</Text>
              <Text style={[styles.fieldStatic, { color: colors.foreground }]}>LASU Ojo</Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const { user, posts, services } = useApp();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"gist" | "hustles">("gist");
  const [editOpen, setEditOpen] = useState(false);

  const myPosts = posts.filter((p) => p.authorName === user.name);
  const myServices = services.filter((s) => s.authorName === user.name);

  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Profile</Text>
        <TouchableOpacity onPress={() => { setEditOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
          <Feather name="edit-2" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 + bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.bigAvatar, { backgroundColor: colors.primary + "25", borderColor: colors.primary + "40" }]}>
            <Text style={[styles.bigAvatarText, { color: colors.primary }]}>{user.name.charAt(0)}</Text>
          </View>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{user.name}</Text>
          <View style={styles.profileBadges}>
            <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>{user.faculty}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.accent + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>{user.level}</Text>
            </View>
          </View>
          <View style={[styles.campusRow, { backgroundColor: colors.surface }]}>
            <Feather name="map-pin" size={12} color={colors.mutedForeground} />
            <Text style={[styles.campusText, { color: colors.mutedForeground }]}>{user.campus}</Text>
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
              <Text style={[styles.statNum, { color: colors.foreground }]}>
                {myPosts.reduce((s, p) => s + p.fireCount, 0)}
              </Text>
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

        {/* Tab content */}
        <View style={styles.tabContent}>
          {activeTab === "gist" ? (
            myPosts.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="radio" size={36} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No gist yet</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  Go to the Amebo tab and drop your first gist!
                </Text>
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
                      <Text style={[styles.miniReactionText, { color: colors.mutedForeground }]}>🔥 {post.fireCount}</Text>
                      <Text style={[styles.miniReactionText, { color: colors.mutedForeground }]}>🧢 {post.noCapCount}</Text>
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
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  Go to the Hustle tab to list your first service!
                </Text>
              </View>
            ) : (
              myServices.map((service) => (
                <View key={service.id} style={[styles.miniCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.miniCardHeader}>
                    <View style={[styles.miniCategoryBadge, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={[styles.miniCategoryText, { color: colors.primary }]}>{service.category}</Text>
                    </View>
                    <Text style={[styles.miniPrice, { color: colors.accent }]}>{service.price}</Text>
                  </View>
                  <Text style={[styles.miniTitle, { color: colors.foreground }]}>{service.title}</Text>
                  <Text style={[styles.miniContent, { color: colors.mutedForeground }]} numberOfLines={2}>{service.description}</Text>
                </View>
              ))
            )
          )}
        </View>
      </ScrollView>

      <EditProfileModal visible={editOpen} onClose={() => setEditOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  profileCard: { margin: 16, borderRadius: 20, borderWidth: 1, padding: 20, alignItems: "center" },
  bigAvatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, marginBottom: 12,
  },
  bigAvatarText: { fontSize: 36, fontWeight: "700" },
  profileName: { fontSize: 20, fontWeight: "700", marginBottom: 10 },
  profileBadges: { flexDirection: "row", gap: 8, marginBottom: 10 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  campusRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
  },
  campusText: { fontSize: 12 },
  statsRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-around", width: "100%",
    marginTop: 16, paddingTop: 16, borderTopWidth: 1,
  },
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
  miniContent: { fontSize: 14, lineHeight: 20 },
  miniMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  miniMetaText: { fontSize: 12 },
  miniReactions: { flexDirection: "row", gap: 10 },
  miniReactionText: { fontSize: 12 },
  emptyState: { alignItems: "center", paddingTop: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  cancelText: { fontSize: 15 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  modalBody: { flex: 1, padding: 20 },
  avatarLarge: {
    width: 70, height: 70, borderRadius: 35,
    alignItems: "center", justifyContent: "center",
    alignSelf: "center", marginBottom: 24,
  },
  avatarLargeText: { fontSize: 30, fontWeight: "700" },
  field: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
  fieldInput: { fontSize: 16 },
  fieldBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldBtnText: { fontSize: 16 },
  fieldStatic: { fontSize: 16 },
  dropdown: { borderRadius: 10, borderWidth: 1, marginTop: 8, overflow: "hidden" },
  dropdownItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  dropdownText: { fontSize: 15 },
});
