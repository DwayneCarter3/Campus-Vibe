import { VerificationBadge } from "@/components/VerificationBadge";

export function UserVerificationMarks({ status }: { status?: string | null }) {
  if (status === "Student_Verified") return <VerificationBadge type="green" fontSize={15} />;
  if (status === "Premium_Approved") return <VerificationBadge type="blue" fontSize={15} />;
  return null;
}