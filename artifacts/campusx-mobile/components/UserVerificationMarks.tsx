import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { VerificationBadge } from "@/components/VerificationBadge";

export function UserVerificationMarks({ status }: { status?: string | null }) {
  if (status !== "approved" && status !== "Student_Verified" && status !== "Premium_Approved") {
    return null;
  }

  return (
    <View style={styles.marks}>
      <View style={styles.studentPill} accessible accessibilityRole="image" accessibilityLabel="Verified student">
        <Feather name="check" size={12} color="#4ADE80" />
      </View>
      {status === "Student_Verified" && <VerificationBadge type="green" fontSize={15} />}
      {status === "Premium_Approved" && <VerificationBadge type="blue" fontSize={15} />}
    </View>
  );
}

const styles = StyleSheet.create({
  marks: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 3 },
  studentPill: {
    borderWidth: 1,
    borderColor: "#22C55E",
    borderRadius: 20,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});