import { useState, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { Trash2, MapPin, MessageCircle, Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeletePost,
  useLikePost,
  useNoCapPost,
  useListPostComments,
  useCreatePostComment,
  getListPostsQueryKey,
  getListPostCommentsQueryKey,
} from "@workspace/api-client-react";
import type { Post, Comment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const likePost = useLikePost();
  const noCapPost = useNoCapPost();
  const deletePost = useDeletePost();
  const createComment = useCreatePostComment();

  const [optimisticFire, setOptimisticFire] = useState<{ active: boolean; count: number } | null>(null);
  const [optimisticNoCap, setOptimisticNoCap] = useState<{ active: boolean; count: number } | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
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

  const isOwner = user?.id === post.authorId;

  const fireLit = optimisticFire !== null ? optimisticFire.active : post.isLikedByMe;
  const fireCount = optimisticFire !== null ? optimisticFire.count : post.likesCount;
  const noCapLit = optimisticNoCap !== null ? optimisticNoCap.active : post.isNoCapByMe;
  const noCapCount = optimisticNoCap !== null ? optimisticNoCap.count : post.noCapsCount;
  const commentCount = post.commentsCount;

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

  const handleDelete = () => {
    if (confirm("Delete this post?")) {
      deletePost.mutate({ postId: post.id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
        }
      });
    }
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid={`card-post-${post.id}`}
      className="glass rounded-2xl mb-4 group border border-white/5 hover:border-primary/20 transition-colors overflow-hidden"
    >
      <div className="p-5">
        <div className="flex gap-3">
          <Link href={`/profile/${post.authorId}`}>
            <Avatar className="cursor-pointer border border-white/10 hover:border-primary/50 transition-colors shrink-0 h-10 w-10">
              <AvatarImage src={post.authorAvatarUrl || undefined} />
              <AvatarFallback className="text-sm gradient-text font-bold">
                {post.authorName.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </Link>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/profile/${post.authorId}`} className="font-semibold hover:text-primary transition-colors truncate">
                    {post.authorName}
                  </Link>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary shrink-0">
                    {post.authorLevel}
                  </Badge>
                </div>
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
              </div>

              {isOwner && (
                <Button
                  data-testid={`btn-delete-post-${post.id}`}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Content */}
            <div className="mt-3 text-sm md:text-base leading-relaxed break-words whitespace-pre-wrap">
              {post.content}
            </div>

            {post.imageUrl && (
              <div className="mt-3 rounded-xl overflow-hidden border border-white/10">
                <img src={post.imageUrl} alt="Post attachment" className="w-full h-auto object-cover max-h-[400px]" />
              </div>
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

            {/* Reactions + Comment toggle */}
            <div className="flex items-center gap-1 mt-4">
              {/* 🔥 Fire */}
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

              {/* 🧢 No Cap */}
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

              {/* 💬 Comments */}
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
        </div>
      </div>

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
              {/* Scrollable comment list */}
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

              {/* Comment input */}
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
          <span className="text-xs font-semibold leading-none">{comment.authorName}</span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/25 text-primary/80 leading-none">
            {comment.authorLevel}
          </Badge>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm mt-0.5 leading-snug break-words text-foreground/90">{comment.content}</p>
      </div>
    </div>
  );
}
