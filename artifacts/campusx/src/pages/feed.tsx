import { useState, useRef } from "react";
import { useListPosts, useCreatePost, getListPostsQueryKey, useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Radio } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const TRENDING_BUBBLES = [
  { id: "shuttle", label: "Shuttle Updates", emoji: "🚌", color: "from-orange-500/20 to-orange-500/5 border-orange-500/30 hover:border-orange-500/60" },
  { id: "portal", label: "Portal Down", emoji: "💻", color: "from-red-500/20 to-red-500/5 border-red-500/30 hover:border-red-500/60" },
  { id: "exam", label: "Exam Timetable", emoji: "📅", color: "from-blue-500/20 to-blue-500/5 border-blue-500/30 hover:border-blue-500/60" },
  { id: "amebo", label: "Amebo Hot", emoji: "🌶️", color: "from-pink-500/20 to-pink-500/5 border-pink-500/30 hover:border-pink-500/60" },
];

export default function FeedPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeBubble, setActiveBubble] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: profile, isLoading: isProfileLoading, error: profileError } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() }
  });

  const { data, isLoading } = useListPosts(undefined, {
    query: { queryKey: getListPostsQueryKey() }
  });

  const createPost = useCreatePost();
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!isProfileLoading && (profileError || (profile && !profile.fullName))) {
      setLocation("/onboarding");
    }
  }, [profile, isProfileLoading, profileError, setLocation]);

  const handlePost = () => {
    if (!content.trim()) return;
    createPost.mutate({ data: { content } }, {
      onSuccess: () => {
        setContent("");
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handlePost();
    }
  };

  if (isProfileLoading) {
    return <div className="flex-1 flex justify-center pt-20"><Skeleton className="h-10 w-10 rounded-full" /></div>;
  }

  return (
    <div className="container mx-auto px-4 max-w-2xl py-6">

      {/* Trending Gist Header + LIVE badge */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-base tracking-tight">Trending Gist</h2>
          <Badge className="bg-red-500 text-white text-[10px] px-2 py-0.5 h-auto rounded-full flex items-center gap-1 animate-pulse border-0">
            <Radio className="h-2.5 w-2.5" />
            LIVE
          </Badge>
        </div>
      </div>

      {/* Trending Bubbles — horizontal scroll */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-3 mb-6 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {TRENDING_BUBBLES.map((bubble, i) => (
          <motion.button
            key={bubble.id}
            data-testid={`btn-trending-${bubble.id}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.07 }}
            onClick={() => setActiveBubble(activeBubble === bubble.id ? null : bubble.id)}
            className={cn(
              "flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border bg-gradient-to-b transition-all cursor-pointer",
              bubble.color,
              activeBubble === bubble.id ? "scale-105 shadow-lg shadow-primary/10" : ""
            )}
          >
            <div className="text-2xl leading-none">{bubble.emoji}</div>
            <span className="text-xs font-medium whitespace-nowrap text-foreground/90">{bubble.label}</span>
            {activeBubble === bubble.id && (
              <div className="h-1 w-1 rounded-full bg-primary" />
            )}
          </motion.button>
        ))}
      </div>

      {/* Create Post Box */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-4 mb-6 border border-white/5 hover:border-primary/20 transition-colors"
      >
        <div className="flex gap-3">
          <Avatar className="h-9 w-9 shrink-0 border border-white/10">
            <AvatarImage src={profile?.avatarUrl || undefined} />
            <AvatarFallback className="text-sm gradient-text font-bold">
              {profile?.fullName?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-3">
            {/* Name + level tag above textarea */}
            {profile && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/80">{profile.fullName}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary">
                  {profile.level}
                </Badge>
                <span>•</span>
                <span>{profile.campusLocation} Campus</span>
              </div>
            )}
            <Textarea
              data-testid="input-post-content"
              placeholder="What's happening on campus?"
              className="bg-transparent border-none shadow-none focus-visible:ring-0 resize-none text-sm placeholder:text-muted-foreground min-h-[72px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <span className="text-xs text-muted-foreground">Ctrl+Enter to post</span>
              <Button
                data-testid="btn-create-post"
                className="gradient-btn rounded-full px-5 h-8 text-sm"
                onClick={handlePost}
                disabled={!content.trim() || createPost.isPending}
              >
                {createPost.isPending ? "Posting..." : "Post Gist"}
                <Sparkles className="h-3 w-3 ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Feed Header */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-bold text-base">Campus Gist</h2>
        {data && (
          <span className="text-xs text-muted-foreground">({data.total} posts)</span>
        )}
      </div>

      {/* Feed */}
      <div className="space-y-1">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass p-5 rounded-2xl space-y-4 mb-4">
              <div className="flex gap-3 items-center">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-16 w-full" />
              <div className="flex gap-3">
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
            </div>
          ))
        ) : data?.posts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 text-muted-foreground border border-dashed border-white/10 rounded-2xl"
          >
            <div className="text-4xl mb-3">🎙️</div>
            <p className="font-medium">No gist yet on campus.</p>
            <p className="text-sm mt-1">Be the first to drop something.</p>
          </motion.div>
        ) : (
          data?.posts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <PostCard post={post} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
