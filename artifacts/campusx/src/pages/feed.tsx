import { useState, useRef, useCallback, useEffect } from "react";
import { useListPosts, useCreatePost, getListPostsQueryKey, useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Radio, Camera, Video, X, Loader2, Ghost } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const TRENDING_BUBBLES = [
  { id: "shuttle", label: "Shuttle Updates", emoji: "🚌", color: "from-orange-500/20 to-orange-500/5 border-orange-500/30 hover:border-orange-500/60" },
  { id: "portal", label: "Portal Down", emoji: "💻", color: "from-red-500/20 to-red-500/5 border-red-500/30 hover:border-red-500/60" },
  { id: "exam", label: "Exam Timetable", emoji: "📅", color: "from-blue-500/20 to-blue-500/5 border-blue-500/30 hover:border-blue-500/60" },
  { id: "amebo", label: "Amebo Hot", emoji: "🌶️", color: "from-pink-500/20 to-pink-500/5 border-pink-500/30 hover:border-pink-500/60" },
];

type MediaUpload = {
  type: "image" | "video";
  url: string;
  previewUrl: string;
};

async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json();
}

async function uploadToPresignedUrl(file: File, uploadURL: string): Promise<void> {
  const res = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!res.ok) throw new Error("Upload failed");
}

export default function FeedPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [activeBubble, setActiveBubble] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading: isProfileLoading, error: profileError } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() }
  });

  const { data, isLoading } = useListPosts(undefined, {
    query: { queryKey: getListPostsQueryKey() }
  });

  const createPost = useCreatePost();
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaUpload | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);

  useEffect(() => {
    if (!isProfileLoading && (profileError || (profile && !profile.fullName))) {
      setLocation("/onboarding");
    }
  }, [profile, isProfileLoading, profileError, setLocation]);

  const handleFileSelect = useCallback(async (file: File, type: "image" | "video") => {
    setUploadError(null);
    setIsUploading(true);
    const previewUrl = URL.createObjectURL(file);
    try {
      const { uploadURL, objectPath } = await requestUploadUrl(file);
      await uploadToPresignedUrl(file, uploadURL);
      const servingUrl = `/api/storage${objectPath}`;
      setMedia({ type, url: servingUrl, previewUrl });
    } catch {
      setUploadError("Upload failed. Please try again.");
      URL.revokeObjectURL(previewUrl);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const clearMedia = useCallback(() => {
    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
    setMedia(null);
    setUploadError(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  }, [media]);

  const handlePost = () => {
    if (!content.trim() && !media) return;
    createPost.mutate({
      data: {
        content,
        imageUrl: media?.type === "image" ? media.url : null,
        videoUrl: media?.type === "video" ? media.url : null,
        isAnonymous,
      } as any
    }, {
      onSuccess: () => {
        setContent("");
        setIsAnonymous(false);
        clearMedia();
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

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file, "image");
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file, "video");
        }}
      />

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

            {/* Media preview */}
            <AnimatePresence>
              {isUploading && (
                <motion.div
                  key="uploading"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="flex items-center gap-2 text-xs text-muted-foreground py-2 px-3 bg-white/5 rounded-xl border border-white/10"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Uploading media…</span>
                </motion.div>
              )}
              {!isUploading && media && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="relative rounded-xl overflow-hidden border border-white/10 bg-black/30"
                >
                  {media.type === "image" ? (
                    <img
                      src={media.previewUrl}
                      alt="Preview"
                      className="w-full max-h-[260px] object-cover"
                    />
                  ) : (
                    <video
                      src={media.previewUrl}
                      controls
                      preload="metadata"
                      className="w-full max-h-[260px] object-contain"
                      style={{ display: "block" }}
                    />
                  )}
                  <button
                    onClick={clearMedia}
                    className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                  <div className="absolute bottom-2 left-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded-full">
                    {media.type === "image" ? "📷 Photo" : "🎥 Video"}
                  </div>
                </motion.div>
              )}
              {!isUploading && uploadError && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-destructive px-1"
                >
                  {uploadError}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              {/* Media icon buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Add photo"
                  disabled={isUploading || !!media}
                  onClick={() => imageInputRef.current?.click()}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                    media
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                  )}
                >
                  <Camera className="h-4 w-4" />
                  <span className="hidden sm:inline">Photo</span>
                </button>
                <button
                  type="button"
                  title="Add video"
                  disabled={isUploading || !!media}
                  onClick={() => videoInputRef.current?.click()}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                    media
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground hover:text-pink-400 hover:bg-pink-500/10"
                  )}
                >
                  <Video className="h-4 w-4" />
                  <span className="hidden sm:inline">Video</span>
                </button>

                {/* Anonymous toggle */}
                <button
                  type="button"
                  title="Post anonymously"
                  onClick={() => setIsAnonymous((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                    isAnonymous
                      ? "bg-white/10 text-foreground border-white/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5 border-transparent"
                  )}
                >
                  <Ghost className="h-4 w-4" />
                  <span className="hidden sm:inline">{isAnonymous ? "Anonymous" : "Anon?"}</span>
                </button>
              </div>
              <Button
                data-testid="btn-create-post"
                className="gradient-btn rounded-full px-5 h-8 text-sm"
                onClick={handlePost}
                disabled={(!content.trim() && !media) || createPost.isPending || isUploading}
              >
                {createPost.isPending ? "Posting..." : isAnonymous ? "Post Anon 👻" : "Post Gist"}
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
              <PostCard post={post} isAdmin={profile?.isAdmin} isModerator={profile?.role === "moderator"} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
