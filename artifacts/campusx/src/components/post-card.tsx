import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { Heart, MessageSquare, MoreHorizontal, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Post } from "@workspace/api-client-react/src/generated/api.schemas";
import { useDeletePost, useLikePost, getListPostsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const likePost = useLikePost();
  const deletePost = useDeletePost();

  const isOwner = user?.id === post.authorId;

  const handleLike = () => {
    // Optimistic update could go here
    likePost.mutate({ postId: post.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      }
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
      className="glass p-5 rounded-2xl mb-4 group"
    >
      <div className="flex gap-4">
        <Link href={`/profile/${post.authorId}`}>
          <Avatar className="cursor-pointer border border-white/10 hover:border-primary/50 transition-colors">
            <AvatarImage src={post.authorAvatarUrl || undefined} />
            <AvatarFallback>{post.authorName.charAt(0)}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div>
              <Link href={`/profile/${post.authorId}`} className="font-semibold hover:text-primary transition-colors">
                {post.authorName}
              </Link>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{post.authorFaculty} • {post.authorLevel}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
              </div>
            </div>
            {isOwner && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <div className="mt-3 text-sm md:text-base leading-relaxed break-words whitespace-pre-wrap">
            {post.content}
          </div>
          
          {post.imageUrl && (
            <div className="mt-3 rounded-xl overflow-hidden border border-white/10">
              <img src={post.imageUrl} alt="Post attachment" className="w-full h-auto object-cover max-h-[400px]" />
            </div>
          )}
          
          <div className="flex items-center gap-6 mt-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className={`h-8 px-2 flex gap-1.5 ${post.isLikedByMe ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={handleLike}
              disabled={likePost.isPending}
            >
              <Heart className={`h-4 w-4 ${post.isLikedByMe ? 'fill-primary' : ''}`} />
              <span className="text-xs">{post.likesCount > 0 ? post.likesCount : ''}</span>
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2 flex gap-1.5 text-muted-foreground hover:text-foreground">
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
