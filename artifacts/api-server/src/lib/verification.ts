export const PENDING_VERIFICATION_STATUSES = [
  "pending",
  "pending_promo",
  "pending_paid",
  "Student_Pending",
  "Premium_Pending_Approval",
  "Gold_Pending_Approval",
] as const;

export function isPrivilegedRole(role: string | null | undefined): boolean {
  return role === "ceo" || role === "admin";
}

export function publicDisplayRole(role: string | null | undefined): string {
  return role === "system" ? "system" : "student";
}

export function publicVerificationStatus(
  status: string | null | undefined,
  role?: string | null,
  publicBadgeTier?: string | null,
  publicBadgeExpiresAt?: Date | string | null,
  now: Date = new Date(),
): string {
  // Dispatch's official marker is an independent system identity, not a user
  // role grant or timed verification badge.
  if (status === "Official") return "Official";
  if (publicBadgeExpiresAt) {
    const expiresAt = new Date(publicBadgeExpiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return "none";
  }
  // Internal CEO/admin grants are never evidence of a public badge. Only an
  // explicitly approved, unexpired public badge entitlement can override them.
  if (publicBadgeTier) {
    const expiresAt = publicBadgeExpiresAt
      ? new Date(publicBadgeExpiresAt)
      : null;
    if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return "none";
    const tierStatus: Record<string, string> = {
      student: "Student_Verified",
      gold: "Gold_Approved",
      premium: "Premium_Approved",
    };
    return tierStatus[publicBadgeTier] ?? "none";
  }
  if (isPrivilegedRole(role)) return "none";
  // Status alone is insufficient provenance: legacy privileged accounts can
  // retain a forced Premium_Approved value, and approved paid ticks can expire.
  // Legacy paid/early-bird entitlements are materialized by the lazy entitlement
  // refresh before profile responses; all other reads fail closed without it.
  return "none";
}

export function isVerifiedAccount(
  status: string | null | undefined,
  role?: string | null,
  publicBadgeTier?: string | null,
  publicBadgeExpiresAt?: Date | string | null,
): boolean {
  const publicStatus = publicVerificationStatus(status, role, publicBadgeTier, publicBadgeExpiresAt);
  return publicStatus === "Official" ||
    publicStatus === "Student_Verified" ||
    publicStatus === "Gold_Approved" ||
    publicStatus === "Premium_Approved";
}