import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { VerificationBadge } from "@/components/VerificationBadge";

export function UserVerificationMarks({ status, role }: { status?: string | null; role?: string | null }) {
  if (role === "system" && status === "Official") {
    return (
      <View style={[styles.officialPill, { borderColor: "#A78BFA80", backgroundColor: "#8B5CF620" }]}>
        <Feather name="shield" size={11} color="#C4B5FD" />
        <Text style={styles.officialText}>Official</Text>
      </View>
    );
  }
  const type = status === "Student_Verified"
    ? "green"
    : status === "Gold_Approved"
      ? "gold"
      : status === "Premium_Approved"
        ? "blue"
        : null;
  if (!type) return null;
  return <VerificationBadge type={type} fontSize={15} />;
}

const styles = StyleSheet.create({
  officialPill: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3 },
  officialText: { color: "#C4B5FD", fontSize: 9, fontWeight: "700" },
});