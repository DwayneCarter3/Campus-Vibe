import { VerificationBadge } from "@/components/verification-badge";
import { cn } from "@/lib/utils";

interface UserVerificationMarksProps {
  status: string | null | undefined;
  className?: string;
}

/** Only paid verification marks appear beside names; basic approval has no public icon. */
export function UserVerificationMarks({ status, className }: UserVerificationMarksProps) {
  if (status !== "Student_Verified" && status !== "Premium_Approved") return null;

  return (
    <span className={cn("inline-flex items-center shrink-0", className)}>
      <VerificationBadge type={status === "Student_Verified" ? "green" : "blue"} />
    </span>
  );
}