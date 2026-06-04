import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, postsTable, postLikesTable, postNoCapsTable, postCommentsTable, usersTable, notificationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { broadcastNotification } from "../sse-manager";
import {
  ListPostsQueryParams,
  ListPostsResponse,
  CreatePostBody,
  GetPostParams,
  GetPostResponse,
  DeletePostParams,
  LikePostParams,
  LikePostResponse,
  NoCapPostParams,
  NoCapPostResponse,
  ListPostCommentsParams,
  ListPostCommentsResponse,
  CreatePostCommentBody,
  CreatePostCommentParams,
  PinPostToProfileParams,
  PinPostToProfileResponse,
  PinPostToFeedParams,
  PinPostToFeedResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getActorName(clerkUserId: string): Promise<string> {
  const [user] = await db
    .select({ fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));
  return user?.fullName ?? "A student";
}

async function notifyPostAuthor(postId: number, actorId: string, type: string, message: string) {
  const [post] = await db
    .select({ authorId: postsTable.authorId })
    .from(postsTable)
    .where(eq(postsTable.id, postId));
  if (!post || post.authorId === actorId) return;
  const actorName = await getActorName(actorId);
  const [notification] = await db
    .insert(notificationsTable)
    .values({ userId: post.authorId, type, actorName, message })
    .returning();
  broadcastNotification(post.authorId, notification);
}

async function buildPostWithMeta(postId: number, clerkUserId?: string) {
  const [post] = await db
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
    .where(eq(postsTable.id, postId));

  if (!post) return null;

  const [{ commentsCount }] = await db
    .select({ commentsCount: sql<number>`count(*)::int` })
    .from(postCommentsTable)
    .where(eq(postCommentsTable.postId, postId));

  let isLikedByMe = false;
  let isNoCapByMe = false;
  if (clerkUserId) {
    const [like, nocap] = await Promise.all([
      db.select().from(postLikesTable).where(and(eq(postLikesTable.postId, postId), eq(postLikesTable.userId, clerkUserId))),
      db.select().from(postNoCapsTable).where(and(eq(postNoCapsTable.postId, postId), eq(postNoCapsTable.userId, clerkUserId))),
    ]);
    isLikedByMe = like.length > 0;
    isNoCapByMe = nocap.length > 0;
  }

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
}

router.get("/posts", async (req, res): Promise<void> => {
  const params = ListPostsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { limit, offset } = params.data;
  const clerkUserId = (req as any).userId as string | undefined;

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
    .orderBy(desc(postsTable.isPinnedToFeed), desc(postsTable.createdAt))
    .limit(limit ?? 20)
    .offset(offset ?? 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable);

  const postsWithReactions = await Promise.all(
    posts.map(async (post) => {
      let isLikedByMe = false;
      let isNoCapByMe = false;
      const [{ commentsCount }] = await db
        .select({ commentsCount: sql<number>`count(*)::int` })
        .from(postCommentsTable)
        .where(eq(postCommentsTable.postId, post.id));
      if (clerkUserId) {
        const [likes, nocaps] = await Promise.all([
          db.select().from(postLikesTable).where(and(eq(postLikesTable.postId, post.id), eq(postLikesTable.userId, clerkUserId))),
          db.select().from(postNoCapsTable).where(and(eq(postNoCapsTable.postId, post.id), eq(postNoCapsTable.userId, clerkUserId))),
        ]);
        isLikedByMe = likes.length > 0;
        isNoCapByMe = nocaps.length > 0;
      }
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

  res.json(ListPostsResponse.parse({ posts: postsWithReactions, total: count }));
});

router.post("/posts", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db
    .insert(postsTable)
    .values({ authorId: userId, content: parsed.data.content, imageUrl: parsed.data.imageUrl ?? null, videoUrl: parsed.data.videoUrl ?? null })
    .returning();

  const result = await buildPostWithMeta(post.id, userId);
  res.status(201).json(GetPostResponse.parse(result));
});

router.get("/posts/:postId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = GetPostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const clerkUserId = (req as any).userId as string | undefined;
  const result = await buildPostWithMeta(params.data.postId, clerkUserId);
  if (!result) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(GetPostResponse.parse(result));
});

router.delete("/posts/:postId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = DeletePostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (post.authorId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(postsTable).where(eq(postsTable.id, params.data.postId));
  res.sendStatus(204);
});

// 📌 Pin to profile (author only)
router.patch("/posts/:postId/pin-profile", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = PinPostToProfileParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const postId = params.data.postId;
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.authorId !== userId) { res.status(403).json({ error: "Not the author" }); return; }

  const willPin = !post.isPinnedToProfile;
  if (willPin) {
    await db.update(postsTable).set({ isPinnedToProfile: false }).where(eq(postsTable.authorId, userId));
  }
  await db.update(postsTable).set({ isPinnedToProfile: willPin }).where(eq(postsTable.id, postId));
  res.json(PinPostToProfileResponse.parse({ pinned: willPin }));
});

// 📌 Pin to feed (admin only)
router.patch("/posts/:postId/pin-feed", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = PinPostToFeedParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [caller] = await db.select({ isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.clerkUserId, userId));
  if (!caller?.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }

  const postId = params.data.postId;
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const willPin = !post.isPinnedToFeed;
  if (willPin) {
    await db.update(postsTable).set({ isPinnedToFeed: false });
  }
  await db.update(postsTable).set({ isPinnedToFeed: willPin }).where(eq(postsTable.id, postId));
  res.json(PinPostToFeedResponse.parse({ pinned: willPin }));
});

// 🔥 Fire reaction (existing like)
router.post("/posts/:postId/like", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = LikePostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const postId = params.data.postId;
  const existing = await db
    .select()
    .from(postLikesTable)
    .where(and(eq(postLikesTable.postId, postId), eq(postLikesTable.userId, userId)));

  let liked: boolean;
  if (existing.length > 0) {
    await db.delete(postLikesTable).where(eq(postLikesTable.id, existing[0].id));
    await db.update(postsTable).set({ likesCount: sql`greatest(${postsTable.likesCount} - 1, 0)` }).where(eq(postsTable.id, postId));
    liked = false;
  } else {
    await db.insert(postLikesTable).values({ postId, userId });
    await db.update(postsTable).set({ likesCount: sql`${postsTable.likesCount} + 1` }).where(eq(postsTable.id, postId));
    liked = true;
    notifyPostAuthor(postId, userId, "fire", "Someone gassed up your post! 🔥").catch(() => {});
  }

  const [updated] = await db.select({ likesCount: postsTable.likesCount }).from(postsTable).where(eq(postsTable.id, postId));
  res.json(LikePostResponse.parse({ liked, likesCount: updated?.likesCount ?? 0 }));
});

// 🧢 No Cap reaction
router.post("/posts/:postId/nocap", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = NoCapPostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const postId = params.data.postId;
  const existing = await db
    .select()
    .from(postNoCapsTable)
    .where(and(eq(postNoCapsTable.postId, postId), eq(postNoCapsTable.userId, userId)));

  let noCaped: boolean;
  if (existing.length > 0) {
    await db.delete(postNoCapsTable).where(eq(postNoCapsTable.id, existing[0].id));
    await db.update(postsTable).set({ noCapsCount: sql`greatest(${postsTable.noCapsCount} - 1, 0)` }).where(eq(postsTable.id, postId));
    noCaped = false;
  } else {
    await db.insert(postNoCapsTable).values({ postId, userId });
    await db.update(postsTable).set({ noCapsCount: sql`${postsTable.noCapsCount} + 1` }).where(eq(postsTable.id, postId));
    noCaped = true;
    notifyPostAuthor(postId, userId, "nocap", "Someone said No Cap to your post! 🧢").catch(() => {});
  }

  const [updated] = await db.select({ noCapsCount: postsTable.noCapsCount }).from(postsTable).where(eq(postsTable.id, postId));
  res.json(NoCapPostResponse.parse({ noCaped, noCapsCount: updated?.noCapsCount ?? 0 }));
});

// 💬 List comments
router.get("/posts/:postId/comments", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = ListPostCommentsParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const comments = await db
    .select({
      id: postCommentsTable.id,
      postId: postCommentsTable.postId,
      authorId: postCommentsTable.authorId,
      content: postCommentsTable.content,
      createdAt: postCommentsTable.createdAt,
      authorName: usersTable.fullName,
      authorLevel: usersTable.level,
    })
    .from(postCommentsTable)
    .leftJoin(usersTable, eq(postCommentsTable.authorId, usersTable.clerkUserId))
    .where(eq(postCommentsTable.postId, params.data.postId))
    .orderBy(postCommentsTable.createdAt);

  const mapped = comments.map((c) => ({
    ...c,
    authorName: c.authorName ?? "Unknown",
    authorLevel: c.authorLevel ?? "Unknown",
  }));

  res.json(ListPostCommentsResponse.parse({ comments: mapped, total: mapped.length }));
});

// 💬 Create comment
router.post("/posts/:postId/comments", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = CreatePostCommentParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = CreatePostCommentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [post] = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const [inserted] = await db
    .insert(postCommentsTable)
    .values({ postId: params.data.postId, authorId: userId, content: body.data.content })
    .returning();

  const [author] = await db
    .select({ fullName: usersTable.fullName, level: usersTable.level })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  res.status(201).json({
    id: inserted.id,
    postId: inserted.postId,
    authorId: inserted.authorId,
    content: inserted.content,
    createdAt: inserted.createdAt,
    authorName: author?.fullName ?? "Unknown",
    authorLevel: author?.level ?? "Unknown",
  });
});

export default router;
