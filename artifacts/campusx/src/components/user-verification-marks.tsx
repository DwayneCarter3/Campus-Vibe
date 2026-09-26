import { VerificationBadge } from "@/components/verification-badge";
import { cn } from "@/lib/utils";

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
      <span className="inline-flex items-center rounded-full border border-emerald-500/65 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-400">
        Student Verified
      </span>
      {status === "Student_Verified" && <VerificationBadge type="green" />}
      {status === "Premium_Approved" && <VerificationBadge type="blue" />}
    </span>
  );
}