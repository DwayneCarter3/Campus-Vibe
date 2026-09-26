type EmbeddedAuthor = {
  authorId: string;
  authorName: string;
  authorUsername?: string | null;
  authorAvatarUrl: string | null;
  authorIsVerified: boolean;
  authorVerificationStatus: string;
  isAnonymous: boolean;
};

/** Always mask embedded originals, even when the viewer is their author. */
export function publicEmbeddedPost<T extends EmbeddedAuthor>(post: T): T {
  if (!post.isAnonymous) return post;
  return {
    ...post,
    authorId: "anonymous",
    authorName: "Anonymous LASUite",
    authorUsername: null,
    authorAvatarUrl: null,
    authorIsVerified: false,
    authorVerificationStatus: "none",
  };
}

type PostAuthor = EmbeddedAuthor & {
  authorFaculty: string;
  authorLevel: string;
  authorCampusLocation: string;
  authorCampusTitle: string;
  authorRole: string;
  originalPost: EmbeddedAuthor | null;
};

/** Ownership is computed before masking so the public API never returns an anonymous author's real ID. */
export function publicPost<T extends PostAuthor>(post: T, requesterId?: string) {
  const isOwnedByMe = Boolean(requesterId && post.authorId === requesterId);
  const safePost = post.isAnonymous ? {
    ...post,
    authorId: "anonymous",
    authorName: "Anonymous LASUite",
    authorUsername: null,
    authorFaculty: "LASU",
    authorLevel: "—",
    authorCampusLocation: "Ojo",
    authorAvatarUrl: null,
    authorCampusTitle: "",
    authorRole: "student",
    authorIsVerified: false,
    authorVerificationStatus: "none",
  } : post;
  return {
    ...safePost,
    isOwnedByMe,
    originalPost: post.originalPost ? publicEmbeddedPost(post.originalPost) : null,
  };
}