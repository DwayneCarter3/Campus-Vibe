import { VerificationBadge } from "@/components/verification-badge";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface UserVerificationMarksProps {
  status: string | null | undefined;
  className?: string;
}

/** Public trust markers; personal roles and campus titles do not belong in user headers. */
export function UserVerificationMarks({ status, className }: UserVerificationMarksProps) {
  const studentVerified = status === "approved" || status === "Student_Verified" || status === "Premium_Approved";
  if (!studentVerified) return null;

  return (
    <span className={cn("inline-flex items-center gap-1.5 shrink-0", className)}>
      <span
        role="img"
        aria-label="Verified student"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-500/65 text-emerald-400"
      >
        <Check aria-hidden="true" className="h-3 w-3" strokeWidth={2.5} />
      </span>
      {status === "Student_Verified" && <VerificationBadge type="green" />}
      {status === "Premium_Approved" && <VerificationBadge type="blue" />}
    </span>
  );
}