import { VerificationBadge } from "@/components/verification-badge";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

interface UserVerificationMarksProps {
  status: string | null | undefined;
  role?: string | null;
  className?: string;
}

/** Public verification presentation follows the API-provided verification tier. */
export function UserVerificationMarks({ status, role, className }: UserVerificationMarksProps) {
  if (role === "system" && status === "Official") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full border border-violet-300/40 bg-violet-400/10 px-2 py-0.5 text-[10px] leading-none font-bold text-violet-200 whitespace-nowrap", className)}>
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Official
      </span>
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
  return <VerificationBadge type={type} className={cn("shrink-0", className)} />;
}