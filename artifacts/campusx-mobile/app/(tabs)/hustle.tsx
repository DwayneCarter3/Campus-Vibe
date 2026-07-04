import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp, Service } from "@/context/AppContext";

const CATEGORIES = ["All", "Clothing", "Electronics", "Books", "Hostels/Accommodation", "Food & Pastries", "Services", "Others"];

const CATEGORY_ICONS: Record<string, string> = {
  All: "grid",
  Clothing: "scissors",
  Electronics: "smartphone",
  Books: "book-open",
  "Hostels/Accommodation": "home",
  "Food & Pastries": "coffee",
  Services: "briefcase",
  Others: "package",
};

function ServiceCard({ service, onDelete, isOwner }: { service: Service; onDelete: (id: string) => void; isOwner: boolean }) {
  const colors = useColors();

  const handleWhatsApp = () => {
    const number = service.whatsappNumber.replace(/\D/g, "");
    const url = `https://wa.me/234${number.slice(-10)}?text=${encodeURIComponent(`Hi! I saw your "${service.title}" listing on CampusX. I'm interested!`)}`;
    Linking.openURL(url).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleRow}>
          <View style={[styles.categoryBadge, { backgroundColor: colors.primary + "20" }]}>
            <Feather name={CATEGORY_ICONS[service.category] as any || "package"} size={11} color={colors.primary} />
            <Text style={[styles.categoryText, { color: colors.primary }]}>{service.category}</Text>
          </View>
          {isOwner && (
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDelete(service.id); }}>
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.serviceTitle, { color: colors.foreground }]}>{service.title}</Text>
        <Text style={[styles.serviceDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{service.description}</Text>
      </View>

      <View style={[styles.cardBottom, { borderTopColor: colors.border }]}>
        <View style={styles.authorRow}>
          <View style={[styles.avatarSm, { backgroundColor: colors.surface }]}>
            <Text style={[styles.avatarSmText, { color: colors.primary }]}>{service.authorName.charAt(0)}</Text>
          </View>
          <View>
            <Text style={[styles.authorName, { color: colors.foreground }]}>{service.authorName}</Text>
            <Text style={[styles.priceText, { color: colors.accent }]}>{service.price}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleWhatsApp}
          style={[styles.whatsappBtn, { backgroundColor: "#25D366" }]}
          activeOpacity={0.8}
        >
          <Feather name="message-circle" size={14} color="#fff" />
          <Text style={styles.whatsappText}>Chat</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AddServiceModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const { addService, user } = useApp();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Services");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [imageNote] = useState("📸 Image upload coming soon");

  const isValid = title.trim() && description.trim() && price.trim() && whatsapp.trim();

  const handleSubmit = () => {
    if (!isValid) return;
    addService({ title: title.trim(), description: description.trim(), price: price.trim(), category: selectedCategory, whatsappNumber: whatsapp.trim() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTitle(""); setDescription(""); setPrice(""); setWhatsapp("");
    setSelectedCategory("Services");
    onClose();
  };

  const serviceCategories = CATEGORIES.filter((c) => c !== "All");

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.modalHeaderBtn}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>List Your Hustle 💼</Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!isValid}
              style={[styles.submitBtn, { backgroundColor: isValid ? colors.primary : colors.muted }]}
            >
              <Text style={[styles.submitBtnText, { color: isValid ? "#fff" : colors.mutedForeground }]}>List It</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Image placeholder */}
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="image" size={28} color={colors.mutedForeground} />
              <Text style={[styles.imagePlaceholderText, { color: colors.mutedForeground }]}>{imageNote}</Text>
            </View>

            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>ITEM TITLE *</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Mathematics Tutoring, Ankara Dress..."
                placeholderTextColor={colors.mutedForeground}
                maxLength={80}
              />
            </View>

            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION *</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: colors.foreground }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe what you're offering, any conditions, availability..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={300}
              />
              <Text style={[styles.charHint, { color: colors.mutedForeground }]}>{description.length}/300</Text>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroupHalf, { borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>PRICE *</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="e.g. ₦2,000 or ₦500/hr"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={30}
                />
              </View>
              <View style={[styles.formGroupHalf, { borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>WHATSAPP NO. *</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={whatsapp}
                  onChangeText={setWhatsapp}
                  placeholder="080XXXXXXXX"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  maxLength={14}
                />
              </View>
            </View>

            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY *</Text>
              <TouchableOpacity
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
                style={[styles.categorySelector, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Feather name={CATEGORY_ICONS[selectedCategory] as any || "package"} size={16} color={colors.primary} />
                <Text style={[styles.categorySelectorText, { color: colors.foreground }]}>{selectedCategory}</Text>
                <Feather name={showCategoryPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {showCategoryPicker && (
                <View style={[styles.categoryDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {serviceCategories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryOption,
                        { borderBottomColor: colors.border },
                        selectedCategory === cat && { backgroundColor: colors.primary + "15" },
                      ]}
                      onPress={() => { setSelectedCategory(cat); setShowCategoryPicker(false); }}
                    >
                      <Feather name={CATEGORY_ICONS[cat] as any || "package"} size={14} color={selectedCategory === cat ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.categoryOptionText, { color: selectedCategory === cat ? colors.primary : colors.foreground }]}>{cat}</Text>
                      {selectedCategory === cat && <Feather name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={[styles.listingByRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="user" size={14} color={colors.mutedForeground} />
              <Text style={[styles.listingByText, { color: colors.mutedForeground }]}>
                Listing as <Text style={{ color: colors.foreground, fontWeight: "600" }}>{user.name}</Text>
              </Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function HustleMarketplace() {
  const colors = useColors();
  const { services, deleteService, user } = useApp();
  const insets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState("All");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = activeCategory === "All" ? services : services.filter((s) => s.category === activeCategory);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Hustle</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>LASU student marketplace 🛒</Text>
        </View>
        <TouchableOpacity
          onPress={() => { setAddOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>List</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.categoriesWrapper, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setActiveCategory(cat)}
              style={[
                styles.categoryChip,
                { borderColor: activeCategory === cat ? colors.primary : colors.border },
                activeCategory === cat && { backgroundColor: colors.primary + "18" },
              ]}
            >
              <Feather
                name={CATEGORY_ICONS[cat] as any || "package"}
                size={13}
                color={activeCategory === cat ? colors.primary : colors.mutedForeground}
              />
              <Text style={[styles.chipText, { color: activeCategory === cat ? colors.primary : colors.mutedForeground }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ServiceCard service={item} onDelete={deleteService} isOwner={item.authorName === user.name} />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 + bottomPad }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!filtered.length}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="shopping-bag" size={40} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeCategory === "All" ? "No listings yet" : `No ${activeCategory} listings`}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Be the first to list your hustle in this category!
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: 88 + bottomPad }]}
        onPress={() => { setAddOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <AddServiceModal visible={addOpen} onClose={() => setAddOpen(false)} />
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
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  categoriesWrapper: { borderBottomWidth: 1 },
  categories: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  categoryChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "600" },
  listContent: { padding: 16, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardTop: { padding: 16 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  categoryBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  categoryText: { fontSize: 11, fontWeight: "600" },
  serviceTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  serviceDesc: { fontSize: 13, lineHeight: 19 },
  cardBottom: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 16,
    paddingVertical: 12, borderTopWidth: 1,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarSm: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  avatarSmText: { fontSize: 14, fontWeight: "700" },
  authorName: { fontSize: 13, fontWeight: "600" },
  priceText: { fontSize: 15, fontWeight: "700" },
  whatsappBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  whatsappText: { color: "#fff", fontSize: 13, fontWeight: "700" },
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
  cancelText: { fontSize: 15 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  submitBtnText: { fontSize: 15, fontWeight: "700" },
  modalBody: { flex: 1, padding: 16 },
  imagePlaceholder: {
    height: 120, borderRadius: 14, borderWidth: 1, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20,
  },
  imagePlaceholderText: { fontSize: 13 },
  formGroup: { marginBottom: 16, borderWidth: 1, borderRadius: 12, padding: 14 },
  formRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  formGroupHalf: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 14 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6 },
  input: { fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  charHint: { fontSize: 11, textAlign: "right", marginTop: 4 },
  categorySelector: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  categorySelectorText: { flex: 1, fontSize: 15 },
  categoryDropdown: {
    borderRadius: 10, borderWidth: 1, marginTop: 6, overflow: "hidden",
  },
  categoryOption: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  categoryOptionText: { flex: 1, fontSize: 14 },
  listingByRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 20,
  },
  listingByText: { fontSize: 13 },
});
