export const PENDING_VERIFICATION_STATUSES = [
  "pending",
  "pending_promo",
  "pending_paid",
  "Student_Pending",
  "Premium_Pending_Approval",
] as const;

export function isPrivilegedRole(role: string | null | undefined): boolean {
  return role === "ceo" || role === "admin";
}

export function isVerifiedAccount(status: string | null | undefined, role?: string | null): boolean {
  return isPrivilegedRole(role) ||
    status === "approved" ||
    status === "Student_Verified" ||
    status === "Premium_Approved";
}