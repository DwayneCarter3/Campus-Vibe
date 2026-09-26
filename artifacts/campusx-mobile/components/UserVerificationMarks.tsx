import { StyleSheet, Text, View } from "react-native";
import { VerificationBadge } from "@/components/VerificationBadge";
import { useColors } from "@/hooks/useColors";

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  admin: "Admin",
  moderator: "Moderator",
  student: "Student",
};

export function UserVerificationMarks({ status, role }: { status?: string | null; role?: string | null }) {
  const colors = useColors();
  if (!["approved", "Student_Verified", "Premium_Approved"].includes(status ?? "")) return null;
  const isPremium = status === "Premium_Approved";
  const roleLabel = isPremium && role ? ROLE_LABELS[role.toLowerCase()] : undefined;

  return (
    <View style={styles.row}>
      <View style={[styles.pill, { borderColor: isPremium ? "dodgerblue" : "seagreen" }]}>
        <Text style={[styles.pillText, { color: isPremium ? "dodgerblue" : "seagreen" }]}>
          {isPremium ? "Premium Verified" : "Student Verified"}
        </Text>
      </View>
      {isPremium && <VerificationBadge type="blue" fontSize={15} glow />}
      {roleLabel ? (
        <View style={[styles.rolePill, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.roleText, { color: colors.mutedForeground }]}>{roleLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3 },
  pillText: { fontSize: 9, fontWeight: "700" },
  rolePill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  roleText: { fontSize: 9, fontWeight: "600" },
});