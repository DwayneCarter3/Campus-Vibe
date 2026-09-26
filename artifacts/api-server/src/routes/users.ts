import { Router, type IRouter, type Request } from "express";
import { eq, desc, and, ne, or, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clerkClient, getAuth } from "@clerk/express";
import {
  db,
  earlyBirdClaimsTable,
  paymentTransactionsTable,
  usersTable,
  postsTable,
  postLikesTable,
  postNoCapsTable,
  postCommentsTable,
  servicesTable,
  savedPostsTable,
  savedServicesTable,
} from "@workspace/db";
import { publicEmbeddedPost } from "../lib/post-privacy";
import { loadPublicPolls } from "../lib/polls";
import { requireAuth } from "../middlewares/auth";
import {
  GetMyProfileResponse,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
  GetUserProfileParams,
  GetUserProfileResponse,
  GetUserPostsParams,
  GetUserPostsResponse,
  GetUserServicesParams,
  GetUserServicesResponse,
  SearchStudentsQueryParams,
  SearchStudentsResponse,
} from "@workspace/api-zod";
import { computeCampusTitle } from "./admin";
import { CEO_EMAIL, hasAdminPrivileges } from "../lib/privilege";
import {
  isPrivilegedRole,
  isVerifiedAccount,
  publicDisplayRole,
  publicVerificationStatus,
  PENDING_VERIFICATION_STATUSES,
} from "../lib/verification";
import { expirePaidBadgeEntitlement } from "./payments";
import { decodeMatricEntryYear, getEffectiveLevel } from "../lib/academic-level";
import { ensureWazobiaConversation } from "../lib/wazobia";
import { getInstitutionByName } from "@workspace/campus-institutions";
import {
  campusScopeCondition,
  canonicalInstitutionId,
  profilesShareCampus,
  profilesShareSchool,
  schoolScopeCondition,
  type CampusScopeProfile,
} from "./list-scope";

const opAlias = alias(postsTable, "op");
const ouAlias = alias(usersTable, "ou");
const NOT_LISTED_SCHOOL = "My School is Not Listed";
const OTHER_DEPARTMENT = "Other department";
const CAMPUSX_DISPATCH_USER_ID = "system:campusx-dispatch";

const router: IRouter = Router();

// The owner may see a pending request, but an internal role-granted status
// must never become a public-looking tick on their own profile.
function selfVerificationStatus(user: typeof usersTable.$inferSelect): string {
  const publicStatus = publicVerificationStatus(
    user.verificationStatus, user.role, user.publicBadgeTier, user.publicBadgeExpiresAt,
  );
  return publicStatus !== "none"
    ? publicStatus
    : PENDING_VERIFICATION_STATUSES.includes(
        user.verificationStatus as typeof PENDING_VERIFICATION_STATUSES[number],
      )
      ? user.verificationStatus
      : "none";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeMatricNumber(matricNumber: string): string {
  return matricNumber.trim().toUpperCase();
}

async function getVerifiedPrimaryEmail(clerkUserId: string): Promise<string | null> {
  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const primaryEmail = clerkUser.emailAddresses.find(
    (email) => email.id === clerkUser.primaryEmailAddressId,
  );
  if (primaryEmail?.verification?.status !== "verified") return null;
  const email = normalizeEmail(primaryEmail.emailAddress);
  return email || null;
}

type IdentityReconciliation = {
  user: typeof usersTable.$inferSelect;
  emailConflict: boolean;
};

async function reconcileClerkIdentity(
  user: typeof usersTable.$inferSelect,
  verifiedPrimaryEmail: string | null,
): Promise<IdentityReconciliation> {
  const emailConflict = Boolean(
    verifiedPrimaryEmail &&
      normalizeEmail(user.email) !== verifiedPrimaryEmail &&
      (await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(
          sql`lower(btrim(${usersTable.email})) = ${verifiedPrimaryEmail}`,
          ne(usersTable.clerkUserId, user.clerkUserId),
        ))
        .limit(1))[0],
  );

  const changes: Partial<typeof usersTable.$inferInsert> = {};
  const roleChanges: Partial<typeof usersTable.$inferInsert> = {};
  if (verifiedPrimaryEmail && !emailConflict && normalizeEmail(user.email) !== verifiedPrimaryEmail) {
    changes.email = verifiedPrimaryEmail;
  }

  if (verifiedPrimaryEmail === CEO_EMAIL && !emailConflict) {
    if (user.role !== "admin") {
      if (user.role !== "ceo") roleChanges.role = "ceo";
      if (!user.isAdmin) roleChanges.isAdmin = true;
      if (
        user.verificationStatus !== "Premium_Approved" &&
        !PENDING_VERIFICATION_STATUSES.includes(user.verificationStatus as typeof PENDING_VERIFICATION_STATUSES[number])
      ) {
        roleChanges.verificationStatus = "Premium_Approved";
      }
    }
  } else if (user.role === "ceo") {
    roleChanges.role = "student";
    roleChanges.isAdmin = false;
  }

  Object.assign(changes, roleChanges);
  const identityConflict = emailConflict;
  if (identityConflict && Object.keys(roleChanges).length) {
    const [updated] = await db
      .update(usersTable)
      .set(roleChanges)
      .where(eq(usersTable.clerkUserId, user.clerkUserId))
      .returning();
    if (roleChanges.role === "student") {
      await expirePaidBadgeEntitlement(user.clerkUserId);
      const [refreshed] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, user.clerkUserId))
        .limit(1);
      return { user: refreshed ?? updated ?? { ...user, ...roleChanges }, emailConflict: true };
    }
    return { user: updated ?? { ...user, ...roleChanges }, emailConflict: true };
  }

  if (!Object.keys(changes).length) return { user, emailConflict: false };

  try {
    const [updated] = await db
      .update(usersTable)
      .set(changes)
      .where(eq(usersTable.clerkUserId, user.clerkUserId))
      .returning();
    let reconciled = updated ?? { ...user, ...changes };
    if (roleChanges.role === "student") {
      await expirePaidBadgeEntitlement(user.clerkUserId);
      const [refreshed] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkUserId, user.clerkUserId))
        .limit(1);
      reconciled = refreshed ?? reconciled;
    }
    return { user: reconciled, emailConflict: false };
  } catch (error: any) {
    if (error?.code === "23505" && error?.constraint?.includes("email")) {
      let reconciled = user;
      if (roleChanges.role === "student") {
        const [updated] = await db
          .update(usersTable)
          .set(roleChanges)
          .where(eq(usersTable.clerkUserId, user.clerkUserId))
          .returning();
        await expirePaidBadgeEntitlement(user.clerkUserId);
        const [refreshed] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.clerkUserId, user.clerkUserId))
          .limit(1);
        reconciled = refreshed ?? updated ?? { ...user, ...roleChanges };
      }
      return { user: reconciled, emailConflict: true };
    }
    throw error;
  }
}

type ProfileScope = CampusScopeProfile & { clerkUserId: string; role: string };

async function resolveProfileReadAccess(
  req: Request,
  viewerId: string,
  profileId: string,
): Promise<{ viewer: ProfileScope; profile: ProfileScope; unrestricted: boolean } | null> {
  const [viewer] = await db
    .select({
      clerkUserId: usersTable.clerkUserId,
      institutionId: usersTable.institutionId,
      school: usersTable.school,
      campusLocation: usersTable.campusLocation,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, viewerId))
    .limit(1);
  if (!viewer) return null;
  const [profile] = await db
    .select({
      clerkUserId: usersTable.clerkUserId,
      institutionId: usersTable.institutionId,
      school: usersTable.school,
      campusLocation: usersTable.campusLocation,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, profileId))
    .limit(1);
  if (!profile) return null;

  const unrestricted = viewer.role !== "system"
    && profile.role !== "system"
    && viewerId !== CAMPUSX_DISPATCH_USER_ID
    && profileId !== CAMPUSX_DISPATCH_USER_ID
    && (viewerId === profileId || await hasAdminPrivileges(req));
  if (profileId === CAMPUSX_DISPATCH_USER_ID) {
    if (!viewer.school.trim() || !viewer.campusLocation.trim()) return null;
    return { viewer, profile, unrestricted: false };
  }
  if (
    !unrestricted &&
    (!profilesShareSchool(viewer, profile) || !profilesShareCampus(viewer, profile))
  ) {
    return null;
  }
  return { viewer, profile, unrestricted };
}

type ValidatedInstitutionScope = {
  school: string;
  institutionId: string | null;
  campusLocation: string;
  faculty: string;
};

type InstitutionScopeResult =
  | { value: ValidatedInstitutionScope }
  | { error: string };

function validateInstitutionScope(
  schoolValue: unknown,
  campusValue: unknown,
  facultyValue: unknown,
): InstitutionScopeResult {
  const school = typeof schoolValue === "string" ? schoolValue.trim() : "";
  const campusLocation = typeof campusValue === "string" ? campusValue.trim() : "";
  const faculty = typeof facultyValue === "string" ? facultyValue.trim() : "";
  if (!school || !campusLocation || !faculty) {
    return { error: "School, campus location, and faculty/school are required." };
  }

  if (school.toLowerCase() === NOT_LISTED_SCHOOL.toLowerCase()) {
    return { value: { school: NOT_LISTED_SCHOOL, institutionId: null, campusLocation, faculty } };
  }

  const institution = getInstitutionByName(school);
  if (!institution) {
    return { error: "Select a listed institution or use the Not Listed option." };
  }
  if (!institution.campuses.includes(campusLocation)) {
    return { error: "The selected campus does not belong to the selected institution." };
  }
  if (!institution.faculties.includes(faculty) && faculty !== OTHER_DEPARTMENT) {
    return { error: "The selected faculty or school does not belong to the selected institution." };
  }

  return {
    value: {
      school: institution.name,
      institutionId: institution.id,
      campusLocation,
      faculty,
    },
  };
}

router.get("/users/search", requireAuth, async (req, res): Promise<void> => {
  const parsed = SearchStudentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter at least two characters to search students." });
    return;
  }
  const userId = (req as any).userId as string;
  const [currentUser] = await db.select({ school: usersTable.school })
    .from(usersTable).where(eq(usersTable.clerkUserId, userId)).limit(1);
  if (!currentUser) {
    res.status(403).json({ error: "Complete your profile before searching students." });
    return;
  }
  const query = parsed.data.q.trim().toLowerCase();
  if (query.length < 2) {
    res.status(400).json({ error: "Enter at least two characters to search students." });
    return;
  }
  const matches = await db.select({
    userId: usersTable.clerkUserId,
    fullName: usersTable.fullName,
    username: usersTable.username,
    department: usersTable.department,
    avatarUrl: usersTable.avatarUrl,
    verificationStatus: usersTable.verificationStatus,
    publicBadgeTier: usersTable.publicBadgeTier,
    publicBadgeExpiresAt: usersTable.publicBadgeExpiresAt,
    role: usersTable.role,
  }).from(usersTable).where(and(
    eq(usersTable.school, currentUser.school),
    ne(usersTable.clerkUserId, userId),
    ne(usersTable.role, "system"),
    sql`(strpos(lower(${usersTable.fullName}), ${query}) > 0
      OR strpos(lower(coalesce(${usersTable.username}, '')), ${query}) > 0
      OR strpos(lower(coalesce(${usersTable.department}, '')), ${query}) > 0)`,
  )).orderBy(usersTable.fullName).limit(8);

  res.json(SearchStudentsResponse.parse({ students: matches.map(({
    role, publicBadgeTier, publicBadgeExpiresAt, ...student
  }) => ({
    ...student,
    verificationStatus: publicVerificationStatus(
      student.verificationStatus,
      role,
      publicBadgeTier,
      publicBadgeExpiresAt,
    ),
  })) }));
});

// How many registrants get the early-bird perk
const EARLY_BIRD_LIMIT = 100;
// Duration in milliseconds (30 days)
const PROMO_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

async function getPostCount(clerkUserId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(eq(postsTable.authorId, clerkUserId));
  return count ?? 0;
}

/** Strip expired promo badges (lazy check on any user read). Returns updated user. */
async function expirePromoIfNeeded(user: typeof usersTable.$inferSelect): Promise<typeof usersTable.$inferSelect> {
  if (user.promoExpiresAt && user.promoExpiresAt < new Date()) {
    let status = (user.role === "ceo" || user.role === "admin") &&
      !PENDING_VERIFICATION_STATUSES.includes(user.verificationStatus as typeof PENDING_VERIFICATION_STATUSES[number])
      ? "Premium_Approved"
      : user.verificationStatus;

    if (
      user.role !== "ceo" &&
      user.role !== "admin" &&
      (user.verificationStatus === "Student_Verified" ||
        user.verificationStatus === "Premium_Approved")
    ) {
      const [badgeClaim] = await db
        .select({ badgeClaimedAt: earlyBirdClaimsTable.badgeClaimedAt })
        .from(earlyBirdClaimsTable)
        .where(eq(earlyBirdClaimsTable.clerkUserId, user.clerkUserId))
        .limit(1);

      if (badgeClaim?.badgeClaimedAt) {
        const packageType =
          user.verificationStatus === "Student_Verified"
            ? "student_verification"
            : "premium_blue_tick";
        const payments = await db
          .select({
            paidAt: paymentTransactionsTable.paidAt,
            createdAt: paymentTransactionsTable.createdAt,
            durationDays: paymentTransactionsTable.durationDays,
            entitlementExpiresAt: paymentTransactionsTable.entitlementExpiresAt,
          })
          .from(paymentTransactionsTable)
          .where(
            and(
              eq(paymentTransactionsTable.clerkUserId, user.clerkUserId),
              eq(paymentTransactionsTable.packageType, packageType),
              eq(paymentTransactionsTable.status, "paid"),
            ),
          );
        const now = new Date();
        const hasActivePaidBadge = payments.some((payment) => {
          const expiresAt =
            payment.entitlementExpiresAt ??
            new Date(
              (payment.paidAt ?? payment.createdAt).getTime() +
                payment.durationDays * 24 * 60 * 60 * 1000,
            );
          return expiresAt > now;
        });
        if (!hasActivePaidBadge) status = "approved";
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        verificationStatus: status,
        premiumBadgeDiscountPercent: 0,
        promoExpiresAt: null,
      })
      .where(eq(usersTable.clerkUserId, user.clerkUserId))
      .returning();
    return updated ?? {
      ...user,
      verificationStatus: status,
      premiumBadgeDiscountPercent: 0,
      promoExpiresAt: null,
    };
  }
  return user;
}

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  if (!user) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  // Reconcile identity on login from Clerk's verified primary address, never the stored email.
  let clerkIdentityFetched = false;
  let verifiedPrimaryEmail: string | null = null;
  try {
    verifiedPrimaryEmail = await getVerifiedPrimaryEmail(userId);
    clerkIdentityFetched = true;
  } catch {
    // Keep this read available during a Clerk outage, but do not grant privileges from stale email.
  }
  if (clerkIdentityFetched) {
    const reconciled = await reconcileClerkIdentity(user, verifiedPrimaryEmail);
    user = reconciled.user;
    if (reconciled.emailConflict) {
      res.status(409).json({
        code: "EMAIL_CONFLICT",
        error: "This verified email address is already registered to another account.",
      });
      return;
    }
  }

  if (
    isPrivilegedRole(user.role) &&
    user.verificationStatus !== "Premium_Approved" &&
    !PENDING_VERIFICATION_STATUSES.includes(user.verificationStatus as typeof PENDING_VERIFICATION_STATUSES[number])
  ) {
    [user] = await db
      .update(usersTable)
      .set({ verificationStatus: "Premium_Approved" })
      .where(eq(usersTable.clerkUserId, userId))
      .returning();
  }

  await expirePaidBadgeEntitlement(userId);
  // Reload because paid-badge expiration may have changed this profile.
  [user] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, userId));
  // Lazy expiry of the independent registration discount.
  user = await expirePromoIfNeeded(user);

  const postCount = await getPostCount(userId);
  const campusTitle = computeCampusTitle(publicDisplayRole(user.role), postCount);

  res.json(GetMyProfileResponse.parse({
    ...user,
    verificationStatus: selfVerificationStatus(user),
    manualLevel: user.level,
    level: getEffectiveLevel(user.level, user.matricNumber),
    campusTitle,
  }));
});

router.put("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const profileData: Partial<typeof usersTable.$inferInsert> = { ...parsed.data };
  if (profileData.username !== undefined) {
    const username = profileData.username?.trim().toLowerCase() || null;
    if (username && !/^[a-z0-9_]{3,24}$/.test(username)) {
      res.status(400).json({ error: "Username must be 3–24 letters, numbers, or underscores." });
      return;
    }
    profileData.username = username;
    if (username) {
      const [duplicate] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(and(sql`lower(${usersTable.username}) = ${username}`, ne(usersTable.clerkUserId, userId))).limit(1);
      if (duplicate) {
        res.status(409).json({ code: "USERNAME_CONFLICT", error: "This username is already taken." });
        return;
      }
    }
  }
  if (profileData.department !== undefined) {
    const department = profileData.department?.trim() || null;
    if (department && department.length > 80) {
      res.status(400).json({ error: "Department must be at most 80 characters." });
      return;
    }
    profileData.department = department;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  let user;
  let createdNewAccount = false;
  if (existing.length === 0) {
    // ── New registration ─────────────────────────────────────────
    const data = parsed.data;
    if (
      !data.fullName?.trim() ||
      data.level === undefined ||
      !data.faculty?.trim() ||
      !data.enrollmentStatus?.trim() ||
      !data.school?.trim() ||
      !data.campusLocation?.trim()
    ) {
      res.status(400).json({ error: "Missing required profile fields" });
      return;
    }

    const scope = validateInstitutionScope(data.school, data.campusLocation, data.faculty);
    if ("error" in scope) {
      res.status(400).json({ error: scope.error });
      return;
    }
    if (!scope.value.institutionId) {
      res.status(400).json({ error: "Vote for your institution to be added before registering." });
      return;
    }
    const matricVal = typeof data.matricNumber === "string"
      ? normalizeMatricNumber(data.matricNumber)
      : "";
    if (scope.value.institutionId && !matricVal) {
      res.status(400).json({ error: "Matriculation number is required for a listed institution." });
      return;
    }
    if (data.level === "" && decodeMatricEntryYear(matricVal) === null) {
      res.status(400).json({ error: "Automatic level needs a matric number beginning with a valid two-digit entry year." });
      return;
    }

    let emailVal: string | null;
    try {
      emailVal = await getVerifiedPrimaryEmail(userId);
    } catch {
      res.status(503).json({ error: "Could not verify your primary email with Clerk. Please try again." });
      return;
    }
    if (!emailVal) {
      res.status(400).json({ error: "A verified primary Clerk email is required to register." });
      return;
    }

    // ── Unique constraint: institution + normalized matric number ──
    if (scope.value.institutionId && matricVal) {
      const matricCandidates = await db
        .select({
          id: usersTable.id,
          institutionId: usersTable.institutionId,
          school: usersTable.school,
        })
        .from(usersTable)
        .where(and(
          or(eq(usersTable.institutionId, scope.value.institutionId), isNull(usersTable.institutionId)),
          sql`lower(btrim(${usersTable.matricNumber})) = ${matricVal.toLowerCase()}`,
        ));
      const matricConflict = matricCandidates.some((candidate) =>
        candidate.institutionId === scope.value.institutionId ||
        (!candidate.institutionId && getInstitutionByName(candidate.school)?.id === scope.value.institutionId)
      );
      if (matricConflict) {
        res.status(409).json({
          code: "MATRIC_CONFLICT",
          error: "This matriculation number is already registered at this institution.",
        });
        return;
      }
    }

    // ── Unique constraint: verified primary email ─────────────────
    const [emailConflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(sql`lower(btrim(${usersTable.email})) = ${emailVal}`)
      .limit(1);
    if (emailConflict) {
      res.status(409).json({
        code: "EMAIL_CONFLICT",
        error: "This verified email address is already registered to another account.",
      });
      return;
    }

    const roleVal = emailVal === CEO_EMAIL ? "ceo" : "student";
    const isAdminVal = roleVal === "ceo";

    // ── Insert new user ──────────────────────────────────────────
    try {
      [user] = await db
        .insert(usersTable)
        .values({
          clerkUserId: userId,
          fullName: data.fullName,
          username: profileData.username ?? null,
          department: profileData.department ?? null,
          email: emailVal,
          institutionId: scope.value.institutionId,
          school: scope.value.school,
          campusLocation: scope.value.campusLocation,
          level: data.level,
          faculty: scope.value.faculty,
          enrollmentStatus: data.enrollmentStatus,
          matricNumber: matricVal,
          campus: scope.value.campusLocation,
          bio: data.bio ?? null,
          avatarUrl: data.avatarUrl ?? null,
          role: roleVal,
          isAdmin: isAdminVal,
          verificationStatus: isAdminVal ? "Premium_Approved" : "approved",
        })
        .returning();
      createdNewAccount = true;
    } catch (err: any) {
      // Catch any DB-level unique violations that slipped the pre-checks (race condition)
      if (err?.code === "23505") {
        const constraint = err?.constraint ?? "";
        if (constraint.includes("institution_matric") || constraint.includes("matric")) {
          res.status(409).json({
            code: "MATRIC_CONFLICT",
            error: "This matriculation number is already registered at this institution.",
          });
        } else if (constraint.includes("email")) {
          res.status(409).json({
            code: "EMAIL_CONFLICT",
            error: "This verified email address is already registered to another account.",
          });
        } else if (constraint.includes("username")) {
          res.status(409).json({ code: "USERNAME_CONFLICT", error: "This username is already taken." });
        } else {
          res.status(409).json({ error: "An account with these details already exists." });
        }
        return;
      }
      throw err;
    }

    // ── Early-bird promo: first 100 users get free badge + hustle promo for 30 days ──
    const isEarlyBird = !!user && user.registrationRank <= EARLY_BIRD_LIMIT;
    if (isEarlyBird && user) {
      const promoExpiresAt = new Date(user.createdAt.getTime() + PROMO_DURATION_MS);
      [user] = await db
        .update(usersTable)
        .set({
          premiumBadgeDiscountPercent: 100,
          promoExpiresAt,
          hustlePromoExpiresAt: promoExpiresAt,
        })
        .where(eq(usersTable.clerkUserId, userId))
        .returning();
    }
  } else {
    // ── Profile update (existing user) ─────────────────────────────
    const current = existing[0];
    const nextLevel = parsed.data.level ?? current.level;
    const scopeSupplied =
      parsed.data.school !== undefined ||
      parsed.data.campusLocation !== undefined ||
      parsed.data.faculty !== undefined;
    const matricSupplied = parsed.data.matricNumber !== undefined;
    const candidateMatric = matricSupplied
      ? normalizeMatricNumber(parsed.data.matricNumber ?? "")
      : current.matricNumber;
    const nextMatric = scopeSupplied ? normalizeMatricNumber(candidateMatric) : candidateMatric;
    if (nextLevel === "" && decodeMatricEntryYear(nextMatric) === null) {
      res.status(400).json({ error: "Automatic level needs a matric number beginning with a valid two-digit entry year." });
      return;
    }

    let targetInstitutionId = current.institutionId ?? getInstitutionByName(current.school)?.id ?? null;
    if (matricSupplied && targetInstitutionId && !nextMatric) {
      res.status(400).json({ error: "Matriculation number is required for a listed institution." });
      return;
    }
    if (scopeSupplied) {
      const nextSchool = parsed.data.school ?? current.school;
      const currentSchoolKey = current.institutionId
        ?? getInstitutionByName(current.school)?.id
        ?? (current.school.toLowerCase() === NOT_LISTED_SCHOOL.toLowerCase() ? NOT_LISTED_SCHOOL : current.school.trim().toLowerCase());
      const requestedInstitution = nextSchool.toLowerCase() === NOT_LISTED_SCHOOL.toLowerCase()
        ? null
        : getInstitutionByName(nextSchool);
      const nextSchoolKey = requestedInstitution?.id
        ?? (nextSchool.toLowerCase() === NOT_LISTED_SCHOOL.toLowerCase() ? NOT_LISTED_SCHOOL : nextSchool.trim().toLowerCase());
      if (
        parsed.data.school !== undefined &&
        currentSchoolKey !== nextSchoolKey &&
        (parsed.data.campusLocation === undefined || parsed.data.faculty === undefined)
      ) {
        res.status(400).json({ error: "Select a campus and faculty/school when changing institutions." });
        return;
      }

      const scope = validateInstitutionScope(
        nextSchool,
        parsed.data.campusLocation ?? current.campusLocation,
        parsed.data.faculty ?? current.faculty,
      );
      if ("error" in scope) {
        res.status(400).json({ error: scope.error });
        return;
      }
      targetInstitutionId = scope.value.institutionId;
      if (targetInstitutionId && !nextMatric) {
        res.status(400).json({ error: "Matriculation number is required for a listed institution." });
        return;
      }
      profileData.institutionId = targetInstitutionId;
      profileData.school = scope.value.school;
      profileData.campusLocation = scope.value.campusLocation;
      profileData.faculty = scope.value.faculty;
      profileData.campus = scope.value.campusLocation;
    }

    if (matricSupplied || scopeSupplied) {
      profileData.matricNumber = nextMatric;
      if (matricSupplied && current.institutionId !== targetInstitutionId) {
        profileData.institutionId = targetInstitutionId;
      }
      if (targetInstitutionId && nextMatric) {
        const matricCandidates = await db
          .select({
            id: usersTable.id,
            institutionId: usersTable.institutionId,
            school: usersTable.school,
          })
          .from(usersTable)
          .where(and(
            or(eq(usersTable.institutionId, targetInstitutionId), isNull(usersTable.institutionId)),
            sql`lower(btrim(${usersTable.matricNumber})) = ${nextMatric.toLowerCase()}`,
            ne(usersTable.clerkUserId, userId),
          ));
        const conflict = matricCandidates.some((candidate) =>
          candidate.institutionId === targetInstitutionId ||
          (!candidate.institutionId && getInstitutionByName(candidate.school)?.id === targetInstitutionId)
        );
        if (conflict) {
          res.status(409).json({
            code: "MATRIC_CONFLICT",
            error: "This matriculation number is already registered at this institution.",
          });
          return;
        }
      }
    }

    // Client payloads cannot set email; reconcile it and CEO access from Clerk's verified primary address.
    let clerkIdentityFetched = false;
    let verifiedEmail: string | null = null;
    try {
      verifiedEmail = await getVerifiedPrimaryEmail(userId);
      clerkIdentityFetched = true;
    } catch {
      // Existing users can still update non-email fields during a temporary Clerk outage.
    }
    if (clerkIdentityFetched) {
      const reconciled = await reconcileClerkIdentity(current, verifiedEmail);
      if (reconciled.emailConflict) {
        res.status(409).json({
          code: "EMAIL_CONFLICT",
          error: "This verified email address is already registered to another account.",
        });
        return;
      }
    }

    try {
      [user] = await db
        .update(usersTable)
        .set(profileData)
        .where(eq(usersTable.clerkUserId, userId))
        .returning();
    } catch (error: any) {
      if (error?.code === "23505") {
        const constraint = error?.constraint ?? "";
        if (constraint.includes("institution_matric") || constraint.includes("matric")) {
          res.status(409).json({
            code: "MATRIC_CONFLICT",
            error: "This matriculation number is already registered at this institution.",
          });
        } else if (constraint.includes("email")) {
          res.status(409).json({
            code: "EMAIL_CONFLICT",
            error: "This verified email address is already registered to another account.",
          });
        } else if (constraint.includes("username")) {
          res.status(409).json({ code: "USERNAME_CONFLICT", error: "This username is already taken." });
        } else {
          res.status(409).json({ error: "An account with these details already exists." });
        }
        return;
      }
      throw error;
    }

    if (
      isPrivilegedRole(user.role) &&
      user.verificationStatus !== "Premium_Approved" &&
      !PENDING_VERIFICATION_STATUSES.includes(user.verificationStatus as typeof PENDING_VERIFICATION_STATUSES[number])
    ) {
      [user] = await db.update(usersTable)
        .set({ verificationStatus: "Premium_Approved" })
        .where(eq(usersTable.clerkUserId, userId)).returning();
    }
    // Lazy expiry check on update too
    user = await expirePromoIfNeeded(user);
  }

  if (createdNewAccount && user?.role === "student") {
    await ensureWazobiaConversation(userId);
  }

  const postCount = await getPostCount(userId);
  const campusTitle = computeCampusTitle(publicDisplayRole(user.role), postCount);

  res.json(UpdateMyProfileResponse.parse({
    ...user,
    verificationStatus: selfVerificationStatus(user),
    manualLevel: user.level,
    level: getEffectiveLevel(user.level, user.matricNumber),
    campusTitle,
  }));
});

router.post("/users/me/request-badge", requireAuth, async (_req, res): Promise<void> => {
  res.status(410).json({
    code: "BADGE_CHECKOUT_REQUIRED",
    error: "This badge endpoint is retired. Start verification through /payments/initialize.",
  });
});

router.get("/users/:userId/posts", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = GetUserPostsParams.safeParse({ userId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const clerkUserId = getAuth(req).userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { userId } = params.data;
  const readAccess = await resolveProfileReadAccess(req, clerkUserId, userId);
  if (!readAccess) {
    res.status(403).json({ error: "You can only view profiles in your school and campus." });
    return;
  }
  const isDispatchBotProfile = userId === CAMPUSX_DISPATCH_USER_ID;
  const viewerInstitutionId = canonicalInstitutionId(readAccess.viewer);
  const scopeFilters = isDispatchBotProfile
    ? [viewerInstitutionId ? eq(postsTable.targetInstitutionId, viewerInstitutionId) : sql`false`]
    : readAccess.unrestricted ? [] : [
        schoolScopeCondition(usersTable.institutionId, usersTable.school, readAccess.viewer),
        campusScopeCondition(usersTable.campusLocation, readAccess.viewer.campusLocation),
      ];
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const posts = await db
    .select({
      id: postsTable.id,
      authorId: postsTable.authorId,
      isAnonymous: postsTable.isAnonymous,
      content: postsTable.content,
      category: postsTable.category,
      imageUrl: postsTable.imageUrl,
      blurDataUrl: postsTable.blurDataUrl,
      videoUrl: postsTable.videoUrl,
      likesCount: postsTable.likesCount,
      noCapsCount: postsTable.noCapsCount,
      reshareCount: postsTable.reshareCount,
      originalPostId: postsTable.originalPostId,
      isPinnedToProfile: postsTable.isPinnedToProfile,
      isPinnedToFeed: postsTable.isPinnedToFeed,
      isFeaturedTrending: postsTable.isFeaturedTrending,
      createdAt: postsTable.createdAt,
      authorName: usersTable.fullName,
      authorUsername: usersTable.username,
      authorFaculty: usersTable.faculty,
      authorLevel: usersTable.level,
      authorMatricNumber: usersTable.matricNumber,
      authorCampusLocation: usersTable.campusLocation,
      authorAvatarUrl: usersTable.avatarUrl,
      authorRole: usersTable.role,
      authorVerificationStatus: usersTable.verificationStatus,
      authorPublicBadgeTier: usersTable.publicBadgeTier,
      authorPublicBadgeExpiresAt: usersTable.publicBadgeExpiresAt,
      opId: opAlias.id,
      opAuthorId: opAlias.authorId,
      opContent: opAlias.content,
      opImageUrl: opAlias.imageUrl,
      opCreatedAt: opAlias.createdAt,
      opAuthorName: ouAlias.fullName,
      opAuthorUsername: ouAlias.username,
      opAuthorAvatarUrl: ouAlias.avatarUrl,
      opAuthorVerificationStatus: ouAlias.verificationStatus,
      opAuthorRole: ouAlias.role,
      opAuthorPublicBadgeTier: ouAlias.publicBadgeTier,
      opAuthorPublicBadgeExpiresAt: ouAlias.publicBadgeExpiresAt,
      opIsAnonymous: opAlias.isAnonymous,
      opTargetInstitutionId: opAlias.targetInstitutionId,
      opAuthorInstitutionId: ouAlias.institutionId,
      opAuthorSchool: ouAlias.school,
      opAuthorCampusLocation: ouAlias.campusLocation,
    })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .leftJoin(opAlias, eq(postsTable.originalPostId, opAlias.id))
    .leftJoin(ouAlias, eq(opAlias.authorId, ouAlias.clerkUserId))
    .where(and(
      eq(postsTable.authorId, userId),
      eq(postsTable.isAnonymous, false),
      ...scopeFilters,
    ))
    .orderBy(desc(postsTable.isPinnedToProfile), desc(postsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .innerJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .where(and(
      eq(postsTable.authorId, userId),
      eq(postsTable.isAnonymous, false),
      ...scopeFilters,
    ));

  const publicPolls = await loadPublicPolls(posts.map((post) => post.originalPostId ?? post.id), clerkUserId);
  const postsWithReactions = await Promise.all(
    posts.map(async (post) => {
      let isLikedByMe = false;
      let isNoCapByMe = false;
      let isSavedByMe = false;
      if (clerkUserId) {
        const [likes, nocaps, saves] = await Promise.all([
          db.select().from(postLikesTable).where(and(eq(postLikesTable.postId, post.id), eq(postLikesTable.userId, clerkUserId))),
          db.select().from(postNoCapsTable).where(and(eq(postNoCapsTable.postId, post.id), eq(postNoCapsTable.userId, clerkUserId))),
          db.select({ id: savedPostsTable.id }).from(savedPostsTable).where(and(eq(savedPostsTable.postId, post.id), eq(savedPostsTable.userId, clerkUserId))),
        ]);
        isLikedByMe = likes.length > 0;
        isNoCapByMe = nocaps.length > 0;
        isSavedByMe = saves.length > 0;
      }
      const [{ commentsCount }] = await db
        .select({ commentsCount: sql<number>`count(*)::int` })
        .from(postCommentsTable)
        .where(eq(postCommentsTable.postId, post.id));

      const role = post.authorRole ?? "student";
      const publicRole = publicDisplayRole(role);
      const postCount = await getPostCount(post.authorId);
      const campusTitle = computeCampusTitle(publicRole, postCount);
      const {
        authorMatricNumber,
        authorPublicBadgeTier,
        authorPublicBadgeExpiresAt,
        opId, opAuthorId, opContent, opImageUrl, opCreatedAt,
        opAuthorName, opAuthorUsername, opAuthorAvatarUrl, opAuthorVerificationStatus,
        opAuthorPublicBadgeTier,
        opAuthorPublicBadgeExpiresAt,
        opAuthorRole, opIsAnonymous, opAuthorInstitutionId, opAuthorSchool,
        opAuthorCampusLocation, opTargetInstitutionId,
        ...publicFields
      } = post;
      const originalAuthorScope = opAuthorSchool && opAuthorCampusLocation
        ? {
            institutionId: opAuthorInstitutionId,
            school: opAuthorSchool,
            campusLocation: opAuthorCampusLocation,
          }
        : null;
      const originalTargetInstitutionMatches = Boolean(
        opTargetInstitutionId !== null &&
          opTargetInstitutionId !== undefined &&
          viewerInstitutionId !== null &&
          opTargetInstitutionId === viewerInstitutionId,
      );
      const canViewOriginal = Boolean(
        opId != null &&
          opAuthorId != null &&
          (readAccess.unrestricted ||
            opAuthorId === clerkUserId ||
            originalTargetInstitutionMatches ||
            (opTargetInstitutionId == null &&
              originalAuthorScope &&
              profilesShareSchool(readAccess.viewer, originalAuthorScope) &&
              profilesShareCampus(readAccess.viewer, originalAuthorScope))),
      );

      return {
        ...publicFields,
        isOwnedByMe: Boolean(clerkUserId && clerkUserId === post.authorId),
        isSavedByMe,
        authorName: post.authorName ?? "Unknown",
        authorUsername: post.isAnonymous ? null : post.authorUsername ?? null,
        authorFaculty: post.authorFaculty ?? "Unknown",
        authorLevel: getEffectiveLevel(post.authorLevel, authorMatricNumber),
        authorCampusLocation: post.authorCampusLocation ?? "Ojo",
        authorAvatarUrl: post.authorAvatarUrl ?? null,
        authorCampusTitle: campusTitle,
        authorRole: publicRole,
        authorIsVerified: isVerifiedAccount(post.authorVerificationStatus, role, authorPublicBadgeTier, authorPublicBadgeExpiresAt),
        authorVerificationStatus: publicVerificationStatus(post.authorVerificationStatus, role, authorPublicBadgeTier, authorPublicBadgeExpiresAt),
        isAnonymous: post.isAnonymous ?? false,
        poll: post.originalPostId == null || canViewOriginal
          ? publicPolls.get(post.originalPostId ?? post.id) ?? null
          : null,
        commentsCount: commentsCount ?? 0,
        reshareCount: post.reshareCount ?? 0,
        originalPostId: canViewOriginal ? post.originalPostId ?? null : null,
        originalPost: canViewOriginal && post.opId != null ? publicEmbeddedPost({
          id: post.opId,
          authorId: post.opAuthorId ?? "",
          authorName: post.opAuthorName ?? "Unknown",
          authorUsername: opAuthorUsername ?? null,
          authorAvatarUrl: post.opAuthorAvatarUrl ?? null,
          authorIsVerified: !post.opIsAnonymous && isVerifiedAccount(opAuthorVerificationStatus, opAuthorRole, opAuthorPublicBadgeTier, opAuthorPublicBadgeExpiresAt),
          authorVerificationStatus: post.opIsAnonymous ? "none" : publicVerificationStatus(opAuthorVerificationStatus, opAuthorRole, opAuthorPublicBadgeTier, opAuthorPublicBadgeExpiresAt),
          isAnonymous: Boolean(post.opIsAnonymous),
          content: post.opContent ?? "",
          imageUrl: post.opImageUrl ?? null,
          createdAt: (post.opCreatedAt ?? new Date()).toISOString(),
        }) : null,
        isPinnedToProfile: post.isPinnedToProfile ?? false,
        isPinnedToFeed: post.isPinnedToFeed ?? false,
        isLikedByMe,
        isNoCapByMe,
      };
    })
  );

  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetUserPostsResponse.parse({ posts: postsWithReactions, total: count, nextCursor: null }));
});

router.get("/users/:userId/services", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = GetUserServicesParams.safeParse({ userId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const clerkUserId = getAuth(req).userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { userId } = params.data;
  const readAccess = await resolveProfileReadAccess(req, clerkUserId, userId);
  if (!readAccess) {
    res.status(403).json({ error: "You can only view profiles in your school and campus." });
    return;
  }
  const scopeFilters = readAccess.unrestricted ? [] : [
    schoolScopeCondition(usersTable.institutionId, usersTable.school, readAccess.viewer),
    campusScopeCondition(usersTable.campusLocation, readAccess.viewer.campusLocation),
  ];
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const services = await db
    .select({
      id: servicesTable.id,
      providerId: servicesTable.providerId,
      title: servicesTable.title,
      description: servicesTable.description,
      category: servicesTable.category,
      imageUrl: servicesTable.imageUrl,
      blurDataUrl: servicesTable.blurDataUrl,
      price: servicesTable.price,
      originalPrice: servicesTable.originalPrice,
      isFlashSale: servicesTable.isFlashSale,
      flashExpiresAt: servicesTable.flashExpiresAt,
      contactInfo: servicesTable.contactInfo,
      isActive: servicesTable.isActive,
      isFeatured: servicesTable.isFeatured,
      isPinnedToProfile: servicesTable.isPinnedToProfile,
      createdAt: servicesTable.createdAt,
      providerName: usersTable.fullName,
      providerFaculty: usersTable.faculty,
      providerLevel: usersTable.level,
      providerMatricNumber: usersTable.matricNumber,
      providerCampusLocation: usersTable.campusLocation,
      providerAvatarUrl: usersTable.avatarUrl,
      providerVerificationStatus: usersTable.verificationStatus,
      providerRole: usersTable.role,
      providerPublicBadgeTier: usersTable.publicBadgeTier,
      providerPublicBadgeExpiresAt: usersTable.publicBadgeExpiresAt,
    })
    .from(servicesTable)
    .leftJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(and(
      eq(servicesTable.providerId, userId),
      eq(servicesTable.isActive, true),
      sql`(${servicesTable.isFlashSale} = false OR ${servicesTable.flashExpiresAt} > ${new Date()})`,
      ...scopeFilters,
    ))
    .orderBy(desc(servicesTable.isPinnedToProfile), desc(servicesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(servicesTable)
    .innerJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(and(
      eq(servicesTable.providerId, userId),
      eq(servicesTable.isActive, true),
      sql`(${servicesTable.isFlashSale} = false OR ${servicesTable.flashExpiresAt} > ${new Date()})`,
      ...scopeFilters,
    ));

  const enriched = await Promise.all(services.map(async (s) => {
    const {
      providerVerificationStatus, providerRole, providerMatricNumber,
      providerPublicBadgeTier, providerPublicBadgeExpiresAt, ...rest
    } = s;
    const role = providerRole ?? "student";
    const publicRole = publicDisplayRole(role);
    const postCount = await getPostCount(s.providerId);
    const isSavedByMe = clerkUserId
      ? (await db.select({ id: savedServicesTable.id }).from(savedServicesTable)
          .where(and(eq(savedServicesTable.serviceId, s.id), eq(savedServicesTable.userId, clerkUserId)))).length > 0
      : false;
    return {
      ...rest,
      flashExpiresAt: s.flashExpiresAt?.toISOString() ?? null,
      isSavedByMe,
      providerName: s.providerName ?? "Unknown",
      providerFaculty: s.providerFaculty ?? "Unknown",
      providerLevel: getEffectiveLevel(s.providerLevel, providerMatricNumber),
      providerCampusLocation: s.providerCampusLocation ?? "Ojo",
      providerAvatarUrl: s.providerAvatarUrl ?? null,
      providerIsVerified: isVerifiedAccount(providerVerificationStatus, role, providerPublicBadgeTier, providerPublicBadgeExpiresAt),
      providerVerificationStatus: publicVerificationStatus(providerVerificationStatus, role, providerPublicBadgeTier, providerPublicBadgeExpiresAt),
      providerCampusTitle: computeCampusTitle(publicRole, postCount),
      providerRole: publicRole,
    };
  }));

  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetUserServicesResponse.parse({ services: enriched, total: count, nextCursor: null }));
});

router.get("/users/:userId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = GetUserProfileParams.safeParse({ userId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await expirePaidBadgeEntitlement(params.data.userId);
  let [profile] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, params.data.userId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (profile.clerkUserId === CAMPUSX_DISPATCH_USER_ID) {
    const viewerId = getAuth(req).userId;
    if (!viewerId) {
      res.status(401).json({ error: "Sign in to view the CampusX Dispatch profile." });
      return;
    }
    const readAccess = await resolveProfileReadAccess(req, viewerId, profile.clerkUserId);
    if (!readAccess) {
      res.status(403).json({ error: "Complete your school and campus profile to view the CampusX Dispatch profile." });
      return;
    }
  }

  profile = await expirePromoIfNeeded(profile);
  const user = {
    id: profile.id,
    clerkUserId: profile.clerkUserId,
    fullName: profile.fullName,
    username: profile.username,
    department: profile.department,
    school: profile.school,
    campusLocation: profile.campusLocation,
    level: profile.level,
    faculty: profile.faculty,
    enrollmentStatus: profile.enrollmentStatus,
    campus: profile.campus,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    matricNumber: profile.matricNumber,
    role: profile.role,
    verificationStatus: profile.verificationStatus,
  };
  const { matricNumber, ...publicUser } = user;
  const postCount = await getPostCount(user.clerkUserId);
  const campusTitle = computeCampusTitle(publicDisplayRole(user.role), postCount);

  res.json(GetUserProfileResponse.parse({
    ...publicUser,
    level: getEffectiveLevel(user.level, matricNumber),
    verificationStatus: publicVerificationStatus(user.verificationStatus, user.role, profile.publicBadgeTier, profile.publicBadgeExpiresAt),
    isVerified: isVerifiedAccount(user.verificationStatus, user.role, profile.publicBadgeTier, profile.publicBadgeExpiresAt),
    role: publicDisplayRole(user.role),
    campusTitle,
  }));
});

export default router;
