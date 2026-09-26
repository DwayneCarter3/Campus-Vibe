import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, desc, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, postsTable, postLikesTable, postNoCapsTable, postCommentsTable, usersTable, pollsTable, pollOptionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { computeCampusTitle } from "./admin";
import { isVerifiedAccount, publicVerificationStatus } from "../lib/verification";
import { getEffectiveLevel } from "../lib/academic-level";
import { createNotification } from "../lib/notifications";
import { publicPost } from "../lib/post-privacy";
import { loadPublicPolls } from "../lib/polls";
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
  ResharePostParams,
  ResharePostBody,
  ResharePostResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const originalPostAlias = alias(postsTable, "op");
const originalUserAlias = alias(usersTable, "ou");

async function getActorName(clerkUserId: string): Promise<string> {
  const [user] = await db
    .select({ fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));
  return user?.fullName ?? "A student";
}

async function getPostCount(clerkUserId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(eq(postsTable.authorId, clerkUserId));
  return count ?? 0;
}

async function notifyPostAuthor(postId: number, actorId: string, type: string, message: string) {
  const [post] = await db
    .select({ authorId: postsTable.authorId, isAnonymous: postsTable.isAnonymous })
    .from(postsTable)
    .where(eq(postsTable.id, postId));
  if (!post || post.authorId === actorId) return;
  const actorName = await getActorName(actorId);
  await createNotification({
    userId: post.authorId,
    actorId,
    actorName,
    type,
    content: message,
    targetType: "post",
    targetId: postId,
  });
}

async function buildPostWithMeta(postId: number, clerkUserId?: string) {
  const [post] = await db
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
      opId: originalPostAlias.id,
      opAuthorId: originalPostAlias.authorId,
      opContent: originalPostAlias.content,
      opImageUrl: originalPostAlias.imageUrl,
      opCreatedAt: originalPostAlias.createdAt,
      opAuthorName: originalUserAlias.fullName,
      opAuthorAvatarUrl: originalUserAlias.avatarUrl,
      opAuthorVerificationStatus: originalUserAlias.verificationStatus,
      opAuthorRole: originalUserAlias.role,
      opIsAnonymous: originalPostAlias.isAnonymous,
    })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .leftJoin(originalPostAlias, eq(postsTable.originalPostId, originalPostAlias.id))
    .leftJoin(originalUserAlias, eq(originalPostAlias.authorId, originalUserAlias.clerkUserId))
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
  const built = {
    ...publicFields,
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
    originalPost: post.opId != null ? {
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
    } : null,
    isPinnedToProfile: post.isPinnedToProfile ?? false,
    isPinnedToFeed: post.isPinnedToFeed ?? false,
    isLikedByMe,
    isNoCapByMe,
  };

  const pollPostId = post.originalPostId ?? post.id;
  const poll = (await loadPublicPolls([pollPostId], clerkUserId)).get(pollPostId) ?? null;
  return publicPost({ ...built, poll }, clerkUserId);
}

router.get("/posts", async (req, res): Promise<void> => {
  const params = ListPostsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { limit, offset, category } = params.data;
  const clerkUserId = getAuth(req).userId ?? undefined;

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
      opId: originalPostAlias.id,
      opAuthorId: originalPostAlias.authorId,
      opContent: originalPostAlias.content,
      opImageUrl: originalPostAlias.imageUrl,
      opCreatedAt: originalPostAlias.createdAt,
      opAuthorName: originalUserAlias.fullName,
      opAuthorAvatarUrl: originalUserAlias.avatarUrl,
      opAuthorVerificationStatus: originalUserAlias.verificationStatus,
      opAuthorRole: originalUserAlias.role,
      opIsAnonymous: originalPostAlias.isAnonymous,
    })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .leftJoin(originalPostAlias, eq(postsTable.originalPostId, originalPostAlias.id))
    .leftJoin(originalUserAlias, eq(originalPostAlias.authorId, originalUserAlias.clerkUserId))
    .where(category ? eq(postsTable.category, category) : undefined)
    .orderBy(desc(postsTable.isPinnedToFeed), desc(postsTable.createdAt))
    .limit(limit ?? 20)
    .offset(offset ?? 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(category ? eq(postsTable.category, category) : undefined);

  const publicPolls = await loadPublicPolls(posts.map((post) => post.originalPostId ?? post.id), clerkUserId);
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
      const built = {
        ...publicFields,
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
        originalPost: post.opId != null ? {
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
        } : null,
        isPinnedToProfile: post.isPinnedToProfile ?? false,
        isPinnedToFeed: post.isPinnedToFeed ?? false,
        isLikedByMe,
        isNoCapByMe,
      };

      return publicPost({ ...built, poll: publicPolls.get(post.originalPostId ?? post.id) ?? null }, clerkUserId);
    })
  );

  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListPostsResponse.parse({ posts: postsWithReactions, total: count }));
});

router.post("/posts", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const pollInput = parsed.data.poll;
  const question = pollInput?.question.trim();
  const options = pollInput?.options.map((option) => option.trim());
  if (pollInput && (
    !question || !options || options.length < 2 || options.length > 4 ||
    options.some((option) => !option) ||
    new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length
  )) {
    res.status(400).json({ error: "Enter a question and 2–4 different, nonempty poll options." });
    return;
  }
  const postId = await db.transaction(async (tx) => {
    const [post] = await tx.insert(postsTable).values({
      authorId: userId,
      content: parsed.data.content,
      category: parsed.data.category ?? "Amebo Hot",
      imageUrl: parsed.data.imageUrl ?? null,
      videoUrl: parsed.data.videoUrl ?? null,
      isAnonymous: parsed.data.isAnonymous ?? false,
    }).returning({ id: postsTable.id });
    if (question && options) {
      const [poll] = await tx.insert(pollsTable).values({ postId: post.id, question }).returning({ id: pollsTable.id });
      await tx.insert(pollOptionsTable).values(options.map((option) => ({ pollId: poll.id, optionText: option })));
    }
    return post.id;
  });

  const result = await buildPostWithMeta(postId, userId);
  res.status(201).json(GetPostResponse.parse(result));
});

router.get("/posts/:postId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = GetPostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const clerkUserId = getAuth(req).userId ?? undefined;
  const result = await buildPostWithMeta(params.data.postId, clerkUserId);
  if (!result) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");
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

  const [caller] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  const isOwner = post.authorId === userId;
  const isModerator = ["moderator", "admin", "ceo"].includes(caller?.role ?? "");

  if (!isOwner && !isModerator) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(postsTable).where(eq(postsTable.id, params.data.postId));
  res.sendStatus(204);
});

router.post("/posts/:postId/reshare", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = ResharePostParams.safeParse({ postId: raw });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = ResharePostBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { postId } = params.data;
  const quoteText = body.data.quoteText?.trim() ?? "";

  const [original] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (!original) { res.status(404).json({ error: "Post not found" }); return; }

  const rootPostId = original.originalPostId ?? original.id;
  const [root] = original.originalPostId
    ? await db.select().from(postsTable).where(eq(postsTable.id, rootPostId))
    : [original];
  if (!root) { res.status(404).json({ error: "Original post not found" }); return; }
  if (root.isAnonymous && root.authorId === userId) {
    res.status(403).json({ error: "You cannot reshare your own anonymous post." });
    return;
  }

  await db.insert(postsTable).values({
    authorId: userId,
    content: quoteText,
    category: original.category,
    imageUrl: null,
    videoUrl: null,
    originalPostId: rootPostId,
    isAnonymous: false,
  });

  const [updated] = await db
    .update(postsTable)
    .set({ reshareCount: sql`${postsTable.reshareCount} + 1` })
    .where(eq(postsTable.id, rootPostId))
    .returning({ reshareCount: postsTable.reshareCount });

  res.json(ResharePostResponse.parse({ reshared: true, reshareCount: updated?.reshareCount ?? 0 }));
});

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

router.patch("/posts/:postId/pin-feed", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = PinPostToFeedParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [caller] = await db.select({ role: usersTable.role, isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.clerkUserId, userId));
  const hasPermission = caller?.isAdmin || ["admin", "ceo"].includes(caller?.role ?? "");
  if (!hasPermission) { res.status(403).json({ error: "Admin only" }); return; }

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
    notifyPostAuthor(postId, userId, "like", "Someone gassed up your post! 🔥").catch((error) => {
      req.log.error({ err: error, postId, userId }, "Failed to create like notification");
    });
  }

  const [updated] = await db.select({ likesCount: postsTable.likesCount }).from(postsTable).where(eq(postsTable.id, postId));
  res.json(LikePostResponse.parse({ liked, likesCount: updated?.likesCount ?? 0 }));
});

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
    notifyPostAuthor(postId, userId, "nocap", "Someone said No Cap to your post! 🧢").catch((error) => {
      req.log.error({ err: error, postId, userId }, "Failed to create No Cap notification");
    });
  }

  const [updated] = await db.select({ noCapsCount: postsTable.noCapsCount }).from(postsTable).where(eq(postsTable.id, postId));
  res.json(NoCapPostResponse.parse({ noCaped, noCapsCount: updated?.noCapsCount ?? 0 }));
});

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
      authorMatricNumber: usersTable.matricNumber,
      authorVerificationStatus: usersTable.verificationStatus,
      authorRole: usersTable.role,
    })
    .from(postCommentsTable)
    .leftJoin(usersTable, eq(postCommentsTable.authorId, usersTable.clerkUserId))
    .where(eq(postCommentsTable.postId, params.data.postId))
    .orderBy(postCommentsTable.createdAt);

  const mapped = comments.map(({ authorMatricNumber, ...c }) => ({
    ...c,
    authorName: c.authorName ?? "Unknown",
    authorLevel: getEffectiveLevel(c.authorLevel, authorMatricNumber),
    authorIsVerified: isVerifiedAccount(c.authorVerificationStatus, c.authorRole),
    authorVerificationStatus: publicVerificationStatus(c.authorVerificationStatus, c.authorRole),
  }));

  res.json(ListPostCommentsResponse.parse({ comments: mapped, total: mapped.length }));
});

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

  const [post] = await db
    .select({ id: postsTable.id, authorId: postsTable.authorId })
    .from(postsTable)
    .where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const [inserted] = await db
    .insert(postCommentsTable)
    .values({ postId: params.data.postId, authorId: userId, content: body.data.content })
    .returning();

  const [author] = await db
    .select({
      fullName: usersTable.fullName,
      level: usersTable.level,
      matricNumber: usersTable.matricNumber,
      role: usersTable.role,
      verificationStatus: usersTable.verificationStatus,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  if (post.authorId !== userId) {
    await createNotification({
      userId: post.authorId,
      actorId: userId,
      actorName: author?.fullName ?? "A student",
      type: "comment",
      content: "Someone commented on your post.",
      targetType: "post",
      targetId: params.data.postId,
    }).catch((error) => {
      req.log.error({ err: error, postId: params.data.postId, userId }, "Failed to create comment notification");
    });
  }

  res.status(201).json({
    id: inserted.id,
    postId: inserted.postId,
    authorId: inserted.authorId,
    content: inserted.content,
    createdAt: inserted.createdAt,
    authorName: author?.fullName ?? "Unknown",
    authorLevel: getEffectiveLevel(author?.level, author?.matricNumber),
    authorIsVerified: isVerifiedAccount(author?.verificationStatus, author?.role),
    authorVerificationStatus: publicVerificationStatus(author?.verificationStatus, author?.role),
  });
});

export default router;
