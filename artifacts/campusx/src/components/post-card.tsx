import { useState, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { Trash2, MapPin, MessageCircle, Send, MoreVertical, Pin, Repeat2, Ghost, Pencil, Bookmark, Link2, EyeOff, Flag, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDeletePost,
  useUpdatePost,
  useToggleSavePost,
  useReportPost,
  useToggleFeaturePost,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  getGetPostQueryKey,
  useLikePost,
  useNoCapPost,
  useListPostComments,
  useCreatePostComment,
  usePinPostToProfile,
  usePinPostToFeed,
  useResharePost,
  getListPostsQueryKey,
  getListPostCommentsQueryKey,
  getGetUserPostsQueryKey,
} from "@workspace/api-client-react";
import type { Post, Comment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { AvatarModal } from "@/components/avatar-modal";
import { UserVerificationMarks } from "@/components/user-verification-marks";
import { VerificationBadge } from "@/components/verification-badge";
import { getPostCategoryMeta } from "@/components/post-categories";
import { PollCard } from "@/components/poll-card";
import { useToast } from "@/hooks/use-toast";
import type { ReportBodyReason } from "@workspace/api-client-react";
import { LazyBlurImage } from "@/components/lazy-blur-image";

interface PostCardProps {
  post: Post;
  isAdmin?: boolean;
  isModerator?: boolean;
  moderationMode?: boolean;
  onHide?: (id: number) => void;
  onDeleted?: () => void;
}

const reportReasons: ReportBodyReason[] = ["Spam", "Harassment", "Fake Listing", "Inappropriate Content"];

export function PostCard({ post, isAdmin, isModerator, moderationMode = false, onHide, onDeleted }: PostCardProps) {
  const category = getPostCategoryMeta(post.category);
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: myProfile } = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey() } });
  const likePost = useLikePost();
  const noCapPost = useNoCapPost();
  const deletePost = useDeletePost();
  const updatePost = useUpdatePost();
  const savePost = useToggleSavePost();
  const reportPost = useReportPost();
  const featurePost = useToggleFeaturePost();
  const createComment = useCreatePostComment();
  const pinToProfile = usePinPostToProfile();
  const pinToFeed = usePinPostToFeed();
  const resharePostMutation = useResharePost();

  const [optimisticFire, setOptimisticFire] = useState<{ active: boolean; count: number } | null>(null);
  const [optimisticNoCap, setOptimisticNoCap] = useState<{ active: boolean; count: number } | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reshareOpen, setReshareOpen] = useState(false);
  const [reshareQuoteText, setReshareQuoteText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportBodyReason | null>(null);
  const [hidden, setHidden] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const { data: commentsData } = useListPostComments(post.id, {
    query: {
      queryKey: getListPostCommentsQueryKey(post.id),
      enabled: commentsOpen,
    },
  });

  useEffect(() => {
    if (commentsOpen && commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [commentsData?.comments.length, commentsOpen]);

  const isOwner = post.isOwnedByMe;
  const isPrivileged = myProfile?.role === "ceo" || myProfile?.role === "admin";
  const canModerate = moderationMode && (isAdmin || isModerator || isPrivileged || myProfile?.role === "moderator");
  const isAnon = post.isAnonymous;

  const fireLit = optimisticFire !== null ? optimisticFire.active : post.isLikedByMe;
  const fireCount = optimisticFire !== null ? optimisticFire.count : post.likesCount;
  const noCapLit = optimisticNoCap !== null ? optimisticNoCap.active : post.isNoCapByMe;
  const noCapCount = optimisticNoCap !== null ? optimisticNoCap.count : post.noCapsCount;
  const commentCount = post.commentsCount;

  const authorName = post.authorName;
  const authorAvatarUrl = post.authorAvatarUrl;
  const authorProfileLink = isAnon ? undefined : `/profile/${post.authorId}`;

  const handleFire = () => {
    const newActive = !fireLit;
    setOptimisticFire({ active: newActive, count: fireCount + (newActive ? 1 : -1) });
    likePost.mutate({ postId: post.id }, {
      onSuccess: (res: { liked: boolean; likesCount: number }) => {
        setOptimisticFire({ active: res.liked, count: res.likesCount });
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      },
      onError: () => setOptimisticFire(null),
    });
  };

  const handleNoCap = () => {
    const newActive = !noCapLit;
    setOptimisticNoCap({ active: newActive, count: noCapCount + (newActive ? 1 : -1) });
    noCapPost.mutate({ postId: post.id }, {
      onSuccess: (res) => {
        setOptimisticNoCap({ active: res.noCaped, count: res.noCapsCount });
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      },
      onError: () => setOptimisticNoCap(null),
    });
  };

  const invalidatePost = () => {
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(post.id) });
    if (isOwner && user?.id) queryClient.invalidateQueries({ queryKey: getGetUserPostsQueryKey(user.id) });
    if (!isAnon) queryClient.invalidateQueries({ queryKey: getGetUserPostsQueryKey(post.authorId) });
  };

  const fail = (message: string) => toast({ title: message, variant: "destructive" });

  const handleDelete = () => {
    deletePost.mutate({ postId: post.id }, {
      onSuccess: () => {
        setDeleteOpen(false);
        invalidatePost();
        onDeleted?.();
        toast({ title: "Post deleted" });
      },
      onError: () => fail("Couldn't delete post. Try again."),
    });
  };

  const handlePinToProfile = () => {
    pinToProfile.mutate({ postId: post.id }, {
      onSuccess: () => { invalidatePost(); toast({ title: post.isPinnedToProfile ? "Unpinned from profile" : "Pinned to profile" }); },
      onError: () => fail("Couldn't update profile pin. Try again."),
    });
  };

  const handlePinToFeed = () => {
    pinToFeed.mutate({ postId: post.id }, {
      onSuccess: () => {
        invalidatePost();
      },
      onError: () => fail("Couldn't update feed pin. Try again."),
    });
  };

  const handleEdit = () => {
    const content = editText.trim();
    if (!content || content.length > 500 || updatePost.isPending) return;
    updatePost.mutate({ postId: post.id, data: { content, imageUrl: post.imageUrl, blurDataUrl: post.blurDataUrl } }, {
      onSuccess: () => { setEditOpen(false); invalidatePost(); toast({ title: "Post updated" }); },
      onError: () => fail("Couldn't update post. Try again."),
    });
  };

  const handleSave = () => {
    savePost.mutate({ postId: post.id }, {
      onSuccess: (result) => { invalidatePost(); toast({ title: result.saved ? "Post saved" : "Post removed from saved" }); },
      onError: () => fail("Couldn't update saved posts. Try again."),
    });
  };

  const handleCopy = async () => {
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      await navigator.clipboard.writeText(`${window.location.origin}${base}/post/${post.id}`);
      toast({ title: "Link copied!" });
    } catch { fail("Couldn't copy link. Try again."); }
  };

  const handleReport = () => {
    if (!reportReason || reportPost.isPending) return;
    reportPost.mutate({ postId: post.id, data: { reason: reportReason } }, {
      onSuccess: () => { setReportOpen(false); setReportReason(null); invalidatePost(); toast({ title: "Report submitted" }); },
      onError: () => fail("Couldn't submit report. Try again."),
    });
  };

  const handleFeature = () => {
    featurePost.mutate({ postId: post.id }, {
      onSuccess: (result) => { invalidatePost(); toast({ title: result.featured ? "Featured on Trending Gist" : "Removed from Trending Gist" }); },
      onError: () => fail("Couldn't update featured post. Try again."),
    });
  };

  const handleReshare = () => {
    resharePostMutation.mutate(
      { postId: post.id, data: { quoteText: reshareQuoteText.trim() } },
      {
        onSuccess: () => {
          setReshareOpen(false);
          setReshareQuoteText("");
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        },
      }
    );
  };

  const handleSubmitComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed || createComment.isPending) return;
    createComment.mutate(
      { postId: post.id, data: { content: trimmed } },
      {
        onSuccess: () => {
          setCommentText("");
          queryClient.invalidateQueries({ queryKey: getListPostCommentsQueryKey(post.id) });
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        },
      }
    );
  };

  const AvatarWrapper = ({ children }: { children: React.ReactNode }) => {
    if (isAnon) {
      return <div className="cursor-default">{children}</div>;
    }
    return (
      <button onClick={() => setAvatarModalOpen(true)} className="shrink-0">
        {children}
      </button>
    );
  };

  if (hidden) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid={`card-post-${post.id}`}
        className={cn(
          "glass rounded-2xl mb-4 group border hover:border-primary/20 transition-colors overflow-hidden",
          "border-white/5"
        )}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <AvatarWrapper>
              {isAnon ? (
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500/30 via-slate-900 to-pink-500/20 border border-violet-400/30 flex items-center justify-center shrink-0">
                  <Ghost className="h-5 w-5 text-violet-200" aria-hidden="true" />
                </div>
              ) : (
                <span className="relative inline-flex shrink-0">
                  <Avatar className="cursor-pointer border border-white/10 hover:border-primary/50 transition-colors shrink-0 h-10 w-10">
                    <AvatarImage src={authorAvatarUrl || undefined} />
                    <AvatarFallback className="text-sm gradient-text font-bold">
                      {authorName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {post.authorVerificationStatus === "Student_Verified" && (
                    <VerificationBadge type="green-circle" className="absolute -right-0.5 -bottom-0.5 bg-background rounded-full ring-2 ring-background text-[11px]" />
                  )}
                </span>
              )}
            </AvatarWrapper>

             <div className="flex-1 min-w-0">
               {/* Header */}
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 min-w-0">
                      {authorProfileLink ? (
                        <Link href={authorProfileLink} className="font-semibold hover:text-primary transition-colors truncate">
                          {authorName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-muted-foreground">{authorName}</span>
                      )}
                      {!isAnon && <UserVerificationMarks status={post.authorVerificationStatus} role={post.authorRole} />}
                    </span>
                    {!isAnon && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-white/15 text-muted-foreground">
                        {post.authorLevel}
                      </Badge>
                    )}
                    {isAnon && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-white/20 text-muted-foreground shrink-0 flex items-center gap-0.5">
                        <Ghost className="h-2.5 w-2.5" />
                         Anon Post
                      </Badge>
                    )}
                  </div>
                  {!isAnon && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span className="font-medium text-foreground/70">{post.authorFaculty}</span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5" />
                        {post.authorCampusLocation} Campus
                      </span>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                    </div>
                  )}
                  {isAnon && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                    </div>
                  )}
                </div>

                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                         data-testid={`button-more-post-${post.id}`}
                         aria-label="More post actions"
                         className="h-8 w-8 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                         <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass border-white/10 min-w-[160px]">
                       {isOwner && (
                         <DropdownMenuItem onClick={() => { setEditText(post.content); setEditOpen(true); }} className="gap-2 text-xs cursor-pointer" data-testid={`button-edit-post-${post.id}`}>
                           <Pencil className="h-3.5 w-3.5" /> Edit Post
                         </DropdownMenuItem>
                       )}
                       {isOwner && !isAnon && (
                        <DropdownMenuItem
                          onClick={handlePinToProfile}
                          disabled={pinToProfile.isPending}
                          className="gap-2 text-xs cursor-pointer"
                        >
                          <Pin className="h-3.5 w-3.5" />
                          {post.isPinnedToProfile ? "Unpin from Profile" : "Pin to Profile"}
                        </DropdownMenuItem>
                      )}
                       {moderationMode && (isAdmin || isPrivileged) && (
                        <DropdownMenuItem
                          onClick={handlePinToFeed}
                          disabled={pinToFeed.isPending}
                          className="gap-2 text-xs cursor-pointer"
                        >
                          <Pin className="h-3.5 w-3.5 text-primary" />
                          {post.isPinnedToFeed ? "Unpin from Feed" : "Pin to Feed"}
                        </DropdownMenuItem>
                      )}
                       {!isOwner && (
                         <>
                           <DropdownMenuItem onClick={handleSave} disabled={savePost.isPending} className="gap-2 text-xs cursor-pointer" data-testid={`button-save-post-${post.id}`}>
                             <Bookmark className="h-3.5 w-3.5" /> {post.isSavedByMe ? "Unsave Post" : "Save Post"}
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={handleCopy} className="gap-2 text-xs cursor-pointer" data-testid={`button-copy-post-${post.id}`}>
                             <Link2 className="h-3.5 w-3.5" /> Copy Link
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => { onHide?.(post.id); setHidden(true); }} className="gap-2 text-xs cursor-pointer" data-testid={`button-hide-post-${post.id}`}>
                             <EyeOff className="h-3.5 w-3.5" /> Hide Post
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => setReportOpen(true)} className="gap-2 text-xs cursor-pointer" data-testid={`button-report-post-${post.id}`}>
                             <Flag className="h-3.5 w-3.5" /> Report Post
                           </DropdownMenuItem>
                         </>
                       )}
                       {isPrivileged && (
                         <DropdownMenuItem onClick={handleFeature} disabled={featurePost.isPending} className="gap-2 text-xs cursor-pointer" data-testid={`button-feature-post-${post.id}`}>
                           <Star className="h-3.5 w-3.5" /> {post.isFeaturedTrending ? "Remove from Trending Gist" : "Feature on Trending Gist"}
                         </DropdownMenuItem>
                       )}
                       {(isOwner || canModerate || isPrivileged) && (
                        <>
                          <DropdownMenuSeparator className="bg-white/5" />
                          <DropdownMenuItem
                            data-testid={`btn-delete-post-${post.id}`}
                             onClick={() => setDeleteOpen(true)}
                            className="gap-2 text-xs text-destructive focus:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                             {isPrivileged && !isOwner ? "Delete Post (Admin)" : "Delete Post"}
                          </DropdownMenuItem>
                        </>
                       )}
                    </DropdownMenuContent>
                  </DropdownMenu>
              </div>
             </div>
           </div>

              {category && (
                <div className={cn("mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium", category.pill)}>
                  {category.emoji} {category.label}
                </div>
              )}

              {/* Pin badges */}
               {(post.isPinnedToFeed || post.isPinnedToProfile || post.isFeaturedTrending) && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {post.isPinnedToFeed && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      <Pin className="h-2.5 w-2.5" /> Pinned to Feed
                    </span>
                  )}
                  {post.isPinnedToProfile && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      <Pin className="h-2.5 w-2.5" /> Pinned to Profile
                    </span>
                  )}
                   {post.isFeaturedTrending && (
                     <span data-testid={`badge-featured-post-${post.id}`} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">
                       <Star className="h-2.5 w-2.5" /> Featured on Trending Gist
                     </span>
                   )}
                </div>
              )}

              {/* Original post card-in-card (reshare) */}
              {post.originalPost && (
                <div className="mt-3 rounded-xl border border-primary/20 bg-white/[0.03] p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9 border border-white/10 shrink-0">
                        <AvatarImage src={post.originalPost.authorAvatarUrl || undefined} />
                        <AvatarFallback className={cn("text-xs font-bold gradient-text", post.originalPost.isAnonymous && "bg-violet-500/20")}>
                          {post.originalPost.isAnonymous ? <Ghost className="h-4 w-4 text-violet-300" /> : post.originalPost.authorName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                          {post.originalPost.isAnonymous
                            ? <span className="text-xs font-semibold">{post.originalPost.authorName}</span>
                            : <Link href={`/profile/${post.originalPost.authorId}`} className="text-xs font-semibold hover:text-primary transition-colors">{post.originalPost.authorName}</Link>}
                          {!post.originalPost.isAnonymous && <UserVerificationMarks status={post.originalPost.authorVerificationStatus} />}
                          <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">Original post</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(post.originalPost.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-foreground/80 leading-relaxed break-words line-clamp-4 whitespace-pre-wrap">
                      {post.originalPost.content || <span className="text-muted-foreground italic">No text</span>}
                    </p>
                    {post.originalPost.imageUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-white/10">
                        <LazyBlurImage src={post.originalPost.imageUrl} alt="Original post" className="min-h-[72px] max-h-[200px] bg-black/20" imageClassName="max-h-[200px] object-cover" />
                      </div>
                    )}
                </div>
              )}

              {/* Content */}
              {post.content && (
                <div className={cn("text-sm md:text-base leading-relaxed break-words whitespace-pre-wrap", post.originalPost ? "mt-2 font-medium" : "mt-3")}>
                  {post.content}
                </div>
              )}
              {post.poll && <PollCard poll={post.poll} postId={post.id} authorId={post.authorId} />}

              {post.imageUrl && (
                <LazyBlurImage src={post.imageUrl} blurDataUrl={post.blurDataUrl} alt="Post attachment" className="mt-3 min-h-[160px] max-h-[400px] rounded-xl border border-white/10 bg-black/20" imageClassName="max-h-[400px] object-cover" />
              )}

              {post.videoUrl && (
                <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  <video
                    src={post.videoUrl}
                    controls
                    preload="metadata"
                    className="w-full max-h-[400px] object-contain"
                    style={{ display: "block" }}
                  />
                </div>
              )}

              {/* Reactions */}
              <div className="flex items-center gap-1 mt-4">
                <button
                  data-testid={`btn-fire-${post.id}`}
                  onClick={handleFire}
                  disabled={likePost.isPending}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    fireLit
                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                      : "bg-white/5 text-muted-foreground hover:bg-orange-500/10 hover:text-orange-400 border border-transparent"
                  )}
                >
                  <span className="text-base leading-none">🔥</span>
                  <span>{fireCount > 0 ? fireCount : "Fire"}</span>
                </button>

                <button
                  data-testid={`btn-nocap-${post.id}`}
                  onClick={handleNoCap}
                  disabled={noCapPost.isPending}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    noCapLit
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-white/5 text-muted-foreground hover:bg-blue-500/10 hover:text-blue-400 border border-transparent"
                  )}
                >
                  <span className="text-base leading-none">🧢</span>
                  <span>{noCapCount > 0 ? noCapCount : "No Cap"}</span>
                </button>

                {!(isAnon && isOwner) && (
                  <button
                    data-testid={`btn-reshare-${post.id}`}
                    onClick={() => { setReshareQuoteText(""); setReshareOpen(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all bg-white/5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 border border-transparent"
                  >
                    <Repeat2 className="h-3.5 w-3.5" />
                    <span>{post.reshareCount > 0 ? post.reshareCount : "Reshare"}</span>
                  </button>
                )}

                <button
                  data-testid={`btn-comments-${post.id}`}
                  onClick={() => setCommentsOpen((o) => !o)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ml-auto",
                    commentsOpen
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-white/5 text-muted-foreground hover:bg-primary/10 hover:text-primary border border-transparent"
                  )}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>{commentCount > 0 ? commentCount : "Reply"}</span>
                </button>
              </div>
        </div>

        {/* Reshare Dialog */}
        <Dialog open={reshareOpen} onOpenChange={setReshareOpen}>
          <DialogContent className="sm:max-w-[480px] glass border-primary/20 p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 to-transparent p-5 border-b border-white/5">
              <DialogHeader>
                <DialogTitle className="gradient-text font-bold flex items-center gap-2">
                  <Repeat2 className="h-4 w-4" /> Reshare Gist
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">Add your thoughts (optional) or reshare directly.</p>
              </DialogHeader>
            </div>
            <div className="px-5 pt-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Avatar className="h-5 w-5 border border-white/10 shrink-0">
                    <AvatarImage src={post.originalPost ? post.originalPost.authorAvatarUrl || undefined : post.authorAvatarUrl || undefined} />
                    <AvatarFallback className="text-[9px] font-bold gradient-text">
                      {post.originalPost?.isAnonymous || (!post.originalPost && post.isAnonymous)
                        ? <Ghost className="h-3 w-3 text-violet-300" />
                        : (post.originalPost?.authorName ?? post.authorName).charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-semibold truncate">{post.originalPost?.authorName ?? post.authorName}</span>
                   {!(post.originalPost?.isAnonymous ?? post.isAnonymous) && <UserVerificationMarks status={post.originalPost?.authorVerificationStatus ?? post.authorVerificationStatus} />}
                </div>
                <p className="text-xs text-foreground/70 line-clamp-3 leading-relaxed">
                  {post.originalPost?.content || post.content || <span className="italic text-muted-foreground">No text</span>}
                </p>
              </div>
            </div>
            <div className="p-5 pt-3 space-y-3">
              <Textarea
                placeholder="Add your thought… (leave blank to reshare directly)"
                className="bg-background/40 border-white/10 focus:border-primary/40 resize-none min-h-[80px]"
                value={reshareQuoteText}
                onChange={(e) => setReshareQuoteText(e.target.value)}
              />
              <div className="flex gap-3">
                <Button
                  className="flex-1 gradient-btn h-10 font-semibold"
                  onClick={handleReshare}
                  disabled={resharePostMutation.isPending}
                >
                  {resharePostMutation.isPending ? "Resharing…" : reshareQuoteText.trim() ? "Quote Gist" : "Reshare"}
                </Button>
                <Button variant="outline" className="border-white/10" onClick={() => setReshareOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Comment Section */}
        <AnimatePresence>
          {commentsOpen && (
            <motion.div
              key="comments"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/5 bg-white/[0.02]">
                {commentsData && commentsData.comments.length > 0 && (
                  <div className="max-h-64 overflow-y-auto px-5 pt-4 space-y-3">
                    {commentsData.comments.map((comment: Comment) => (
                      <CommentRow key={comment.id} comment={comment} currentUserId={user?.id} />
                    ))}
                    <div ref={commentsEndRef} />
                  </div>
                )}
                {commentsData && commentsData.comments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No replies yet — be the first to drop something 👇
                  </p>
                )}
                <div className="flex gap-2 p-4 pt-3">
                  <Textarea
                    placeholder="Drop a reply..."
                    className="bg-background/40 border-white/10 focus:border-primary/40 resize-none text-sm min-h-[38px] max-h-[100px] py-2 leading-snug flex-1"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmitComment();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="gradient-btn h-9 w-9 shrink-0 self-end"
                    disabled={!commentText.trim() || createComment.isPending}
                    onClick={handleSubmitComment}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

       <Dialog open={editOpen} onOpenChange={setEditOpen}>
         <DialogContent className="glass border-white/10 sm:max-w-[480px]">
           <DialogHeader><DialogTitle>Edit Post</DialogTitle></DialogHeader>
           <p className="text-xs text-muted-foreground">Edit the text of your post. Media and polls stay as they are.</p>
           <Textarea data-testid={`input-edit-post-${post.id}`} maxLength={500} value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-32 bg-background/40 border-white/10" />
           <span className="text-xs text-muted-foreground text-right">{editText.length}/500</span>
           <div className="flex justify-end gap-2">
             <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
             <Button data-testid={`button-submit-edit-post-${post.id}`} className="gradient-btn" onClick={handleEdit} disabled={!editText.trim() || updatePost.isPending}>Save Changes</Button>
           </div>
         </DialogContent>
       </Dialog>
       <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
         <DialogContent className="glass border-white/10 sm:max-w-[420px]">
           <DialogHeader><DialogTitle>Delete this post?</DialogTitle></DialogHeader>
           <p className="text-sm text-muted-foreground">This will permanently remove the post and its replies. This can't be undone.</p>
           <div className="flex justify-end gap-2">
             <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
             <Button data-testid={`button-confirm-delete-post-${post.id}`} variant="destructive" disabled={deletePost.isPending} onClick={handleDelete}>Delete Post</Button>
           </div>
         </DialogContent>
       </Dialog>
       <Dialog open={reportOpen} onOpenChange={(open) => { setReportOpen(open); if (!open) setReportReason(null); }}>
         <DialogContent className="glass border-white/10 sm:max-w-[420px]">
           <DialogHeader><DialogTitle>Report Post</DialogTitle></DialogHeader>
           <p className="text-sm text-muted-foreground">Tell us what's wrong with this post.</p>
           <div className="space-y-2" role="radiogroup" aria-label="Report reason">
             {reportReasons.map((reason) => (
               <button type="button" role="radio" aria-checked={reportReason === reason} key={reason} onClick={() => setReportReason(reason)} data-testid={`button-report-reason-${reason.replaceAll(" ", "-").toLowerCase()}-${post.id}`} className={cn("w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors", reportReason === reason ? "border-primary bg-primary/10 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/25")}>{reason}</button>
             ))}
           </div>
           <div className="flex justify-end gap-2">
             <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
             <Button className="gradient-btn" data-testid={`button-submit-report-post-${post.id}`} disabled={!reportReason || reportPost.isPending} onClick={handleReport}>Submit Report</Button>
           </div>
         </DialogContent>
       </Dialog>
       {!isAnon && (
        <AvatarModal
          open={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          avatarUrl={authorAvatarUrl}
          name={authorName}
        />
      )}
    </>
  );
}

function CommentRow({ comment, currentUserId }: { comment: Comment; currentUserId?: string }) {
  const isMe = comment.authorId === currentUserId;
  return (
    <div className="flex gap-2.5">
      <div className={cn(
        "h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold border",
        isMe
          ? "bg-primary/20 border-primary/30 text-primary"
          : "bg-white/10 border-white/10 text-foreground/60"
      )}>
        {comment.authorName.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-xs font-semibold leading-none inline-flex items-center gap-1">
            {comment.authorName}
            <UserVerificationMarks status={comment.authorVerificationStatus} />
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm mt-0.5 leading-snug break-words text-foreground/90">{comment.content}</p>
      </div>
    </div>
  );
}
