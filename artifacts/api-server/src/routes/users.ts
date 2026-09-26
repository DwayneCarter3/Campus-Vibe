import { Router, type IRouter } from "express";
import { eq, desc, and, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clerkClient, getAuth } from "@clerk/express";
import { db, usersTable, postsTable, postLikesTable, postNoCapsTable, postCommentsTable, servicesTable } from "@workspace/db";
import { publicEmbeddedPost } from "../lib/post-privacy";
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
import { CEO_EMAIL, computeCampusTitle } from "./admin";
import { isPrivilegedRole, isVerifiedAccount, publicVerificationStatus, PENDING_VERIFICATION_STATUSES } from "../lib/verification";
import { decodeMatricEntryYear, getEffectiveLevel } from "../lib/academic-level";

const opAlias = alias(postsTable, "op");
const ouAlias = alias(usersTable, "ou");

const router: IRouter = Router();

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
    role: usersTable.role,
  }).from(usersTable).where(and(
    eq(usersTable.school, currentUser.school),
    ne(usersTable.clerkUserId, userId),
    sql`(strpos(lower(${usersTable.fullName}), ${query}) > 0
      OR strpos(lower(coalesce(${usersTable.username}, '')), ${query}) > 0
      OR strpos(lower(coalesce(${usersTable.department}, '')), ${query}) > 0)`,
  )).orderBy(usersTable.fullName).limit(8);

  res.json(SearchStudentsResponse.parse({ students: matches.map(({ role, ...student }) => ({
    ...student,
    verificationStatus: publicVerificationStatus(student.verificationStatus, role),
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
    const roleKeepsVerification = user.role === "ceo" || user.role === "admin";
    const status = roleKeepsVerification
      ? "Premium_Approved"
      : PENDING_VERIFICATION_STATUSES.includes(user.verificationStatus as typeof PENDING_VERIFICATION_STATUSES[number])
        ? user.verificationStatus
        : "none";
    const [updated] = await db
      .update(usersTable)
      .set({
        verificationStatus: status,
        premiumBadgeDiscountPercent: 0,
        promoExpiresAt: null,
        hustlePromoExpiresAt: null,
      })
      .where(eq(usersTable.clerkUserId, user.clerkUserId))
      .returning();
    return updated ?? {
      ...user,
      verificationStatus: status,
      premiumBadgeDiscountPercent: 0,
      promoExpiresAt: null,
      hustlePromoExpiresAt: null,
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

  // Sync email from Clerk if DB email is missing/stale — enables CEO auto-detect
  if (!user.email) {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      const clerkEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress?.trim().toLowerCase() ?? "";
      if (clerkEmail) {
        await db.update(usersTable).set({ email: clerkEmail }).where(eq(usersTable.clerkUserId, userId));
        user = { ...user, email: clerkEmail };
      }
    } catch { /* non-fatal */ }
  }

  if (user.email.trim().toLowerCase() === CEO_EMAIL && user.role !== "ceo") {
    await db.update(usersTable).set({
      role: "ceo",
      isAdmin: true,
      verificationStatus: "Premium_Approved",
    }).where(eq(usersTable.clerkUserId, userId));
    user = { ...user, role: "ceo", isAdmin: true, verificationStatus: "Premium_Approved" };
  } else if (
    (user.role === "ceo" || user.role === "admin") &&
    user.verificationStatus !== "Premium_Approved"
  ) {
    await db.update(usersTable).set({ verificationStatus: "Premium_Approved" }).where(eq(usersTable.clerkUserId, userId));
    user = { ...user, verificationStatus: "Premium_Approved" };
  }

  // Lazy expiry: strip promo badge if 30-day window has closed
  user = await expirePromoIfNeeded(user);

  const postCount = await getPostCount(userId);
  const campusTitle = computeCampusTitle(user.role, postCount);

  res.json(GetMyProfileResponse.parse({
    ...user, manualLevel: user.level, level: getEffectiveLevel(user.level, user.matricNumber), campusTitle,
  }));
});

router.put("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const profileData = { ...parsed.data };
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
        res.status(409).json({ error: "This username is already taken." });
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
  if (existing.length === 0) {
    // ── New registration ─────────────────────────────────────────
    const data = parsed.data as any;
    if (!data.fullName || data.level === undefined || !data.faculty || !data.enrollmentStatus || !data.matricNumber) {
      res.status(400).json({ error: "Missing required profile fields" });
      return;
    }
    if (data.level === "" && decodeMatricEntryYear(data.matricNumber) === null) {
      res.status(400).json({ error: "Automatic level needs a matric number beginning with a valid two-digit entry year." });
      return;
    }

    let emailVal: string = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!emailVal) {
      try {
        const clerkUser = await clerkClient.users.getUser(userId);
        emailVal = clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        )?.emailAddress?.trim().toLowerCase() ?? "";
      } catch {
        // Email is still protected by the database when available; Clerk lookup is best-effort.
      }
    }
    const matricVal: string = data.matricNumber;

    // ── Unique constraint: Matriculation Number ──────────────────
    const [matricConflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.matricNumber, matricVal))
      .limit(1);
    if (matricConflict) {
      res.status(409).json({ error: "This Matriculation Number is already registered to another account. Each student may only create one CampusX account." });
      return;
    }

    // ── Unique constraint: Email (skip empty string) ─────────────
    if (emailVal) {
      const [emailConflict] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${emailVal}`)
        .limit(1);
      if (emailConflict) {
        res.status(409).json({ error: "This email address is already registered to another account." });
        return;
      }
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
          school: data.school || "Lagos State University (LASU)",
          campusLocation: data.campusLocation || "Ojo",
          level: data.level,
          faculty: data.faculty,
          enrollmentStatus: data.enrollmentStatus,
          matricNumber: matricVal,
          campus: data.campus || "LASU Ojo",
          bio: data.bio ?? null,
          avatarUrl: data.avatarUrl ?? null,
          role: roleVal,
          isAdmin: isAdminVal,
          verificationStatus: isAdminVal ? "Premium_Approved" : "none",
        })
        .returning();
    } catch (err: any) {
      // Catch any DB-level unique violations that slipped the pre-checks (race condition)
      if (err?.code === "23505") {
        const constraint = err?.constraint ?? "";
        if (constraint.includes("matric")) {
          res.status(409).json({ error: "This Matriculation Number is already registered to another account." });
        } else if (constraint.includes("email")) {
          res.status(409).json({ error: "This email address is already registered to another account." });
        } else if (constraint.includes("username")) {
          res.status(409).json({ error: "This username is already taken." });
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
          verificationStatus: isPrivilegedRole(user.role) ? "Premium_Approved" : "approved",
          premiumBadgeDiscountPercent: 100,
          promoExpiresAt,
          hustlePromoExpiresAt: promoExpiresAt,
        })
        .where(eq(usersTable.clerkUserId, userId))
        .returning();
    }
  } else {
    // ── Profile update (existing user) ─────────────────────────────
    const nextLevel = parsed.data.level ?? existing[0].level;
    const nextMatric = parsed.data.matricNumber ?? existing[0].matricNumber;
    if (nextLevel === "" && decodeMatricEntryYear(nextMatric) === null) {
      res.status(400).json({ error: "Automatic level needs a matric number beginning with a valid two-digit entry year." });
      return;
    }
    // If user is trying to change their matric number, check uniqueness
    if (parsed.data.matricNumber && parsed.data.matricNumber !== existing[0].matricNumber) {
      const [conflict] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(
          eq(usersTable.matricNumber, parsed.data.matricNumber),
          // exclude this user
          sql`${usersTable.clerkUserId} != ${userId}`
        ))
        .limit(1);
      if (conflict) {
        res.status(409).json({ error: "This Matriculation Number is already registered to another account." });
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
      if (error?.code === "23505" && error?.constraint?.includes("username")) {
        res.status(409).json({ error: "This username is already taken." });
        return;
      }
      throw error;
    }

    if (user.email.trim().toLowerCase() === CEO_EMAIL && user.role !== "ceo") {
      [user] = await db
        .update(usersTable)
        .set({ role: "ceo", isAdmin: true, verificationStatus: "Premium_Approved" })
        .where(eq(usersTable.clerkUserId, userId))
        .returning();
    }

    if (isPrivilegedRole(user.role) && user.verificationStatus !== "Premium_Approved") {
      [user] = await db.update(usersTable)
        .set({ verificationStatus: "Premium_Approved" })
        .where(eq(usersTable.clerkUserId, userId)).returning();
    }
    // Lazy expiry check on update too
    user = await expirePromoIfNeeded(user);
  }

  const postCount = await getPostCount(userId);
  const campusTitle = computeCampusTitle(user.role, postCount);

  res.json(UpdateMyProfileResponse.parse({
    ...user, manualLevel: user.level, level: getEffectiveLevel(user.level, user.matricNumber), campusTitle,
  }));
});

router.post("/users/me/request-badge", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { badgeType } = req.body;

  if (!badgeType || !["promo", "paid"].includes(badgeType)) {
    res.status(400).json({ error: "Invalid badgeType. Must be 'promo' or 'paid'" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  if (!user) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  if (isPrivilegedRole(user.role)) {
    const verificationStatus = "Premium_Approved";
    if (user.verificationStatus !== verificationStatus) {
      await db.update(usersTable).set({ verificationStatus }).where(eq(usersTable.clerkUserId, userId));
    }
    res.json({ success: true, verificationStatus });
    return;
  }
  if (user.promoExpiresAt && user.promoExpiresAt < new Date()) {
    await db
      .update(usersTable)
      .set({
        verificationStatus: "none",
        premiumBadgeDiscountPercent: 0,
        promoExpiresAt: null,
        hustlePromoExpiresAt: null,
      })
      .where(eq(usersTable.clerkUserId, userId));
  }

  if (badgeType === "promo") {
    const promoActive = !!user.promoExpiresAt && user.promoExpiresAt >= new Date() && user.premiumBadgeDiscountPercent === 100;
    if (!promoActive) {
      res.status(402).json({ error: "The free early-bird promotion is unavailable. Please use a standard paid verification tier." });
      return;
    }
  }

  const verificationStatus = badgeType === "paid" ? "pending_paid" : "approved";

  await db
    .update(usersTable)
    .set({ verificationStatus })
    .where(eq(usersTable.clerkUserId, userId));

  res.json({ success: true, verificationStatus });
});

router.get("/users/:userId/posts", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = GetUserPostsParams.safeParse({ userId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const clerkUserId = getAuth(req).userId ?? undefined;
  const { userId } = params.data;
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
      videoUrl: postsTable.videoUrl,
      likesCount: postsTable.likesCount,
      noCapsCount: postsTable.noCapsCount,
      reshareCount: postsTable.reshareCount,
      originalPostId: postsTable.originalPostId,
      isPinnedToProfile: postsTable.isPinnedToProfile,
      isPinnedToFeed: postsTable.isPinnedToFeed,
      createdAt: postsTable.createdAt,
      authorName: usersTable.fullName,
      authorFaculty: usersTable.faculty,
      authorLevel: usersTable.level,
      authorMatricNumber: usersTable.matricNumber,
      authorCampusLocation: usersTable.campusLocation,
      authorAvatarUrl: usersTable.avatarUrl,
      authorRole: usersTable.role,
      authorVerificationStatus: usersTable.verificationStatus,
      opId: opAlias.id,
      opAuthorId: opAlias.authorId,
      opContent: opAlias.content,
      opImageUrl: opAlias.imageUrl,
      opCreatedAt: opAlias.createdAt,
      opAuthorName: ouAlias.fullName,
      opAuthorAvatarUrl: ouAlias.avatarUrl,
      opAuthorVerificationStatus: ouAlias.verificationStatus,
      opAuthorRole: ouAlias.role,
      opIsAnonymous: opAlias.isAnonymous,
    })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .leftJoin(opAlias, eq(postsTable.originalPostId, opAlias.id))
    .leftJoin(ouAlias, eq(opAlias.authorId, ouAlias.clerkUserId))
    .where(and(eq(postsTable.authorId, userId), eq(postsTable.isAnonymous, false)))
    .orderBy(desc(postsTable.isPinnedToProfile), desc(postsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(and(eq(postsTable.authorId, userId), eq(postsTable.isAnonymous, false)));

  const postsWithReactions = await Promise.all(
    posts.map(async (post) => {
      let isLikedByMe = false;
      let isNoCapByMe = false;
      if (clerkUserId) {
        const [likes, nocaps] = await Promise.all([
          db.select().from(postLikesTable).where(and(eq(postLikesTable.postId, post.id), eq(postLikesTable.userId, clerkUserId))),
          db.select().from(postNoCapsTable).where(and(eq(postNoCapsTable.postId, post.id), eq(postNoCapsTable.userId, clerkUserId))),
        ]);
        isLikedByMe = likes.length > 0;
        isNoCapByMe = nocaps.length > 0;
      }
      const [{ commentsCount }] = await db
        .select({ commentsCount: sql<number>`count(*)::int` })
        .from(postCommentsTable)
        .where(eq(postCommentsTable.postId, post.id));

      const role = post.authorRole ?? "student";
      const postCount = await getPostCount(post.authorId);
      const campusTitle = computeCampusTitle(role, postCount);
      const {
        authorMatricNumber,
        opId, opAuthorId, opContent, opImageUrl, opCreatedAt,
        opAuthorName, opAuthorAvatarUrl, opAuthorVerificationStatus,
        opAuthorRole, opIsAnonymous,
        ...publicFields
      } = post;

      return {
        ...publicFields,
        isOwnedByMe: Boolean(clerkUserId && clerkUserId === post.authorId),
        authorName: post.authorName ?? "Unknown",
        authorFaculty: post.authorFaculty ?? "Unknown",
        authorLevel: getEffectiveLevel(post.authorLevel, authorMatricNumber),
        authorCampusLocation: post.authorCampusLocation ?? "Ojo",
        authorAvatarUrl: post.authorAvatarUrl ?? null,
        authorCampusTitle: campusTitle,
        authorRole: role,
        authorIsVerified: isVerifiedAccount(post.authorVerificationStatus, role),
        authorVerificationStatus: publicVerificationStatus(post.authorVerificationStatus, role),
        isAnonymous: post.isAnonymous ?? false,
        commentsCount: commentsCount ?? 0,
        reshareCount: post.reshareCount ?? 0,
        originalPostId: post.originalPostId ?? null,
        originalPost: post.opId != null ? publicEmbeddedPost({
          id: post.opId,
          authorId: post.opAuthorId ?? "",
          authorName: post.opAuthorName ?? "Unknown",
          authorAvatarUrl: post.opAuthorAvatarUrl ?? null,
          authorIsVerified: !post.opIsAnonymous && isVerifiedAccount(post.opAuthorVerificationStatus, post.opAuthorRole),
          authorVerificationStatus: post.opIsAnonymous ? "none" : publicVerificationStatus(post.opAuthorVerificationStatus, post.opAuthorRole),
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
  res.json(GetUserPostsResponse.parse({ posts: postsWithReactions, total: count }));
});

router.get("/users/:userId/services", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = GetUserServicesParams.safeParse({ userId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = params.data;
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const services = await db
    .select({
      id: servicesTable.id,
      providerId: servicesTable.providerId,
      title: servicesTable.title,
      description: servicesTable.description,
      category: servicesTable.category,
      price: servicesTable.price,
      contactInfo: servicesTable.contactInfo,
      isActive: servicesTable.isActive,
      createdAt: servicesTable.createdAt,
      providerName: usersTable.fullName,
      providerFaculty: usersTable.faculty,
      providerLevel: usersTable.level,
      providerMatricNumber: usersTable.matricNumber,
      providerCampusLocation: usersTable.campusLocation,
      providerAvatarUrl: usersTable.avatarUrl,
      providerVerificationStatus: usersTable.verificationStatus,
      providerRole: usersTable.role,
    })
    .from(servicesTable)
    .leftJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(and(eq(servicesTable.providerId, userId), eq(servicesTable.isActive, true)))
    .orderBy(desc(servicesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(servicesTable)
    .where(and(eq(servicesTable.providerId, userId), eq(servicesTable.isActive, true)));

  const enriched = await Promise.all(services.map(async (s) => {
    const { providerVerificationStatus, providerRole, providerMatricNumber, ...rest } = s;
    const role = providerRole ?? "student";
    const postCount = await getPostCount(s.providerId);
    return {
      ...rest,
      providerName: s.providerName ?? "Unknown",
      providerFaculty: s.providerFaculty ?? "Unknown",
      providerLevel: getEffectiveLevel(s.providerLevel, providerMatricNumber),
      providerCampusLocation: s.providerCampusLocation ?? "Ojo",
      providerAvatarUrl: s.providerAvatarUrl ?? null,
      providerIsVerified: isVerifiedAccount(providerVerificationStatus, role),
      providerVerificationStatus: publicVerificationStatus(providerVerificationStatus, role),
      providerCampusTitle: computeCampusTitle(role, postCount),
      providerRole: role,
    };
  }));

  res.json(GetUserServicesResponse.parse({ services: enriched, total: count }));
});

router.get("/users/:userId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = GetUserProfileParams.safeParse({ userId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      clerkUserId: usersTable.clerkUserId,
      fullName: usersTable.fullName,
      username: usersTable.username,
      department: usersTable.department,
      school: usersTable.school,
      campusLocation: usersTable.campusLocation,
      level: usersTable.level,
      faculty: usersTable.faculty,
      enrollmentStatus: usersTable.enrollmentStatus,
      campus: usersTable.campus,
      bio: usersTable.bio,
      avatarUrl: usersTable.avatarUrl,
      matricNumber: usersTable.matricNumber,
      role: usersTable.role,
      verificationStatus: usersTable.verificationStatus,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, params.data.userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { matricNumber, ...publicUser } = user;
  const postCount = await getPostCount(user.clerkUserId);
  const campusTitle = computeCampusTitle(user.role ?? "student", postCount);

  res.json(GetUserProfileResponse.parse({
    ...publicUser,
    level: getEffectiveLevel(user.level, matricNumber),
    verificationStatus: publicVerificationStatus(user.verificationStatus, user.role),
    isVerified: isVerifiedAccount(user.verificationStatus, user.role),
    role: user.role ?? "student",
    campusTitle,
  }));
});

export default router;
