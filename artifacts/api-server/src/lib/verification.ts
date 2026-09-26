export function isVerifiedAccount(status: string | null | undefined, role?: string | null): boolean {
  return role === "ceo" ||
    role === "admin" ||
    status === "approved" ||
    status === "Student_Verified" ||
    status === "Premium_Approved";
}