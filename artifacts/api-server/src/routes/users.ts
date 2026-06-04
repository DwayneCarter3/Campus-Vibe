import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
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

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  if (!user) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(GetMyProfileResponse.parse(user));
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
    [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: userId,
        fullName: data.fullName,
        email: data.email || "",
        school: data.school || "Lagos State University (LASU)",
        campusLocation: data.campusLocation || "Ojo",
        level: data.level,
        faculty: data.faculty,
        enrollmentStatus: data.enrollmentStatus,
        matricNumber: data.matricNumber,
        campus: data.campus || "LASU Ojo",
        bio: data.bio ?? null,
        avatarUrl: data.avatarUrl ?? null,
      })
      .returning();
  } else {
    [user] = await db
      .update(usersTable)
      .set(parsed.data)
      .where(eq(usersTable.clerkUserId, userId))
      .returning();
  }

  res.json(UpdateMyProfileResponse.parse(user));
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
      content: postsTable.content,
      imageUrl: postsTable.imageUrl,
      videoUrl: postsTable.videoUrl,
      likesCount: postsTable.likesCount,
      noCapsCount: postsTable.noCapsCount,
      isPinnedToProfile: postsTable.isPinnedToProfile,
      isPinnedToFeed: postsTable.isPinnedToFeed,
      createdAt: postsTable.createdAt,
      authorName: usersTable.fullName,
      authorFaculty: usersTable.faculty,
      authorLevel: usersTable.level,
      authorCampusLocation: usersTable.campusLocation,
      authorAvatarUrl: usersTable.avatarUrl,
    })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .where(eq(postsTable.authorId, userId))
    .orderBy(desc(postsTable.isPinnedToProfile), desc(postsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(eq(postsTable.authorId, userId));

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

      return {
        ...post,
        authorName: post.authorName ?? "Unknown",
        authorFaculty: post.authorFaculty ?? "Unknown",
        authorLevel: post.authorLevel ?? "Unknown",
        authorCampusLocation: post.authorCampusLocation ?? "Ojo",
        authorAvatarUrl: post.authorAvatarUrl ?? null,
        commentsCount: commentsCount ?? 0,
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

  const enriched = services.map((s) => {
    const { providerMatricNumber, ...rest } = s;
    return {
      ...rest,
      providerName: s.providerName ?? "Unknown",
      providerFaculty: s.providerFaculty ?? "Unknown",
      providerLevel: s.providerLevel ?? "Unknown",
      providerCampusLocation: s.providerCampusLocation ?? "Ojo",
      providerAvatarUrl: s.providerAvatarUrl ?? null,
      providerIsVerified: !!(providerMatricNumber && providerMatricNumber.trim()),
    };
  });

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
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, params.data.userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { matricNumber, ...publicUser } = user;

  res.json(GetUserProfileResponse.parse({
    ...publicUser,
    isVerified: !!(matricNumber && matricNumber.trim()),
  }));
});

export default router;
