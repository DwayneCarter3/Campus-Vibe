import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { getInstitutionId } from "@workspace/campus-institutions";

export type CampusScopeProfile = {
  institutionId: string | null;
  school: string;
  campusLocation: string;
};

export function normalizeSchoolLabel(value: string): string {
  const withoutSuffix = value.trim().replace(/\s*\([^)]*\)\s*$/u, "").trim().toLowerCase().replace(/\s+/gu, " ");
  return withoutSuffix === "lasu" ? "lagos state university" : withoutSuffix;
}

export function normalizeCampusLocation(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/gu, " ");
  if (["ojo", "ojo campus", "ojo main", "ojo main campus", "lasu ojo", "lasu ojo campus", "lasu ojo main campus"].includes(normalized)) {
    return "ojo main campus";
  }
  if (["epe", "epe campus", "lasu epe", "lasu epe campus"].includes(normalized)) {
    return "epe campus";
  }
  if (["ikeja", "ikeja campus", "lasu ikeja", "lasu ikeja campus"].includes(normalized)) {
    return "ikeja campus";
  }
  return normalized;
}

export function profilesShareSchool(left: CampusScopeProfile, right: CampusScopeProfile): boolean {
  const leftInstitutionId = left.institutionId?.trim() || null;
  const rightInstitutionId = right.institutionId?.trim() || null;
  if (leftInstitutionId && rightInstitutionId) {
    return leftInstitutionId === rightInstitutionId;
  }
  return normalizeSchoolLabel(left.school) === normalizeSchoolLabel(right.school);
}

export function profilesShareCampus(left: CampusScopeProfile, right: CampusScopeProfile): boolean {
  return normalizeCampusLocation(left.campusLocation) === normalizeCampusLocation(right.campusLocation);
}

export function canonicalInstitutionId(profile: CampusScopeProfile | null): string | null {
  const institutionId = profile?.institutionId?.trim();
  return institutionId || (profile?.school ? getInstitutionId(profile.school) ?? null : null);
}

export function postReadScopeCondition(
  targetInstitutionIdColumn: SQLWrapper,
  profile: CampusScopeProfile,
  ordinaryPostScope: SQL,
): SQL {
  const institutionId = canonicalInstitutionId(profile);
  if (!institutionId) {
    return sql`${targetInstitutionIdColumn} IS NULL AND (${ordinaryPostScope})`;
  }
  return sql`(
    ${targetInstitutionIdColumn} = ${institutionId}
    OR (${targetInstitutionIdColumn} IS NULL AND (${ordinaryPostScope}))
  )`;
}

export function schoolScopeCondition(
  institutionIdColumn: SQLWrapper,
  schoolColumn: SQLWrapper,
  profile: CampusScopeProfile,
): SQL {
  const normalizedInstitutionId = sql`NULLIF(trim(${institutionIdColumn}), '')`;
  const profileInstitutionId = profile.institutionId?.trim() || null;
  const normalizedAuthorSchool = sql`regexp_replace(
    regexp_replace(lower(trim(${schoolColumn})), ' *[(][^)]*[)] *$', '', 'g'),
    '[[:space:]]+', ' ', 'g'
  )`;
  const authorSchool = sql`CASE
    WHEN ${normalizedAuthorSchool} = 'lasu'
      THEN 'lagos state university'
    ELSE ${normalizedAuthorSchool}
  END`;
  // Build the null-ID case in TypeScript: an untyped SQL "$n IS NULL"
  // parameter cannot be resolved by PostgreSQL at execution time.
  if (!profileInstitutionId) {
    return sql`${authorSchool} = ${normalizeSchoolLabel(profile.school)}`;
  }
  return sql`(
    ${normalizedInstitutionId} = ${profileInstitutionId}
    OR (${normalizedInstitutionId} IS NULL AND ${authorSchool} = ${normalizeSchoolLabel(profile.school)})
  )`;
}

export function campusScopeCondition(campusColumn: SQLWrapper, campusLocation: string): SQL {
  const normalizedCampus = sql`regexp_replace(lower(trim(${campusColumn})), '[[:space:]]+', ' ', 'g')`;
  const authorCampus = sql`CASE
    WHEN ${normalizedCampus} IN ('ojo', 'ojo campus', 'ojo main', 'ojo main campus', 'lasu ojo', 'lasu ojo campus', 'lasu ojo main campus')
      THEN 'ojo main campus'
    WHEN ${normalizedCampus} IN ('epe', 'epe campus', 'lasu epe', 'lasu epe campus')
      THEN 'epe campus'
    WHEN ${normalizedCampus} IN ('ikeja', 'ikeja campus', 'lasu ikeja', 'lasu ikeja campus')
      THEN 'ikeja campus'
    ELSE ${normalizedCampus}
  END`;
  return sql`${authorCampus} = ${normalizeCampusLocation(campusLocation)}`;
}