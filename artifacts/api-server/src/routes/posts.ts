import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { eq, desc, and, sql, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, postsTable, postLikesTable, postNoCapsTable, postCommentsTable, usersTable, pollsTable, pollOptionsTable, savedPostsTable, reportsTable, uploadedMediaTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { hasAdminPrivileges } from "../lib/privilege";
import { computeCampusTitle } from "./admin";
import { isVerifiedAccount, publicVerificationStatus } from "../lib/verification";
import { getEffectiveLevel } from "../lib/academic-level";
import { createNotification } from "../lib/notifications";
import { publicPost } from "../lib/post-privacy";
import { loadPublicPolls } from "../lib/polls";
import { ObjectStorageService } from "../lib/objectStorage";
import { cursorFilterHash, decodeFeedCursor, encodeFeedCursor } from "../lib/listCursor";
import { validateUploadedWebpImage } from "../lib/image-upload-validation";
import { isSmallWebpDataUrl } from "../lib/blur-data-url";
import {
  campusScopeCondition,
  normalizeCampusLocation,
  normalizeSchoolLabel,
  profilesShareCampus,
  profilesShareSchool,
  canonicalInstitutionId,
  postReadScopeCondition,
  schoolScopeCondition,
  type CampusScopeProfile,
} from "./list-scope";
import {
  ListPostsQueryParams,
  ListPostsResponse,
  CreatePostBody,
  GetPostParams,
  GetPostResponse,
  UpdatePostParams,
  UpdatePostBody,
  UpdatePostResponse,
  DeletePostParams,
  ToggleSavePostParams,
  ToggleSavePostResponse,
  ReportPostParams,
  ReportPostBody,
  ToggleFeaturePostParams,
  ToggleFeaturePostResponse,
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
const objectStorageService = new ObjectStorageService();

function isDispatchOnlyPostCategory(category: unknown): boolean {
  return category === "Campus News" || category === "Strike Update";
}

const originalPostAlias = alias(postsTable, "op");
const originalUserAlias = alias(usersTable, "ou");

async function getCampusScopeProfile(userId: string) {
  const [profile] = await db
    .select({
      institutionId: usersTable.institutionId,
      school: usersTable.school,
      campusLocation: usersTable.campusLocation,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));
  return profile ?? null;
}

function hasCampusScope(profile: CampusScopeProfile | null): profile is CampusScopeProfile {
  return Boolean(profile?.school.trim() && profile.campusLocation.trim());
}

async function getPostReadScope(
  req: Request,
  viewerId: string,
  post: { authorId: string; originalPostId: number | null; targetInstitutionId: string | null },
) {
  const requesterProfile = await getCampusScopeProfile(viewerId);
  const isOwner = post.authorId === viewerId;
  const isAdmin = await hasAdminPrivileges(req);
  let canReadPost = isOwner || isAdmin;
  let profileRequired = false;

  if (!canReadPost) {
    if (!hasCampusScope(requesterProfile)) {
      profileRequired = true;
    } else if (post.targetInstitutionId !== null) {
      canReadPost = canonicalInstitutionId(requesterProfile) === post.targetInstitutionId;
    } else {
      const authorProfile = await getCampusScopeProfile(post.authorId);
      canReadPost = hasCampusScope(authorProfile)
        && profilesShareSchool(requesterProfile, authorProfile)
        && profilesShareCampus(requesterProfile, authorProfile);
    }
  }

  let canViewOriginal = post.originalPostId === null || isAdmin;
  if (post.originalPostId !== null && !isAdmin && hasCampusScope(requesterProfile)) {
    const [originalPost] = await db
      .select({ authorId: postsTable.authorId, targetInstitutionId: postsTable.targetInstitutionId })
      .from(postsTable)
      .where(eq(postsTable.id, post.originalPostId));
    if (originalPost?.targetInstitutionId != null) {
      canViewOriginal = canonicalInstitutionId(requesterProfile) === originalPost.targetInstitutionId;
    } else {
      const originalAuthor = originalPost ? await getCampusScopeProfile(originalPost.authorId) : null;
      canViewOriginal = hasCampusScope(originalAuthor)
        && profilesShareSchool(requesterProfile, originalAuthor)
        && profilesShareCampus(requesterProfile, originalAuthor);
    }
  }

  return { requesterProfile, canReadPost, canViewOriginal, profileRequired, isAdmin };
}

function getAppObjectPath(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const normalized = objectStorageService.normalizeObjectEntityPath(rawUrl);
    const path = normalized.startsWith("/api/storage/objects/")
      ? normalized.slice("/api/storage".length)
      : normalized;
    if (!path.startsWith("/objects/")) return null;
    if (path.includes("?") || path.includes("#") || path.split("/").some((part) => part === "." || part === "..")) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

function hasMalformedPrivateObjectPath(rawUrl: string): boolean {
  return (rawUrl.startsWith("/objects/") || rawUrl.startsWith("/api/storage/objects/"))
    && getAppObjectPath(rawUrl) === null;
}

async function validateNewPostMediaOwnership(urls: Array<string | null | undefined>, uploaderId: string): Promise<string | null> {
  const paths = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    if (hasMalformedPrivateObjectPath(url)) {
      return "Private media object paths must be valid /objects/ paths.";
    }
    const path = getAppObjectPath(url);
    if (path) paths.add(path);
  }
  for (const objectPath of paths) {
    const [ownedUpload] = await db
      .select({ id: uploadedMediaTable.id })
      .from(uploadedMediaTable)
      .where(and(
        eq(uploadedMediaTable.objectPath, objectPath),
        eq(uploadedMediaTable.uploaderId, uploaderId),
        or(isNull(uploadedMediaTable.purpose), ne(uploadedMediaTable.purpose, "matric-claim-evidence")),
      ));
    if (!ownedUpload) return "You can only attach private media uploaded by your account.";
  }
  return null;
}

async function cleanUnreferencedPostMedia(
  urls: Array<string | null | undefined>,
  deletedPostId: number,
  postAuthorId: string,
  logError: (context: Record<string, unknown>, message: string) => void,
) {
  const candidates = [...new Set(urls.map(getAppObjectPath).filter((path): path is string => path !== null))];
  if (!candidates.length) return;

  try {
    const [remainingPosts, users, ownedUploads] = await Promise.all([
      db.select({ imageUrl: postsTable.imageUrl, videoUrl: postsTable.videoUrl }).from(postsTable),
      db.select({ avatarUrl: usersTable.avatarUrl }).from(usersTable),
      db.select({ id: uploadedMediaTable.id, objectPath: uploadedMediaTable.objectPath })
        .from(uploadedMediaTable)
        .where(eq(uploadedMediaTable.uploaderId, postAuthorId)),
    ]);
    const ownedByPath = new Map(ownedUploads.map((upload) => [upload.objectPath, upload.id]));
    const referencedPaths = new Set<string>();
    for (const post of remainingPosts) {
      const imagePath = getAppObjectPath(post.imageUrl);
      const videoPath = getAppObjectPath(post.videoUrl);
      if (imagePath) referencedPaths.add(imagePath);
      if (videoPath) referencedPaths.add(videoPath);
    }
    for (const user of users) {
      const avatarPath = getAppObjectPath(user.avatarUrl);
      if (avatarPath) referencedPaths.add(avatarPath);
    }

    for (const path of candidates) {
      const uploadId = ownedByPath.get(path);
      if (uploadId === undefined || referencedPaths.has(path)) continue;
      try {
        const file = await objectStorageService.getObjectEntityFile(path);
        await file.delete();
        await db.delete(uploadedMediaTable).where(eq(uploadedMediaTable.id, uploadId));
      } catch (error) {
        logError({ err: error, postId: deletedPostId, objectPath: path }, "Failed to clean up unreferenced post media");
      }
    }
  } catch (error) {
    logError({ err: error, postId: deletedPostId }, "Failed to check post media references for cleanup");
  }
}

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
  let isSavedByMe = false;
  if (clerkUserId) {
    const [like, nocap, saved] = await Promise.all([
      db.select().from(postLikesTable).where(and(eq(postLikesTable.postId, postId), eq(postLikesTable.userId, clerkUserId))),
      db.select().from(postNoCapsTable).where(and(eq(postNoCapsTable.postId, postId), eq(postNoCapsTable.userId, clerkUserId))),
      db.select().from(savedPostsTable).where(and(eq(savedPostsTable.postId, postId), eq(savedPostsTable.userId, clerkUserId))),
    ]);
    isLikedByMe = like.length > 0;
    isNoCapByMe = nocap.length > 0;
    isSavedByMe = saved.length > 0;
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
    isSavedByMe,
    isFeaturedTrending: post.isFeaturedTrending ?? false,
    isLikedByMe,
    isNoCapByMe,
  };

  const pollPostId = post.originalPostId ?? post.id;
  const poll = (await loadPublicPolls([pollPostId], clerkUserId)).get(pollPostId) ?? null;
  return publicPost({ ...built, poll }, clerkUserId);
}

router.get("/posts", async (req, res): Promise<void> => {
  const query: Record<string, unknown> = { ...req.query };
  const savedOnly = query.savedOnly === "true";
  if (query.savedOnly !== undefined) {
    if (query.savedOnly !== "true" && query.savedOnly !== "false") {
      res.status(400).json({ error: "savedOnly must be either true or false." });
      return;
    }
    delete query.savedOnly;
  }
  const params = ListPostsQueryParams.safeParse(query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { limit, offset, category, faculty, cursor: cursorToken } = params.data;
  const clerkUserId = getAuth(req).userId ?? undefined;
  if (!clerkUserId) {
    res.status(401).json({ error: "Sign in to view campus posts." });
    return;
  }
  const requesterProfile = await getCampusScopeProfile(clerkUserId);
  if (!hasCampusScope(requesterProfile)) {
    res.status(403).json({ error: "Complete your school and campus profile to view posts." });
    return;
  }
  const scope: CampusScopeProfile = requesterProfile;
  const filters = [
    postReadScopeCondition(
      postsTable.targetInstitutionId,
      scope,
      and(
        schoolScopeCondition(usersTable.institutionId, usersTable.school, scope),
        campusScopeCondition(usersTable.campusLocation, scope.campusLocation),
      )!,
    ),
    category ? eq(postsTable.category, category) : undefined,
    faculty ? sql`lower(trim(${usersTable.faculty})) = lower(trim(${faculty}))` : undefined,
    savedOnly && clerkUserId
      ? sql`exists (select 1 from saved_posts sp where sp.post_id = ${postsTable.id} and sp.user_id = ${clerkUserId})`
      : undefined,
  ];
  const filterHash = cursorFilterHash({
    category: category ?? null,
    faculty: faculty?.trim().toLowerCase() ?? null,
    savedOnly,
    viewerId: savedOnly ? clerkUserId : null,
    institutionId: canonicalInstitutionId(scope),
    school: normalizeSchoolLabel(scope.school),
    campus: normalizeCampusLocation(scope.campusLocation),
  });
  if (cursorToken && offset > 0) {
    res.status(400).json({ error: "Cursor pagination cannot be combined with a positive offset." });
    return;
  }
  const cursor = cursorToken !== undefined ? decodeFeedCursor(cursorToken, filterHash) : null;
  if (cursorToken !== undefined && !cursor) {
    res.status(400).json({ error: "Invalid or filter-mismatched cursor." });
    return;
  }
  const cursorCondition = cursor ? sql`(
    ${postsTable.isFeaturedTrending} < ${cursor.featured}
    OR (${postsTable.isFeaturedTrending} = ${cursor.featured} AND ${postsTable.isPinnedToFeed} < ${cursor.pinned})
    OR (${postsTable.isFeaturedTrending} = ${cursor.featured} AND ${postsTable.isPinnedToFeed} = ${cursor.pinned}
      AND ${postsTable.createdAt} < ${cursor.createdAt}::timestamptz)
    OR (${postsTable.isFeaturedTrending} = ${cursor.featured} AND ${postsTable.isPinnedToFeed} = ${cursor.pinned}
      AND ${postsTable.createdAt} = ${cursor.createdAt}::timestamptz AND ${postsTable.id} < ${cursor.id})
  )` : undefined;
  const pageFilters = cursorCondition ? [...filters, cursorCondition] : filters;

  const fetchedPosts = await db
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
      cursorCreatedAt: sql<string>`to_char(${postsTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
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
    .leftJoin(originalPostAlias, and(
      eq(postsTable.originalPostId, originalPostAlias.id),
      postReadScopeCondition(originalPostAlias.targetInstitutionId, scope, sql`exists (
        select 1 from users original_author
        where original_author.clerk_user_id = ${originalPostAlias.authorId}
          and ${schoolScopeCondition(sql`original_author.institution_id`, sql`original_author.school`, scope)}
          and ${campusScopeCondition(sql`original_author.campus_location`, scope.campusLocation)}
      )`),
    ))
    .leftJoin(originalUserAlias, eq(originalPostAlias.authorId, originalUserAlias.clerkUserId))
    .where(and(...pageFilters))
    .orderBy(desc(postsTable.isFeaturedTrending), desc(postsTable.isPinnedToFeed), desc(postsTable.createdAt), desc(postsTable.id))
    .limit((limit ?? 20) + 1)
    .offset(cursor ? 0 : (offset ?? 0));

  const pageLimit = limit ?? 20;
  const hasMore = fetchedPosts.length > pageLimit;
  const posts = fetchedPosts.slice(0, pageLimit);
  const lastPost = posts.at(-1);
  const nextCursor = hasMore && lastPost
    ? encodeFeedCursor({
        featured: lastPost.isFeaturedTrending ?? false,
        pinned: lastPost.isPinnedToFeed ?? false,
        createdAt: lastPost.cursorCreatedAt,
        id: lastPost.id,
      }, filterHash)
    : null;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .leftJoin(usersTable, eq(postsTable.authorId, usersTable.clerkUserId))
    .where(and(...filters));

  const publicPolls = await loadPublicPolls(
    posts.map((post) => post.opId != null ? post.originalPostId ?? post.id : post.id),
    clerkUserId,
  );
  const postsWithReactions = await Promise.all(
    posts.map(async (post) => {
      let isLikedByMe = false;
      let isNoCapByMe = false;
      let isSavedByMe = false;
      const [{ commentsCount }] = await db
        .select({ commentsCount: sql<number>`count(*)::int` })
        .from(postCommentsTable)
        .where(eq(postCommentsTable.postId, post.id));
      if (clerkUserId) {
        const [likes, nocaps, saved] = await Promise.all([
          db.select().from(postLikesTable).where(and(eq(postLikesTable.postId, post.id), eq(postLikesTable.userId, clerkUserId))),
          db.select().from(postNoCapsTable).where(and(eq(postNoCapsTable.postId, post.id), eq(postNoCapsTable.userId, clerkUserId))),
          db.select().from(savedPostsTable).where(and(eq(savedPostsTable.postId, post.id), eq(savedPostsTable.userId, clerkUserId))),
        ]);
        isLikedByMe = likes.length > 0;
        isNoCapByMe = nocaps.length > 0;
        isSavedByMe = saved.length > 0;
      }

      const role = post.authorRole ?? "student";
      const postCount = await getPostCount(post.authorId);
      const campusTitle = computeCampusTitle(role, postCount);

      const {
        authorMatricNumber,
        cursorCreatedAt,
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
        isSavedByMe,
        isFeaturedTrending: post.isFeaturedTrending ?? false,
        isLikedByMe,
        isNoCapByMe,
      };

      return publicPost({ ...built, poll: publicPolls.get(post.originalPostId ?? post.id) ?? null }, clerkUserId);
    })
  );

  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListPostsResponse.parse({ posts: postsWithReactions, total: count, nextCursor }));
});

router.post("/posts", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  if (req.body && typeof req.body === "object" && "targetInstitutionId" in req.body) {
    res.status(400).json({ error: "targetInstitutionId is reserved for trusted system posts." });
    return;
  }
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (isDispatchOnlyPostCategory(parsed.data.category)) {
    res.status(403).json({ error: "Campus News and Strike Update are reserved for trusted CampusX Dispatch posts." });
    return;
  }
  if (!isSmallWebpDataUrl(parsed.data.blurDataUrl)) {
    res.status(400).json({ error: "blurDataUrl must be a small valid WebP data URL." });
    return;
  }
  if (
    parsed.data.blurDataUrl !== undefined &&
    (parsed.data.imageUrl === undefined || (parsed.data.blurDataUrl !== null && !parsed.data.imageUrl))
  ) {
    res.status(400).json({ error: "blurDataUrl can only be supplied with imageUrl." });
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
  const mediaOwnershipError = await validateNewPostMediaOwnership(
    [parsed.data.imageUrl, parsed.data.videoUrl],
    userId,
  );
  if (mediaOwnershipError) {
    const hasMalformedPath = [parsed.data.imageUrl, parsed.data.videoUrl]
      .some((url) => url != null && hasMalformedPrivateObjectPath(url));
    res.status(hasMalformedPath ? 400 : 403).json({ error: mediaOwnershipError });
    return;
  }
  const imagePath = getAppObjectPath(parsed.data.imageUrl);
  if (imagePath) {
    const imageError = await validateUploadedWebpImage(imagePath, userId, "post-image", objectStorageService, true);
    if (imageError) {
      res.status(403).json({ error: imageError });
      return;
    }
  }

  const postId = await db.transaction(async (tx) => {
    const [post] = await tx.insert(postsTable).values({
      authorId: userId,
      content: parsed.data.content,
      category: parsed.data.category ?? "Amebo Hot",
      imageUrl: parsed.data.imageUrl ?? null,
      blurDataUrl: parsed.data.blurDataUrl ?? null,
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
  if (!clerkUserId) {
    res.status(401).json({ error: "Sign in to view this post." });
    return;
  }
  const [postScope] = await db
    .select({
      authorId: postsTable.authorId,
      originalPostId: postsTable.originalPostId,
      targetInstitutionId: postsTable.targetInstitutionId,
    })
    .from(postsTable)
    .where(eq(postsTable.id, params.data.postId));
  if (!postScope) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const result = await buildPostWithMeta(params.data.postId, clerkUserId);
  if (!result) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const readScope = await getPostReadScope(req, clerkUserId, postScope);
  if (!readScope.canReadPost) {
    if (readScope.profileRequired) {
      res.status(403).json({ error: "Complete your school and campus profile to view this post." });
      return;
    }
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (!readScope.canViewOriginal) {
    result.originalPost = null;
    result.poll = null;
  }

  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetPostResponse.parse(result));
});

router.patch("/posts/:postId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = UpdatePostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (
    req.body &&
    typeof req.body === "object" &&
    "category" in req.body &&
    isDispatchOnlyPostCategory((req.body as { category?: unknown }).category)
  ) {
    res.status(403).json({ error: "Campus News and Strike Update are reserved for trusted CampusX Dispatch posts." });
    return;
  }
  const body = UpdatePostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!isSmallWebpDataUrl(body.data.blurDataUrl)) {
    res.status(400).json({ error: "blurDataUrl must be a small valid WebP data URL." });
    return;
  }
  if (
    body.data.blurDataUrl !== undefined &&
    (body.data.imageUrl === undefined || (body.data.blurDataUrl !== null && !body.data.imageUrl))
  ) {
    res.status(400).json({ error: "blurDataUrl can only be supplied with imageUrl." });
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (post.authorId !== userId) {
    res.status(403).json({ error: "Only the post author can edit this post." });
    return;
  }

  const finalImageUrl = body.data.imageUrl !== undefined ? body.data.imageUrl : post.imageUrl;
  if (!body.data.content.trim()) {
    const [poll] = await db.select({ id: pollsTable.id }).from(pollsTable).where(eq(pollsTable.postId, post.id)).limit(1);
    if (!finalImageUrl && !post.videoUrl && !poll) {
      res.status(400).json({ error: "Post text cannot be empty unless the post has media or a poll." });
      return;
    }
  }

  if (body.data.imageUrl !== undefined && body.data.imageUrl !== post.imageUrl) {
    if (body.data.imageUrl && hasMalformedPrivateObjectPath(body.data.imageUrl)) {
      res.status(400).json({ error: "Private media object paths must be valid /objects/ paths." });
      return;
    }
    const imagePath = getAppObjectPath(body.data.imageUrl);
    if (imagePath) {
      const mediaOwnershipError = await validateNewPostMediaOwnership([body.data.imageUrl], userId);
      if (mediaOwnershipError) {
        res.status(403).json({ error: mediaOwnershipError });
        return;
      }
      const imageError = await validateUploadedWebpImage(imagePath, userId, "post-image", objectStorageService, true);
      if (imageError) {
        res.status(403).json({ error: imageError });
        return;
      }
    }
  }

  await db.update(postsTable).set({
    content: body.data.content,
    ...(body.data.imageUrl !== undefined ? { imageUrl: body.data.imageUrl } : {}),
    ...(body.data.blurDataUrl !== undefined ? { blurDataUrl: body.data.blurDataUrl } : {}),
    ...(body.data.imageUrl === null && body.data.blurDataUrl === undefined ? { blurDataUrl: null } : {}),
  }).where(eq(postsTable.id, post.id));
  const updated = await buildPostWithMeta(post.id, userId);
  res.json(UpdatePostResponse.parse(updated));
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

  const isOwner = post.authorId === userId;
  const [caller] = await db.select({ role: usersTable.role })
    .from(usersTable).where(eq(usersTable.clerkUserId, userId));
  const isModerator = caller?.role === "moderator" || await hasAdminPrivileges(req);

  if (!isOwner && !isModerator) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const deleted = await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(postsTable)
      .where(eq(postsTable.id, params.data.postId))
      .returning({ id: postsTable.id, originalPostId: postsTable.originalPostId });
    if (removed?.originalPostId != null) {
      await tx
        .update(postsTable)
        .set({ reshareCount: sql`greatest(${postsTable.reshareCount} - 1, 0)` })
        .where(eq(postsTable.id, removed.originalPostId));
    }
    return removed;
  });
  if (!deleted) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  await cleanUnreferencedPostMedia(
    [post.imageUrl, post.videoUrl],
    post.id,
    post.authorId,
    (context, message) => req.log.error(context, message),
  );
  res.sendStatus(204);
});

router.post("/posts/:postId/save", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = ToggleSavePostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [post] = await tx.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, params.data.postId)).for("update");
    if (!post) return { found: false, saved: false };
    const [existing] = await tx
      .select({ id: savedPostsTable.id })
      .from(savedPostsTable)
      .where(and(eq(savedPostsTable.postId, post.id), eq(savedPostsTable.userId, userId)));
    if (existing) {
      await tx.delete(savedPostsTable).where(eq(savedPostsTable.id, existing.id));
      return { found: true, saved: false };
    }

    const [inserted] = await tx
      .insert(savedPostsTable)
      .values({ postId: post.id, userId })
      .onConflictDoNothing()
      .returning({ id: savedPostsTable.id });
    return { found: true, saved: Boolean(inserted) };
  });
  if (!result.found) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(ToggleSavePostResponse.parse({ saved: result.saved }));
});

router.post("/posts/:postId/report", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = ReportPostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ReportPostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [post] = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const [reported] = await db
    .insert(reportsTable)
    .values({ postId: post.id, reporterId: userId, reason: body.data.reason, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: reportsTable.id });
  if (!reported) {
    res.status(409).json({ error: "You have already reported this post." });
    return;
  }
  res.status(201).json({ reported: true });
});

router.patch("/posts/:postId/feature", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId;
  const params = ToggleFeaturePostParams.safeParse({ postId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!(await hasAdminPrivileges(req))) {
    res.status(403).json({ error: "Admin or CEO only." });
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [updated] = await db
    .update(postsTable)
    .set({ isFeaturedTrending: !post.isFeaturedTrending })
    .where(eq(postsTable.id, post.id))
    .returning({ isFeaturedTrending: postsTable.isFeaturedTrending });
  res.json(ToggleFeaturePostResponse.parse({ featured: updated.isFeaturedTrending }));
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

  const hasPermission = await hasAdminPrivileges(req);
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

  const clerkUserId = getAuth(req).userId ?? undefined;
  if (!clerkUserId) {
    res.status(401).json({ error: "Sign in to view post comments." });
    return;
  }
  const [post] = await db
    .select({
      id: postsTable.id,
      authorId: postsTable.authorId,
      originalPostId: postsTable.originalPostId,
      targetInstitutionId: postsTable.targetInstitutionId,
    })
    .from(postsTable)
    .where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const readScope = await getPostReadScope(req, clerkUserId, post);
  const requesterHasProfile = Boolean(
    readScope.requesterProfile?.school.trim() && readScope.requesterProfile.campusLocation.trim(),
  );
  if (!requesterHasProfile && !readScope.isAdmin) {
    res.status(403).json({ error: "Complete your school and campus profile to view post comments." });
    return;
  }
  if (!readScope.canReadPost) {
    if (readScope.profileRequired) {
      res.status(403).json({ error: "Complete your school and campus profile to view post comments." });
      return;
    }
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (!readScope.canViewOriginal) {
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

  res.setHeader("Cache-Control", "private, no-store");
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
    .select({
      id: postsTable.id,
      authorId: postsTable.authorId,
      originalPostId: postsTable.originalPostId,
      targetInstitutionId: postsTable.targetInstitutionId,
    })
    .from(postsTable)
    .where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const readScope = await getPostReadScope(req, userId, post);
  if (!readScope.canReadPost || !readScope.canViewOriginal) {
    res.status(readScope.profileRequired ? 403 : 404).json({
      error: readScope.profileRequired
        ? "Complete your school and campus profile to comment on posts."
        : "Post not found",
    });
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
