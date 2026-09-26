export const ACTIVE_ACADEMIC_YEAR_START = 2025; // 2025/26 session

export const LEVEL_CHOICES = ["100L", "200L", "300L", "400L", "500L", "Alumni/Postgrad"] as const;

/** A two-digit matric prefix belongs to the 2000s. Invalid/future entries are not guessed. */
export function decodeMatricEntryYear(matricNumber: string | null | undefined): number | null {
  const prefix = matricNumber?.trim().match(/^(\d{2})/);
  if (!prefix) return null;
  const year = 2000 + Number(prefix[1]);
  return year <= ACTIVE_ACADEMIC_YEAR_START ? year : null;
}

export function getEffectiveLevel(manualLevel: string | null | undefined, matricNumber: string | null | undefined): string {
  if (manualLevel?.trim()) return manualLevel.trim();
  const entryYear = decodeMatricEntryYear(matricNumber);
  if (entryYear === null) return "Unknown";
  const yearOfStudy = ACTIVE_ACADEMIC_YEAR_START - entryYear + 1;
  return yearOfStudy > 5 ? "Alumni/Postgrad" : `${yearOfStudy}00L`;
}