import { StyleSheet, Text, View } from "react-native";
import { VerificationBadge } from "@/components/VerificationBadge";

export function UserVerificationMarks({ status }: { status?: string | null }) {
  if (status !== "approved" && status !== "Student_Verified" && status !== "Premium_Approved") {
    return null;
  }

  return (
    <View style={styles.marks}>
      <Text style={styles.studentPill}>Student Verified</Text>
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
    color: "#4ADE80",
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: "700",
  },
});