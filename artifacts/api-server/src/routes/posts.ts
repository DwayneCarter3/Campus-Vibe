import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, postsTable, postLikesTable, postNoCapsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

async function buildPostWithMeta(postId: number, clerkUserId?: string) {
  const [post] = await db
    .select({
      id: postsTable.id,
      authorId: postsTable.authorId,
      content: postsTable.content,
      imageUrl: postsTable.imageUrl,
      likesCount: postsTable.likesCount,
      noCapsCount: postsTable.noCapsCount,
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
      likesCount: postsTable.likesCount,
      noCapsCount: postsTable.noCapsCount,
      createdAt: postsTable.createdAt,
      authorName: usersTable.fullName,
      authorFaculty: usersTable.faculty,
      authorLevel: usersTable.level,
      authorCampusLocation: usersTable.campusLocation,
      authorAvatarUrl: usersTable.avatarUrl,
    })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .orderBy(desc(postsTable.createdAt))
    .limit(limit ?? 20)
    .offset(offset ?? 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable);

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
      return {
        ...post,
        authorName: post.authorName ?? "Unknown",
        authorFaculty: post.authorFaculty ?? "Unknown",
        authorLevel: post.authorLevel ?? "Unknown",
        authorCampusLocation: post.authorCampusLocation ?? "Ojo",
        authorAvatarUrl: post.authorAvatarUrl ?? null,
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
    .values({ authorId: userId, content: parsed.data.content, imageUrl: parsed.data.imageUrl ?? null })
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
  }

  const [updated] = await db.select({ noCapsCount: postsTable.noCapsCount }).from(postsTable).where(eq(postsTable.id, postId));
  res.json(NoCapPostResponse.parse({ noCaped, noCapsCount: updated?.noCapsCount ?? 0 }));
});

export default router;
