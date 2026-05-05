import { useState, useEffect } from "react";
import { useListPosts, useCreatePost, getListPostsQueryKey, useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Image as ImageIcon, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function FeedPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  // Check profile existence
  const { data: profile, isLoading: isProfileLoading, error: profileError } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() }
  });

  const { data, isLoading } = useListPosts(undefined, {
    query: { queryKey: getListPostsQueryKey() }
  });
  
  const createPost = useCreatePost();
  const [content, setContent] = useState("");

  useEffect(() => {
    // If no profile data or 404, redirect to onboarding
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

  if (isProfileLoading) {
    return <div className="flex-1 flex justify-center pt-20"><Skeleton className="h-10 w-10 rounded-full" /></div>;
  }

  return (
    <div className="container mx-auto px-4 max-w-2xl py-8">
      {/* Create Post Box */}
      <div className="glass rounded-2xl p-4 mb-8">
        <div className="flex gap-4">
          <Avatar>
            <AvatarImage src={profile?.avatarUrl || undefined} />
            <AvatarFallback>{profile?.fullName?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-3">
            <Textarea 
              placeholder="What's happening on campus?" 
              className="bg-transparent border-none shadow-none focus-visible:ring-0 resize-none text-base placeholder:text-muted-foreground min-h-[80px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div className="flex gap-2 text-muted-foreground">
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary rounded-full">
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </div>
              <Button 
                className="gradient-btn rounded-full px-6 h-9" 
                onClick={handlePost} 
                disabled={!content.trim() || createPost.isPending}
              >
                {createPost.isPending ? "Posting..." : "Post"}
                <Sparkles className="h-3 w-3 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass p-5 rounded-2xl space-y-4">
              <div className="flex gap-4 items-center">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-20 w-full" />
            </div>
          ))
        ) : data?.posts.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-dashed border-white/10 rounded-2xl">
            <p>No posts yet. Be the first to share campus gist!</p>
          </div>
        ) : (
          data?.posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))
        )}
      </div>
    </div>
  );
}
