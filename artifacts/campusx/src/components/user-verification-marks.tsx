import { VerificationBadge } from "@/components/verification-badge";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

interface UserVerificationMarksProps {
  status: string | null | undefined;
  role?: string | null;
  className?: string;
}

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  admin: "Admin",
  moderator: "Moderator",
  student: "Student",
};

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
  if (!["approved", "Student_Verified", "Premium_Approved"].includes(status ?? "")) return null;
  const isPremium = status === "Premium_Approved";
  const roleLabel = isPremium && role ? ROLE_LABELS[role.toLowerCase()] : undefined;
  const label = isPremium ? "Premium Verified" : "Student Verified";
  return (
    <span className={cn("inline-flex items-center gap-1.5 shrink-0", className)}>
      <span className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap",
        isPremium
          ? "border-sky-400/45 bg-sky-400/10 text-sky-300"
          : "border-emerald-400/45 bg-emerald-400/10 text-emerald-300",
      )}>
        {label}
      </span>
      {isPremium && <VerificationBadge type="blue" className="drop-shadow-[0_0_5px_rgba(56,189,248,0.8)]" />}
      {roleLabel && (
        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground whitespace-nowrap">
          {roleLabel}
        </span>
      )}
    </span>
  );
}