import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { Trash2, MapPin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeletePost, useLikePost, useNoCapPost, getListPostsQueryKey } from "@workspace/api-client-react";
import type { Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
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

  const [optimisticFire, setOptimisticFire] = useState<{ active: boolean; count: number } | null>(null);
  const [optimisticNoCap, setOptimisticNoCap] = useState<{ active: boolean; count: number } | null>(null);

  const isOwner = user?.id === post.authorId;

  const fireLit = optimisticFire !== null ? optimisticFire.active : post.isLikedByMe;
  const fireCount = optimisticFire !== null ? optimisticFire.count : post.likesCount;
  const noCapLit = optimisticNoCap !== null ? optimisticNoCap.active : post.isNoCapByMe;
  const noCapCount = optimisticNoCap !== null ? optimisticNoCap.count : post.noCapsCount;

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid={`card-post-${post.id}`}
      className="glass p-5 rounded-2xl mb-4 group border border-white/5 hover:border-primary/20 transition-colors"
    >
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

          {/* Reactions */}
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
          </div>
        </div>
      </div>
    </motion.div>
  );
}
