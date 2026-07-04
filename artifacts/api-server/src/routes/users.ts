import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, usersTable, postsTable, postLikesTable, postNoCapsTable, postCommentsTable, servicesTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { CEO_EMAIL, computeCampusTitle } from "./admin";

const opAlias = alias(postsTable, "op");
const ouAlias = alias(usersTable, "ou");

const router: IRouter = Router();

async function getPostCount(clerkUserId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(eq(postsTable.authorId, clerkUserId));
  return count ?? 0;
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

  if (user.email === CEO_EMAIL && user.role !== "ceo") {
    await db.update(usersTable).set({ role: "ceo", isAdmin: true }).where(eq(usersTable.clerkUserId, userId));
    user = { ...user, role: "ceo", isAdmin: true };
  }

  const postCount = await getPostCount(userId);
  const campusTitle = computeCampusTitle(user.role, postCount);

  res.json(GetMyProfileResponse.parse({ ...user, campusTitle }));
});

router.put("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  let user;
  if (existing.length === 0) {
    const data = parsed.data as any;
    if (!data.fullName || !data.level || !data.faculty || !data.enrollmentStatus || !data.matricNumber) {
      res.status(400).json({ error: "Missing required profile fields" });
      return;
    }
    const emailVal = data.email || "";
    const roleVal = emailVal === CEO_EMAIL ? "ceo" : "student";
    const isAdminVal = roleVal === "ceo";
    [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: userId,
        fullName: data.fullName,
        email: emailVal,
        school: data.school || "Lagos State University (LASU)",
        campusLocation: data.campusLocation || "Ojo",
        level: data.level,
        faculty: data.faculty,
        enrollmentStatus: data.enrollmentStatus,
        matricNumber: data.matricNumber,
        campus: data.campus || "LASU Ojo",
        bio: data.bio ?? null,
        avatarUrl: data.avatarUrl ?? null,
        role: roleVal,
        isAdmin: isAdminVal,
      })
      .returning();
  } else {
    [user] = await db
      .update(usersTable)
      .set(parsed.data)
      .where(eq(usersTable.clerkUserId, userId))
      .returning();

    if (user.email === CEO_EMAIL && user.role !== "ceo") {
      [user] = await db
        .update(usersTable)
        .set({ role: "ceo", isAdmin: true })
        .where(eq(usersTable.clerkUserId, userId))
        .returning();
    }
  }

  const postCount = await getPostCount(userId);
  const campusTitle = computeCampusTitle(user.role, postCount);

  res.json(UpdateMyProfileResponse.parse({ ...user, campusTitle }));
});

router.post("/users/me/request-badge", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const { badgeType } = req.body;

  if (!badgeType || !["promo", "paid"].includes(badgeType)) {
    res.status(400).json({ error: "Invalid badgeType. Must be 'promo' or 'paid'" });
    return;
  }

  const verificationStatus = badgeType === "paid" ? "pending_paid" : "pending_promo";

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

  const clerkUserId = (req as any).userId as string | undefined;
  const { userId } = params.data;
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const posts = await db
    .select({
      id: postsTable.id,
      authorId: postsTable.authorId,
      isAnonymous: postsTable.isAnonymous,
      content: postsTable.content,
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
      authorCampusLocation: usersTable.campusLocation,
      authorAvatarUrl: usersTable.avatarUrl,
      authorRole: usersTable.role,
      opId: opAlias.id,
      opAuthorId: opAlias.authorId,
      opContent: opAlias.content,
      opImageUrl: opAlias.imageUrl,
      opCreatedAt: opAlias.createdAt,
      opAuthorName: ouAlias.fullName,
      opAuthorAvatarUrl: ouAlias.avatarUrl,
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

      return {
        ...post,
        authorName: post.authorName ?? "Unknown",
        authorFaculty: post.authorFaculty ?? "Unknown",
        authorLevel: post.authorLevel ?? "Unknown",
        authorCampusLocation: post.authorCampusLocation ?? "Ojo",
        authorAvatarUrl: post.authorAvatarUrl ?? null,
        authorCampusTitle: campusTitle,
        authorRole: role,
        isAnonymous: post.isAnonymous ?? false,
        commentsCount: commentsCount ?? 0,
        reshareCount: post.reshareCount ?? 0,
        originalPostId: post.originalPostId ?? null,
        originalPost: post.opId != null ? {
          id: post.opId,
          authorId: post.opAuthorId ?? "",
          authorName: post.opAuthorName ?? "Unknown",
          authorAvatarUrl: post.opAuthorAvatarUrl ?? null,
          content: post.opContent ?? "",
          imageUrl: post.opImageUrl ?? null,
          createdAt: (post.opCreatedAt ?? new Date()).toISOString(),
        } : null,
        isPinnedToProfile: post.isPinnedToProfile ?? false,
        isPinnedToFeed: post.isPinnedToFeed ?? false,
        isLikedByMe,
        isNoCapByMe,
      };
    })
  );

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
      providerCampusLocation: usersTable.campusLocation,
      providerAvatarUrl: usersTable.avatarUrl,
      providerMatricNumber: usersTable.matricNumber,
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
    const { providerMatricNumber, providerRole, ...rest } = s;
    const role = providerRole ?? "student";
    const postCount = await getPostCount(s.providerId);
    return {
      ...rest,
      providerName: s.providerName ?? "Unknown",
      providerFaculty: s.providerFaculty ?? "Unknown",
      providerLevel: s.providerLevel ?? "Unknown",
      providerCampusLocation: s.providerCampusLocation ?? "Ojo",
      providerAvatarUrl: s.providerAvatarUrl ?? null,
      providerIsVerified: !!(providerMatricNumber && providerMatricNumber.trim()),
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
    isVerified: !!(matricNumber && matricNumber.trim()),
    role: user.role ?? "student",
    campusTitle,
    verificationStatus: user.verificationStatus ?? "none",
  }));
});

export default router;
