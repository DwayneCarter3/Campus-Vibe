import { Router } from "express";
import { eq, desc, and, ne, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getAuth } from "@clerk/express";
import * as dbModule from "@workspace/db";
import * as apiZodModule from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { publicEmbeddedPost } from "../lib/post-privacy.js";
import { loadPublicPolls } from "../lib/polls.js";
import { computeCampusTitle } from "./admin.js";
import { CEO_EMAIL, hasAdminPrivileges } from "../lib/privilege.js";
import {
  isVerifiedAccount,
  publicDisplayRole,
  publicVerificationStatus,
} from "../lib/verification.js";
import { getEffectiveLevel } from "../lib/academic-level.js";
import {
  campusScopeCondition,
  canonicalInstitutionId,
  profilesShareCampus,
  profilesShareSchool,
  schoolScopeCondition,
} from "./list-scope.js";

const {
  db,
  postsTable,
  postLikesTable,
  postNoCapsTable,
  postCommentsTable,
  usersTable,
  savedPostsTable,
  reportsTable,
  uploadedMediaTable,
} = dbModule as any;

const apiZod = apiZodModule as any;
const getSchema = (name: string) =>
  apiZod[name] || {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

const ListPostsQueryParams = getSchema("ListPostsQueryParams");
const ListPostsResponse = getSchema("ListPostsResponse");
const CreatePostBody = getSchema("CreatePostBody");
const GetPostParams = getSchema("GetPostParams");
const GetPostResponse = getSchema("GetPostResponse");
const UpdatePostParams = getSchema("UpdatePostParams");
const UpdatePostBody = getSchema("UpdatePostBody");
const UpdatePostResponse = getSchema("UpdatePostResponse");
const DeletePostParams = getSchema("DeletePostParams");
const ToggleSavePostParams = getSchema("ToggleSavePostParams");
const ToggleSavePostResponse = getSchema("ToggleSavePostResponse");
const ReportPostParams = getSchema("ReportPostParams");
const ReportPostBody = getSchema("ReportPostBody");
const ToggleFeaturePostParams = getSchema("ToggleFeaturePostParams");

const opAlias = alias(postsTable, "op");
const ouAlias = alias(usersTable, "ou");
const CAMPUSX_DISPATCH_USER_ID = "system:campusx-dispatch";

const router = Router() as any;

async function getPostCount(clerkUserId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(eq(postsTable.authorId, clerkUserId));
  return count ?? 0;
}

router.get("/posts", async (req: any, res: any): Promise<void> => {
  const query = ListPostsQueryParams.safeParse(req.query);
  const limit =
    query.success && query.data.limit ? Number(query.data.limit) : 50;
  const category = query.success ? query.data.category : undefined;

  const clerkUserId = getAuth(req).userId;
  let viewerUser: any = null;
  if (clerkUserId) {
    const [u] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);
    viewerUser = u ?? null;
  }

  const conditions: any[] = [];
  if (category) {
    conditions.push(eq(postsTable.category, category));
  }

  if (viewerUser && viewerUser.role !== "system" && !viewerUser.isAdmin) {
    const viewerInstId = canonicalInstitutionId(viewerUser);
    conditions.push(
      sql`(${schoolScopeCondition(
        usersTable.institutionId,
        usersTable.school,
        viewerUser,
      )} AND ${campusScopeCondition(
        usersTable.campusLocation,
        viewerUser.campusLocation,
      )}) OR (${postsTable.authorId} = ${CAMPUSX_DISPATCH_USER_ID} AND ${
        postsTable.targetInstitutionId
      } = ${viewerInstId ?? ""})`,
    );
  }

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
    })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .leftJoin(opAlias, eq(postsTable.originalPostId, opAlias.id))
    .leftJoin(ouAlias, eq(opAlias.authorId, ouAlias.clerkUserId))
    .where(and(...conditions) as any)
    .orderBy(desc(postsTable.isPinnedToFeed), desc(postsTable.createdAt))
    .limit(limit);

  const publicPolls = await loadPublicPolls(
    posts.map((p: any) => p.originalPostId ?? p.id),
    clerkUserId,
  );

  const postsWithMetaData = await Promise.all(
    posts.map(async (post: any) => {
      let isLikedByMe = false;
      let isNoCapByMe = false;
      let isSavedByMe = false;

      if (clerkUserId) {
        const [likes, nocaps, saves] = await Promise.all([
          db
            .select()
            .from(postLikesTable)
            .where(
              and(
                eq(postLikesTable.postId, post.id),
                eq(postLikesTable.userId, clerkUserId),
              ) as any,
            ),
          db
            .select()
            .from(postNoCapsTable)
            .where(
              and(
                eq(postNoCapsTable.postId, post.id),
                eq(postNoCapsTable.userId, clerkUserId),
              ) as any,
            ),
          db
            .select({ id: savedPostsTable.id })
            .from(savedPostsTable)
            .where(
              and(
                eq(savedPostsTable.postId, post.id),
                eq(savedPostsTable.userId, clerkUserId),
              ) as any,
            ),
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

      return {
        id: post.id,
        authorId: post.authorId,
        content: post.content,
        category: post.category,
        imageUrl: post.imageUrl,
        blurDataUrl: post.blurDataUrl,
        videoUrl: post.videoUrl,
        likesCount: post.likesCount ?? 0,
        noCapsCount: post.noCapsCount ?? 0,
        reshareCount: post.reshareCount ?? 0,
        createdAt: post.createdAt,
        isOwnedByMe: Boolean(clerkUserId && clerkUserId === post.authorId),
        isSavedByMe,
        authorName: post.isAnonymous
          ? "Anonymous"
          : (post.authorName ?? "Unknown"),
        authorUsername: post.isAnonymous ? null : (post.authorUsername ?? null),
        authorFaculty: post.isAnonymous
          ? "Secret"
          : (post.authorFaculty ?? "Unknown"),
        authorLevel: post.isAnonymous
          ? ""
          : getEffectiveLevel(post.authorLevel, post.authorMatricNumber),
        authorCampusLocation: post.authorCampusLocation ?? "Ojo",
        authorAvatarUrl: post.isAnonymous
          ? null
          : (post.authorAvatarUrl ?? null),
        authorCampusTitle: post.isAnonymous ? "" : campusTitle,
        authorRole: post.isAnonymous ? "student" : publicRole,
        authorIsVerified:
          !post.isAnonymous &&
          isVerifiedAccount(
            post.authorVerificationStatus,
            role,
            post.authorPublicBadgeTier,
            post.authorPublicBadgeExpiresAt,
          ),
        authorVerificationStatus: post.isAnonymous
          ? "none"
          : publicVerificationStatus(
              post.authorVerificationStatus,
              role,
              post.authorPublicBadgeTier,
              post.authorPublicBadgeExpiresAt,
            ),
        isAnonymous: post.isAnonymous ?? false,
        poll: publicPolls.get(post.originalPostId ?? post.id) ?? null,
        commentsCount: commentsCount ?? 0,
        originalPostId: post.originalPostId ?? null,
        originalPost: post.opId
          ? publicEmbeddedPost({
              id: post.opId,
              authorId: post.opAuthorId ?? "",
              authorName: post.opAuthorName ?? "Unknown",
              authorUsername: post.opAuthorUsername ?? null,
              authorAvatarUrl: post.opAuthorAvatarUrl ?? null,
              authorIsVerified:
                !post.opIsAnonymous &&
                isVerifiedAccount(
                  post.opAuthorVerificationStatus,
                  post.opAuthorRole,
                  post.opAuthorPublicBadgeTier,
                  post.opAuthorPublicBadgeExpiresAt,
                ),
              authorVerificationStatus: post.opIsAnonymous
                ? "none"
                : publicVerificationStatus(
                    post.opAuthorVerificationStatus,
                    post.opAuthorRole,
                    post.opAuthorPublicBadgeTier,
                    post.opAuthorPublicBadgeExpiresAt,
                  ),
              isAnonymous: Boolean(post.opIsAnonymous),
              content: post.opContent ?? "",
              imageUrl: post.opImageUrl ?? null,
              createdAt: (post.opCreatedAt ?? new Date()).toISOString(),
            })
          : null,
        isPinnedToProfile: post.isPinnedToProfile ?? false,
        isPinnedToFeed: post.isPinnedToFeed ?? false,
        isLikedByMe,
        isNoCapByMe,
      };
    }),
  );

  res.setHeader("Cache-Control", "private, no-store");
  res.json(
    ListPostsResponse.parse({ posts: postsWithMetaData, nextCursor: null }),
  );
});

router.post(
  "/posts",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    const body = CreatePostBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const clerkUserId = getAuth(req).userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [inserted] = await db
      .insert(postsTable)
      .values({
        authorId: clerkUserId,
        content: body.data.content,
        category: body.data.category,
        imageUrl: body.data.imageUrl ?? null,
        videoUrl: body.data.videoUrl ?? null,
        isAnonymous: body.data.isAnonymous ?? false,
      })
      .returning();

    res.status(201).json({ post: inserted });
  },
);

router.get("/posts/:postId", async (req: any, res: any): Promise<void> => {
  const rawId = Array.isArray(req.params.postId)
    ? req.params.postId[0]
    : req.params.postId;
  const params = GetPostParams.safeParse({ postId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, params.data.postId))
    .limit(1);

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(GetPostResponse.parse({ post }));
});

router.delete(
  "/posts/:postId",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    const rawId = Array.isArray(req.params.postId)
      ? req.params.postId[0]
      : req.params.postId;
    const params = DeletePostParams.safeParse({ postId: rawId });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const clerkUserId = getAuth(req).userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [post] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, params.data.postId))
      .limit(1);

    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    if (post.authorId !== clerkUserId && !(await hasAdminPrivileges(req))) {
      res
        .status(403)
        .json({ error: "You are not authorized to delete this post" });
      return;
    }

    await db.delete(postsTable).where(eq(postsTable.id, params.data.postId));
    res.json({ success: true });
  },
);

export default router;
