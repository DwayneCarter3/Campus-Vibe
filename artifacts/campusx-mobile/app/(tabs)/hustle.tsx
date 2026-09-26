import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
  Clipboard,
  ScrollView,
  KeyboardAvoidingView,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ExpoLinking from "expo-linking";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import {
  listServices,
  getListServicesQueryKey,
  useStartConversation,
  useCreateService,
  useTrackWhatsappClick,
  useUpdateService,
  useDeleteService,
  useToggleSaveService,
  useReportService,
  useToggleFeatureService,
  usePinServiceToProfile,
  useGetMyProfile,
  useRequestUploadUrl,
  Service,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { UserVerificationMarks } from "@/components/UserVerificationMarks";
import { uploadCampusImage } from "@/lib/mediaUpload";

const CATEGORIES = ["All", "Clothing", "Electronics", "Books", "Hostels/Accommodation", "Food & Pastries", "Services", "Others"];

function mediaUri(path: string): string {
  if (!path.startsWith("/") || Platform.OS === "web") return path;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}${path}` : path;
}

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

function numericPrice(value: string): number | null {
  const normalized = value.trim().replace(/[₦,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function FlashSaleCountdown({ expiresAt, color }: { expiresAt: string; color: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalMinutes = Math.floor(remaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
      <Feather name="clock" size={11} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>
        {remaining > 0 ? `Expires in ${hours}h ${minutes}m` : "Sale ended"}
      </Text>
    </View>
  );
}

function ServiceCard({
  service,
  isAdmin,
  onHide,
}: {
  service: Service;
  isAdmin: boolean;
  onHide: (serviceId: number) => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { userId: myClerkId } = useAuth();
  const queryClient = useQueryClient();
  const trackClick = useTrackWhatsappClick();
  const startConv = useStartConversation();
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);

  const invalidateServices = () => {
    void queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
  };
  const updateService = useUpdateService({
    mutation: {
      onSuccess: () => {
        invalidateServices();
        setEditVisible(false);
        Alert.alert("Listing updated", "Your listing has been updated.");
      },
      onError: () => Alert.alert("Error", "Could not update this listing. Try again."),
    },
  });
  const deleteService = useDeleteService({
    mutation: {
      onSuccess: () => {
        invalidateServices();
        Alert.alert("Listing deleted", "The listing has been removed.");
      },
      onError: () => Alert.alert("Error", "Could not delete this listing. Try again."),
    },
  });
  const toggleSave = useToggleSaveService({
    mutation: {
      onSuccess: () => {
        invalidateServices();
        void queryClient.invalidateQueries({ queryKey: getListServicesQueryKey({ savedOnly: true }) });
      },
      onError: () => Alert.alert("Error", "Could not update your saved listings."),
    },
  });
  const reportService = useReportService({
    mutation: {
      onSuccess: () => {
        setReportVisible(false);
        Alert.alert("Report sent", "Thank you. Our team will review this listing.");
      },
      onError: () => Alert.alert("Error", "Could not submit your report. Try again."),
    },
  });
  const toggleFeature = useToggleFeatureService({
    mutation: {
      onSuccess: invalidateServices,
      onError: () => Alert.alert("Error", "Could not update featured status."),
    },
  });
  const pinToProfile = usePinServiceToProfile({
    mutation: {
      onSuccess: invalidateServices,
      onError: () => Alert.alert("Error", "Could not update your pinned listing."),
    },
  });

  const handleWhatsApp = () => {
    const number = service.contactInfo.replace(/\D/g, "");
    const url = `https://wa.me/234${number.slice(-10)}?text=${encodeURIComponent(`Hi! I saw your "${service.title}" listing on CampusX. I'm interested!`)}`;
    Linking.openURL(url).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackClick.mutate({ serviceId: service.id });
  };

  const handleMessage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/messages?with=${service.providerId}`);
  };

  const isOwnListing = myClerkId === service.providerId;
  const copyLink = async () => {
    const url = ExpoLinking.createURL(`/listing/${service.id}`);
    try {
      Clipboard.setString(url);
      setMenuVisible(false);
      Alert.alert("Link copied", "Listing link copied to clipboard.");
    } catch {
      Alert.alert("Copy failed", "Could not copy the listing link.");
    }
  };
  const confirmDelete = (adminDelete = false) => {
    setMenuVisible(false);
    Alert.alert(
      adminDelete ? "Delete Listing (Admin)" : "Delete Listing",
      `Delete "${service.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteService.mutate({ serviceId: service.id }),
        },
      ],
    );
  };
  const menuAction = (action: string) => {
    switch (action) {
      case "edit":
        setMenuVisible(false);
        setEditVisible(true);
        break;
      case "delete":
        confirmDelete();
        break;
      case "pin":
        setMenuVisible(false);
        pinToProfile.mutate({ serviceId: service.id });
        break;
      case "save":
        setMenuVisible(false);
        toggleSave.mutate({ serviceId: service.id });
        break;
      case "copy":
        void copyLink();
        break;
      case "hide":
        setMenuVisible(false);
        onHide(service.id);
        break;
      case "report":
        setMenuVisible(false);
        setReportVisible(true);
        break;
      case "feature":
        setMenuVisible(false);
        toggleFeature.mutate({ serviceId: service.id });
        break;
      case "admin-delete":
        confirmDelete(true);
        break;
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.cardTitleRow, { justifyContent: "space-between" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <View style={[styles.categoryBadge, { backgroundColor: colors.primary + "20" }]}>
              <Feather name={CATEGORY_ICONS[service.category] as any || "package"} size={11} color={colors.primary} />
              <Text style={[styles.categoryText, { color: colors.primary }]}>{service.category}</Text>
            </View>
            {service.isFlashSale && (
              <View style={[styles.categoryBadge, { backgroundColor: colors.accent + "20" }]}>
                <Feather name="zap" size={11} color={colors.accent} />
                <Text style={[styles.categoryText, { color: colors.accent }]}>Flash Sale</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            accessibilityLabel="Listing options"
            style={styles.menuButton}
          >
            <Feather name="more-horizontal" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.serviceTitle, { color: colors.foreground }]}>{service.title}</Text>
        {service.imageUrl ? (
          <ExpoImage
            source={{ uri: mediaUri(service.imageUrl) }}
            placeholder={service.blurDataUrl ? { uri: service.blurDataUrl } : undefined}
            transition={180}
            contentFit="cover"
            style={[styles.serviceImage, { backgroundColor: colors.surface }]}
          />
        ) : null}
        <Text style={[styles.serviceDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{service.description}</Text>
      </View>

      <View style={[styles.cardBottom, { borderTopColor: colors.border }]}>
        <View style={styles.authorRow}>
          <View style={[styles.avatarSm, { backgroundColor: colors.surface }]}>
            <Text style={[styles.avatarSmText, { color: colors.primary }]}>{service.providerName.charAt(0)}</Text>
          </View>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>{service.providerName}</Text>
              <UserVerificationMarks status={service.providerVerificationStatus} role={service.providerRole} />
            </View>
            <Text style={[styles.priceText, { color: colors.mutedForeground }]}>{service.providerLevel}</Text>
            {service.isFlashSale && service.price && service.originalPrice && service.flashExpiresAt ? (
              <View style={{ marginTop: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Text style={[styles.priceText, { color: colors.accent }]}>{service.price}</Text>
                  <Text style={[styles.oldPriceText, { color: colors.mutedForeground }]}>{service.originalPrice}</Text>
                </View>
                <FlashSaleCountdown expiresAt={service.flashExpiresAt} color={colors.accent} />
              </View>
            ) : service.price ? (
              <Text style={[styles.priceText, { color: colors.accent }]}>{service.price}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.actionBtns}>
          {!isOwnListing && (
            <TouchableOpacity
              onPress={handleMessage}
              style={[styles.dmBtn, { backgroundColor: colors.primary + "20", borderColor: colors.primary + "40" }]}
              activeOpacity={0.8}
              disabled={startConv.isPending}
            >
              <Feather name="message-square" size={14} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleWhatsApp} style={[styles.whatsappBtn, { backgroundColor: "#25D366" }]} activeOpacity={0.8}>
            <Feather name="message-circle" size={14} color="#fff" />
            <Text style={styles.whatsappText}>Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ListingOptionsModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onAction={menuAction}
        isOwner={isOwnListing}
        isAdmin={isAdmin}
        saved={service.isSavedByMe}
        pinned={service.isPinnedToProfile}
        featured={service.isFeatured}
        colors={colors}
      />
      {editVisible && (
        <EditServiceModal
          key={service.id}
          service={service}
          pending={updateService.isPending}
          onClose={() => setEditVisible(false)}
          onSave={(data) => updateService.mutate({ serviceId: service.id, data })}
        />
      )}
      <ReportReasonModal
        visible={reportVisible}
        pending={reportService.isPending}
        onClose={() => setReportVisible(false)}
        onSelect={(reason) => reportService.mutate({ serviceId: service.id, data: { reason } })}
        colors={colors}
      />
    </View>
  );
}

function ListingOptionsModal({
  visible,
  onClose,
  onAction,
  isOwner,
  isAdmin,
  saved,
  pinned,
  featured,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
  isOwner: boolean;
  isAdmin: boolean;
  saved: boolean;
  pinned: boolean;
  featured: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const options = isOwner
    ? [
        { label: "Edit Listing", icon: "edit", action: "edit" },
        { label: "Delete Listing", icon: "trash-2", action: "delete", danger: true },
        { label: pinned ? "Unpin from Profile" : "Pin Listing to Profile", icon: "bookmark", action: "pin" },
      ]
    : [
        { label: saved ? "Unsave Listing" : "Save Listing", icon: saved ? "bookmark" : "bookmark-plus", action: "save" },
        { label: "Copy Link", icon: "link", action: "copy" },
        { label: "Hide for session", icon: "eye-off", action: "hide" },
        { label: "Report Listing", icon: "flag", action: "report", danger: true },
      ];
  if (isAdmin) {
    options.push(
      { label: featured ? "Unfeature Listing" : "Feature Listing", icon: "star", action: "feature" },
      { label: "Delete Listing (Admin)", icon: "trash-2", action: "admin-delete", danger: true },
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={[styles.optionsSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.action}
              style={[styles.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => onAction(option.action)}
            >
              <Feather name={option.icon as any} size={17} color={option.danger ? "#EF4444" : colors.foreground} />
              <Text style={[styles.optionText, { color: option.danger ? "#EF4444" : colors.foreground }]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.optionCancel} onPress={onClose}>
            <Text style={[styles.optionText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function ReportReasonModal({
  visible,
  pending,
  onClose,
  onSelect,
  colors,
}: {
  visible: boolean;
  pending: boolean;
  onClose: () => void;
  onSelect: (reason: "Spam" | "Harassment" | "Fake Listing" | "Inappropriate Content") => void;
  colors: ReturnType<typeof useColors>;
}) {
  const reasons = ["Spam", "Harassment", "Fake Listing", "Inappropriate Content"] as const;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={[styles.optionsSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.reasonTitle, { color: colors.foreground }]}>Report Listing</Text>
          {reasons.map((reason) => (
            <TouchableOpacity
              key={reason}
              disabled={pending}
              style={[styles.optionRow, { borderBottomColor: colors.border }]}
              onPress={() => onSelect(reason)}
            >
              <Text style={[styles.optionText, { color: colors.foreground }]}>{reason}</Text>
              {pending && <ActivityIndicator color={colors.primary} size="small" />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.optionCancel} onPress={onClose}>
            <Text style={[styles.optionText, { color: colors.mutedForeground }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function EditServiceModal({
  service,
  pending,
  onClose,
  onSave,
}: {
  service: Service;
  pending: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    category: string;
    price: string | null;
    contactInfo: string;
    isFlashSale: boolean;
    originalPrice: string | null;
    imageUrl?: string | null;
    blurDataUrl?: string | null;
  }) => void;
}) {
  const colors = useColors();
  const [title, setTitle] = useState(service.title);
  const [description, setDescription] = useState(service.description);
  const [category, setCategory] = useState(service.category);
  const [price, setPrice] = useState(service.price ?? "");
  const [isFlashSale, setIsFlashSale] = useState(service.isFlashSale ?? false);
  const [originalPrice, setOriginalPrice] = useState(service.originalPrice ?? "");
  const [contactInfo, setContactInfo] = useState(service.contactInfo);
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const requestUploadUrl = useRequestUploadUrl();
  const priceAmount = numericPrice(price);
  const originalAmount = numericPrice(originalPrice);
  const flashSaleError = isFlashSale && (!priceAmount || !originalAmount || originalAmount <= (priceAmount ?? 0))
    ? "Enter numeric prices and make the original price higher than the sale price."
    : "";
  const isValid = !!title.trim() && !!description.trim() && !!contactInfo.trim() && !flashSaleError;
  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to attach a listing image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 1 });
    if (!result.canceled && result.assets[0]) {
      setImageAsset(result.assets[0]);
      setRemoveImage(false);
    }
  };
  const saveListing = async () => {
    let imageFields: { imageUrl?: string | null; blurDataUrl?: string | null } = {};
    setIsUploadingImage(true);
    try {
      if (imageAsset) {
        imageFields = await uploadCampusImage(imageAsset, "service-image", (request) =>
          requestUploadUrl.mutateAsync({ data: request }),
        );
      } else if (removeImage) {
        imageFields = { imageUrl: null, blurDataUrl: null };
      }
      onSave({
        title: title.trim(),
        description: description.trim(),
        category,
        price: price.trim() || null,
        contactInfo: contactInfo.trim(),
        isFlashSale,
        originalPrice: isFlashSale ? originalPrice.trim() : null,
        ...imageFields,
      });
    } catch (error) {
      Alert.alert("Image upload failed", error instanceof Error ? error.message : "Could not upload the image.");
    } finally {
      setIsUploadingImage(false);
    }
  };
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose}><Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Listing</Text>
            <TouchableOpacity
              onPress={() => void saveListing()}
              disabled={!isValid || pending || isUploadingImage}
              style={[styles.submitBtn, { backgroundColor: isValid && !pending && !isUploadingImage ? colors.primary : colors.muted }]}
            >
              {pending || isUploadingImage ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.submitBtnText, { color: isValid ? "#fff" : colors.mutedForeground }]}>Save</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>TITLE</Text>
              <TextInput style={[styles.input, { color: colors.foreground }]} value={title} onChangeText={setTitle} maxLength={80} />
            </View>
            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION</Text>
              <TextInput style={[styles.input, styles.textArea, { color: colors.foreground }]} value={description} onChangeText={setDescription} multiline maxLength={300} />
            </View>
            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>LISTING IMAGE</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {(imageAsset?.uri || (service.imageUrl && !removeImage)) ? (
                  <ExpoImage
                    source={{ uri: imageAsset?.uri ?? mediaUri(service.imageUrl!) }}
                    placeholder={service.blurDataUrl ? { uri: service.blurDataUrl } : undefined}
                    style={{ width: 56, height: 56, borderRadius: 9 }}
                    contentFit="cover"
                  />
                ) : null}
                <TouchableOpacity onPress={() => void pickImage()} style={[styles.categoryChip, { borderColor: colors.border }]}>
                  <Feather name="image" size={14} color={colors.primary} />
                  <Text style={[styles.chipText, { color: colors.primary }]}>{imageAsset ? "Change image" : "Choose image"}</Text>
                </TouchableOpacity>
                {(imageAsset || service.imageUrl) && !removeImage ? (
                  <TouchableOpacity onPress={() => { setImageAsset(null); setRemoveImage(true); }} accessibilityLabel="Remove listing image">
                    <Feather name="x-circle" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CATEGORIES.filter((item) => item !== "All").map((item) => (
                  <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, { borderColor: category === item ? colors.primary : colors.border }, category === item && { backgroundColor: colors.primary + "18" }]}>
                    <Text style={[styles.chipText, { color: category === item ? colors.primary : colors.mutedForeground }]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>PRICE</Text>
              <TextInput style={[styles.input, { color: colors.foreground }]} value={price} onChangeText={setPrice} maxLength={30} />
            </View>
            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityLabel="Enable flash sale"
              accessibilityState={{ checked: isFlashSale }}
              onPress={() => setIsFlashSale((enabled: boolean) => !enabled)}
              style={[styles.flashToggle, { borderColor: isFlashSale ? colors.accent : colors.border, backgroundColor: isFlashSale ? colors.accent + "14" : colors.surface }]}
            >
              <Feather name="zap" size={16} color={isFlashSale ? colors.accent : colors.mutedForeground} />
              <Text style={[styles.flashToggleLabel, { color: isFlashSale ? colors.accent : colors.foreground }]}>Flash Sale ⚡</Text>
              <Feather name={isFlashSale ? "check-circle" : "circle"} size={17} color={isFlashSale ? colors.accent : colors.mutedForeground} />
            </TouchableOpacity>
            {isFlashSale && (
              <View style={[styles.formGroup, { borderColor: flashSaleError ? (colors.destructive ?? "#EF4444") : colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>ORIGINAL PRICE *</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={originalPrice}
                  onChangeText={setOriginalPrice}
                  placeholder="e.g. 5000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
                {flashSaleError ? <Text style={[styles.flashError, { color: colors.destructive ?? "#EF4444" }]}>{flashSaleError}</Text> : null}
              </View>
            )}
            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>WHATSAPP NUMBER</Text>
              <TextInput style={[styles.input, { color: colors.foreground }]} value={contactInfo} onChangeText={setContactInfo} keyboardType="phone-pad" maxLength={14} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddServiceModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [isFlashSale, setIsFlashSale] = useState(false);
  const [originalPrice, setOriginalPrice] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Services");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const requestUploadUrl = useRequestUploadUrl();

  const priceAmount = numericPrice(price);
  const originalAmount = numericPrice(originalPrice);
  const flashSaleError = isFlashSale && (!priceAmount || !originalAmount || originalAmount <= (priceAmount ?? 0))
    ? "Enter numeric prices and make the original price higher than the sale price."
    : "";
  const isValid = !!title.trim() && !!description.trim() && !!whatsapp.trim() && !flashSaleError;

  const createService = useCreateService({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTitle(""); setDescription(""); setPrice(""); setOriginalPrice(""); setIsFlashSale(false); setWhatsapp("");
        setSelectedCategory("Services");
        setImageAsset(null);
        onClose();
      },
      onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    },
  });

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo library access to attach a listing image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 1 });
    if (!result.canceled && result.assets[0]) setImageAsset(result.assets[0]);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsUploadingImage(true);
    try {
      const image = imageAsset
        ? await uploadCampusImage(imageAsset, "service-image", (request) =>
            requestUploadUrl.mutateAsync({ data: request }),
          )
        : null;
      createService.mutate({
        data: {
          title: title.trim(),
          description: description.trim(),
          category: selectedCategory,
          price: price.trim() || undefined,
          contactInfo: whatsapp.trim(),
          isFlashSale,
          originalPrice: isFlashSale ? originalPrice.trim() : null,
          ...(image ? { imageUrl: image.imageUrl, blurDataUrl: image.blurDataUrl } : {}),
        },
      });
    } catch (error) {
      Alert.alert("Image upload failed", error instanceof Error ? error.message : "Could not upload the image.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const serviceCategories = CATEGORIES.filter((c) => c !== "All");

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>List Your Hustle 💼</Text>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!isValid || createService.isPending || isUploadingImage}
              style={[styles.submitBtn, { backgroundColor: isValid && !createService.isPending && !isUploadingImage ? colors.primary : colors.muted }]}
            >
              {createService.isPending || isUploadingImage ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.submitBtnText, { color: isValid ? "#fff" : colors.mutedForeground }]}>List It</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>ITEM TITLE *</Text>
              <TextInput style={[styles.input, { color: colors.foreground }]} value={title} onChangeText={setTitle} placeholder="e.g. Mathematics Tutoring..." placeholderTextColor={colors.mutedForeground} maxLength={80} />
            </View>

            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIPTION *</Text>
              <TextInput style={[styles.input, styles.textArea, { color: colors.foreground }]} value={description} onChangeText={setDescription} placeholder="Describe what you're offering..." placeholderTextColor={colors.mutedForeground} multiline maxLength={300} />
              <Text style={[styles.charHint, { color: colors.mutedForeground }]}>{description.length}/300</Text>
            </View>
            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>LISTING IMAGE</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {imageAsset ? <ExpoImage source={{ uri: imageAsset.uri }} style={{ width: 56, height: 56, borderRadius: 9 }} contentFit="cover" /> : null}
                <TouchableOpacity onPress={() => void pickImage()} style={[styles.categoryChip, { borderColor: colors.border }]}>
                  <Feather name="image" size={14} color={colors.primary} />
                  <Text style={[styles.chipText, { color: colors.primary }]}>{imageAsset ? "Change image" : "Choose image"}</Text>
                </TouchableOpacity>
                {imageAsset ? (
                  <TouchableOpacity onPress={() => setImageAsset(null)} accessibilityLabel="Remove selected image">
                    <Feather name="x-circle" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroupHalf, { borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>PRICE</Text>
                <TextInput style={[styles.input, { color: colors.foreground }]} value={price} onChangeText={setPrice} placeholder="e.g. ₦2,000" placeholderTextColor={colors.mutedForeground} maxLength={30} />
              </View>
              <View style={[styles.formGroupHalf, { borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>WHATSAPP NO. *</Text>
                <TextInput style={[styles.input, { color: colors.foreground }]} value={whatsapp} onChangeText={setWhatsapp} placeholder="080XXXXXXXX" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" maxLength={14} />
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityLabel="Enable flash sale"
              accessibilityState={{ checked: isFlashSale }}
              onPress={() => setIsFlashSale((enabled: boolean) => !enabled)}
              style={[styles.flashToggle, { borderColor: isFlashSale ? colors.accent : colors.border, backgroundColor: isFlashSale ? colors.accent + "14" : colors.surface }]}
            >
              <Feather name="zap" size={16} color={isFlashSale ? colors.accent : colors.mutedForeground} />
              <Text style={[styles.flashToggleLabel, { color: isFlashSale ? colors.accent : colors.foreground }]}>Flash Sale ⚡</Text>
              <Feather name={isFlashSale ? "check-circle" : "circle"} size={17} color={isFlashSale ? colors.accent : colors.mutedForeground} />
            </TouchableOpacity>
            {isFlashSale && (
              <View style={[styles.formGroup, { borderColor: flashSaleError ? (colors.destructive ?? "#EF4444") : colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>ORIGINAL PRICE *</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={originalPrice}
                  onChangeText={setOriginalPrice}
                  placeholder="e.g. 5000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
                {flashSaleError ? <Text style={[styles.flashError, { color: colors.destructive ?? "#EF4444" }]}>{flashSaleError}</Text> : null}
              </View>
            )}

            <View style={[styles.formGroup, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORY *</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(!showCategoryPicker)} style={[styles.categorySelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name={CATEGORY_ICONS[selectedCategory] as any || "package"} size={16} color={colors.primary} />
                <Text style={[styles.categorySelectorText, { color: colors.foreground }]}>{selectedCategory}</Text>
                <Feather name={showCategoryPicker ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {showCategoryPicker && (
                <View style={[styles.categoryDropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {serviceCategories.map((cat) => (
                    <TouchableOpacity key={cat} style={[styles.categoryOption, { borderBottomColor: colors.border }, selectedCategory === cat && { backgroundColor: colors.primary + "15" }]} onPress={() => { setSelectedCategory(cat); setShowCategoryPicker(false); }}>
                      <Feather name={CATEGORY_ICONS[cat] as any || "package"} size={14} color={selectedCategory === cat ? colors.primary : colors.mutedForeground} />
                      <Text style={[styles.categoryOptionText, { color: selectedCategory === cat ? colors.primary : colors.foreground }]}>{cat}</Text>
                      {selectedCategory === cat && <Feather name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function HustleMarketplace() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user: clerkUser } = useUser();
  const [activeCategory, setActiveCategory] = useState("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [flashSaleOnly, setFlashSaleOnly] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const { data: profile } = useGetMyProfile();
  const isAdmin = profile?.role === "admin" || profile?.role === "ceo" || clerkUser?.primaryEmailAddress?.emailAddress === "dwaynecartergabriel@gmail.com";
  const serviceParams = {
    ...(savedOnly ? { savedOnly: true } : {}),
    ...(flashSaleOnly ? { flashSale: true } : {}),
    ...(activeCategory !== "All" ? { category: activeCategory } : {}),
  };
  const queryParams = Object.keys(serviceParams).length ? serviceParams : undefined;
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: [getListServicesQueryKey()[0], queryParams, clerkUser?.id, "infinite"],
    enabled: !!clerkUser?.id,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listServices({
      ...queryParams,
      limit: 10,
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
  const allServices = data?.pages.flatMap((page) => page.services) ?? [];
  const dedupedServices = Array.from(new Map(allServices.map((service) => [service.id, service])).values());
  const filtered = dedupedServices
    .filter((service) => !hiddenIds.includes(service.id))
    .filter((service) => !flashSaleOnly || (service.isFlashSale && service.flashExpiresAt && new Date(service.flashExpiresAt).getTime() > Date.now()))
    .filter((service) => activeCategory === "All" || service.category === activeCategory);

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
        <TouchableOpacity onPress={() => { setAddOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>List</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.categoriesWrapper, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: flashSaleOnly }}
            onPress={() => setFlashSaleOnly((current) => !current)}
            style={[styles.categoryChip, { borderColor: flashSaleOnly ? colors.accent : colors.border }, flashSaleOnly && { backgroundColor: colors.accent + "18" }]}
          >
            <Feather name="zap" size={13} color={flashSaleOnly ? colors.accent : colors.mutedForeground} />
            <Text style={[styles.chipText, { color: flashSaleOnly ? colors.accent : colors.mutedForeground }]}>Flash Sale ⚡</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSavedOnly((current) => !current)}
            style={[styles.categoryChip, { borderColor: savedOnly ? colors.primary : colors.border }, savedOnly && { backgroundColor: colors.primary + "18" }]}
          >
            <Feather name="bookmark" size={13} color={savedOnly ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.chipText, { color: savedOnly ? colors.primary : colors.mutedForeground }]}>Saved</Text>
          </TouchableOpacity>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity key={cat} onPress={() => setActiveCategory(cat)} style={[styles.categoryChip, { borderColor: activeCategory === cat ? colors.primary : colors.border }, activeCategory === cat && { backgroundColor: colors.primary + "18" }]}>
              <Feather name={CATEGORY_ICONS[cat] as any || "package"} size={13} color={activeCategory === cat ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.chipText, { color: activeCategory === cat ? colors.primary : colors.mutedForeground }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError && !data ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={40} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Couldn't load listings</Text>
          <TouchableOpacity onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          key={`${savedOnly}-${flashSaleOnly}-${activeCategory}`}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ServiceCard
              service={item}
              isAdmin={isAdmin}
              onHide={(serviceId) => setHiddenIds((current) => [...current, serviceId])}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + bottomPad }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => { void refetch(); }}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.45}
          ListFooterComponent={isFetchingNextPage ? (
            <View style={{ paddingVertical: 18 }}><ActivityIndicator color={colors.primary} /></View>
          ) : isFetchNextPageError ? (
            <TouchableOpacity onPress={() => void fetchNextPage()} style={{ paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: colors.destructive ?? "#EF4444", fontWeight: "600" }}>Couldn't load more. Tap to retry.</Text>
            </TouchableOpacity>
          ) : hasNextPage ? (
            <TouchableOpacity onPress={() => void fetchNextPage()} style={{ paddingVertical: 14, alignItems: "center" }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Load more listings</Text>
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="shopping-bag" size={40} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {flashSaleOnly ? "No active flash sales" : savedOnly ? "No saved listings" : activeCategory === "All" ? "No listings yet" : `No ${activeCategory} listings`}
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>{flashSaleOnly ? "Check back soon for fresh deals." : savedOnly ? "Save a listing to find it here." : "Be the first to list your hustle!"}</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary, bottom: 88 + bottomPad }]} onPress={() => { setAddOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }} activeOpacity={0.85}>
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <AddServiceModal visible={addOpen} onClose={() => setAddOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  categoriesWrapper: { borderBottomWidth: 1 },
  categories: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: "600" },
  listContent: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  cardTop: { padding: 16 },
  serviceImage: { width: "100%", height: 190, borderRadius: 11, marginBottom: 10 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  menuButton: { padding: 2 },
  categoryBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  categoryText: { fontSize: 11, fontWeight: "600" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  verifiedText: { fontSize: 11, fontWeight: "600" },
  serviceTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  serviceDesc: { fontSize: 13, lineHeight: 19 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarSm: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  avatarSmText: { fontSize: 14, fontWeight: "700" },
  authorName: { fontSize: 13, fontWeight: "600" },
  priceText: { fontSize: 15, fontWeight: "700" },
  oldPriceText: { fontSize: 12, textDecorationLine: "line-through" },
  actionBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  dmBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  whatsappBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  whatsappText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", shadowColor: "#FF3399", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center", paddingHorizontal: 40 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: "#fff", fontWeight: "700" },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  cancelText: { fontSize: 15 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  submitBtnText: { fontSize: 15, fontWeight: "700" },
  modalBody: { flex: 1, padding: 16 },
  formGroup: { marginBottom: 16, borderWidth: 1, borderRadius: 12, padding: 14 },
  formRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  formGroupHalf: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 14 },
  flashToggle: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 16 },
  flashToggleLabel: { flex: 1, fontSize: 14, fontWeight: "700" },
  flashError: { fontSize: 11, lineHeight: 16, marginTop: 7 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6 },
  input: { fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  charHint: { fontSize: 11, textAlign: "right", marginTop: 4 },
  categorySelector: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  categorySelectorText: { flex: 1, fontSize: 15 },
  categoryDropdown: { borderRadius: 10, borderWidth: 1, marginTop: 6, overflow: "hidden" },
  categoryOption: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5 },
  categoryOptionText: { flex: 1, fontSize: 14 },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)", padding: 12 },
  optionsSheet: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  optionRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  optionText: { fontSize: 15, fontWeight: "600" },
  optionCancel: { alignItems: "center", paddingVertical: 14 },
  reasonTitle: { fontSize: 17, fontWeight: "700", paddingVertical: 14 },
});
