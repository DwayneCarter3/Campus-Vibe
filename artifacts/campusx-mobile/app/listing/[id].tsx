import React from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useGetService } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { UserVerificationMarks } from "@/components/UserVerificationMarks";

export default function ListingDetailsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const serviceId = Number(id);
  const { data: service, isLoading, isError } = useGetService(serviceId);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>CampusX Marketplace</Text>
      </View>
      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : isError || !service ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={36} color={colors.mutedForeground} />
          <Text style={[styles.title, { color: colors.foreground }]}>Listing unavailable</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>This listing may have been removed or is no longer available.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.category, { backgroundColor: colors.primary + "20" }]}>
            <Text style={[styles.categoryText, { color: colors.primary }]}>{service.category}</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{service.title}</Text>
          {service.price ? <Text style={[styles.price, { color: colors.accent }]}>{service.price}</Text> : null}
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{service.description}</Text>
          <View style={[styles.provider, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.providerName, { color: colors.foreground }]}>{service.providerName}</Text>
                <UserVerificationMarks status={service.providerVerificationStatus} />
              </View>
              <Text style={[styles.bodySmall, { color: colors.mutedForeground }]}>{service.providerLevel}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                const number = service.contactInfo.replace(/\D/g, "");
                const url = `https://wa.me/234${number.slice(-10)}?text=${encodeURIComponent(`Hi! I saw your "${service.title}" listing on CampusX. I'm interested!`)}`;
                void Linking.openURL(url);
              }}
              style={[styles.chatButton, { backgroundColor: "#25D366" }]}
            >
              <Feather name="message-circle" size={15} color="#fff" />
              <Text style={styles.chatText}>Chat</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 32 },
  content: { padding: 20, gap: 16 },
  category: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  categoryText: { fontSize: 12, fontWeight: "700" },
  title: { fontSize: 22, lineHeight: 29, fontWeight: "700" },
  price: { fontSize: 18, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 23 },
  bodySmall: { fontSize: 13, marginTop: 3 },
  provider: { borderTopWidth: 1, paddingTop: 16, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  providerName: { fontSize: 15, fontWeight: "600" },
  chatButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  chatText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});