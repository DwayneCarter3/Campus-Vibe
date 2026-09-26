import { useState, useRef, useCallback, useEffect } from "react";
import { useListPosts, useCreatePost, getListPostsQueryKey, useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Radio, Camera, Video, X, Loader2, Ghost, BarChart3, Plus, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { UserVerificationMarks } from "@/components/user-verification-marks";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { POST_CATEGORIES, type PostCategory } from "@/components/post-categories";

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
  const [activeBubble, setActiveBubble] = useState("all");
  const [postCategory, setPostCategory] = useState<PostCategory | "All">("Amebo Hot");
  const activeCategory = POST_CATEGORIES.find((bubble) => bubble.id === activeBubble)?.category;
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading: isProfileLoading, error: profileError } = useGetMyProfile({
    query: { retry: false, queryKey: getGetMyProfileQueryKey() }
  });

  const { data, isLoading, refetch } = useListPosts({ category: activeCategory }, {
    query: { queryKey: getListPostsQueryKey({ category: activeCategory }), refetchInterval: 10_000 }
  });

  const createPost = useCreatePost();
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaUpload | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [postError, setPostError] = useState<string | null>(null);

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
    if (createPost.isPending || isUploading || (!content.trim() && !media && !pollEnabled)) return;
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim());
    if (pollEnabled) {
      if (!question || question.length > 240) {
        setPostError("Add a poll question (up to 240 characters).");
        return;
      }
      if (options.length < 2 || options.length > 4 || options.some((option) => !option || option.length > 100)) {
        setPostError("Add 2–4 options, each up to 100 characters.");
        return;
      }
      if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) {
        setPostError("Each poll option needs to be different.");
        return;
      }
    }
    setPostError(null);
    const publishedCategory = postCategory === "All" ? "Amebo Hot" : postCategory;
    createPost.mutate({
      data: {
        content: content.trim(),
        category: publishedCategory,
        imageUrl: media?.type === "image" ? media.url : null,
        videoUrl: media?.type === "video" ? media.url : null,
        isAnonymous,
        ...(pollEnabled ? { poll: { question, options } } : {}),
      }
    }, {
      onSuccess: () => {
        setContent("");
        setActiveBubble(POST_CATEGORIES.find((item) => item.category === publishedCategory)?.id ?? "all");
        setPostCategory("Amebo Hot");
        setIsAnonymous(true);
        setPollEnabled(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setPostError(null);
        clearMedia();
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      },
      onError: () => setPostError("Couldn't publish your post. Please try again."),
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
    <PullToRefresh className="container mx-auto px-4 max-w-2xl py-6" onRefresh={() => refetch()}>

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
        {POST_CATEGORIES.map((bubble, i) => (
          <motion.button
            key={bubble.id}
            data-testid={`btn-trending-${bubble.id}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.07 }}
            onClick={() => setActiveBubble(bubble.id)}
            aria-pressed={activeBubble === bubble.id}
            className={cn(
              "flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border bg-gradient-to-b transition-all cursor-pointer",
              bubble.color,
              activeBubble === bubble.id && "border-primary/80 ring-1 ring-primary/60 shadow-[0_0_24px_rgba(236,72,153,0.28)]"
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
          <Avatar className={cn("h-9 w-9 shrink-0 border border-white/10", isAnonymous && "bg-violet-500/20 border-violet-400/30")}>
            <AvatarImage src={isAnonymous ? undefined : profile?.avatarUrl || undefined} />
            <AvatarFallback className="text-sm gradient-text font-bold">
              {isAnonymous ? <Ghost className="h-4 w-4 text-violet-300" /> : profile?.fullName?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-3">
            {/* Name + level tag above textarea */}
            {profile && (isAnonymous ? (
              <div className="text-xs font-semibold text-violet-300">Posting as Anonymous LASUite</div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/80 inline-flex items-center gap-1">
                  {profile.fullName}
                  <UserVerificationMarks status={profile.verificationStatus} />
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary">
                  {profile.level}
                </Badge>
                <span>•</span>
                <span>{profile.campusLocation} Campus</span>
              </div>
            ))}
            <Textarea
              data-testid="input-post-content"
              placeholder="What's happening on campus?"
              className="bg-transparent border-none shadow-none focus-visible:ring-0 resize-none text-sm placeholder:text-muted-foreground min-h-[72px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="space-y-1.5" aria-label="Post category">
              <span className="text-[11px] font-semibold text-muted-foreground">Post category</span>
              <div className="flex flex-wrap gap-1.5">
                {POST_CATEGORIES.map((item) => {
                  const value = item.category ?? "All";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={postCategory === value}
                      onClick={() => {
                        setPostCategory(value);
                        setIsAnonymous(value === "Amebo Hot" || value === "All");
                      }}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        postCategory === value
                          ? "border-primary/70 bg-primary/15 text-primary"
                          : "border-white/10 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      {item.emoji} {item.label}
                    </button>
                  );
                })}
              </div>
              {postCategory === "All" && <p className="text-[11px] text-muted-foreground">All Gist is a feed view. This post will be tagged Amebo Hot.</p>}
            </div>

            {pollEnabled && (
              <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-3 space-y-3" data-testid="composer-poll">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><BarChart3 className="h-3.5 w-3.5" /> 24-hour poll</span>
                  <button type="button" data-testid="button-remove-poll" aria-label="Remove poll" onClick={() => { setPollEnabled(false); setPostError(null); }} className="text-muted-foreground hover:text-foreground p-1 rounded-md"><X className="h-4 w-4" /></button>
                </div>
                <input
                  data-testid="input-poll-question"
                  aria-label="Poll question"
                  maxLength={240}
                  value={pollQuestion}
                  onChange={(e) => { setPollQuestion(e.target.value); setPostError(null); }}
                  placeholder="Ask the campus a question"
                  className="w-full rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                />
                <div className="space-y-2">
                  {pollOptions.map((option, index) => (
                    <div className="flex items-center gap-2" key={index}>
                      <input
                        data-testid={`input-poll-option-${index}`}
                        aria-label={`Poll option ${index + 1}`}
                        maxLength={100}
                        value={option}
                        onChange={(e) => { setPollOptions((current) => current.map((item, i) => i === index ? e.target.value : item)); setPostError(null); }}
                        placeholder={`Option ${index + 1}`}
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary/50 placeholder:text-muted-foreground"
                      />
                      {pollOptions.length > 2 && (
                        <button type="button" data-testid={`button-remove-poll-option-${index}`} aria-label={`Remove option ${index + 1}`} onClick={() => { setPollOptions((current) => current.filter((_, i) => i !== index)); setPostError(null); }} className="p-2 text-muted-foreground hover:text-destructive rounded-lg"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 4 && (
                  <button type="button" data-testid="button-add-poll-option" onClick={() => setPollOptions((current) => [...current, ""])} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"><Plus className="h-3.5 w-3.5" /> Add Option</button>
                )}
                <p className="text-[11px] text-muted-foreground">Voting stays open for 24 hours. Results appear after you vote or when the poll ends.</p>
              </div>
            )}

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
                   disabled={isUploading || !!media || pollEnabled}
                  onClick={() => imageInputRef.current?.click()}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                     media || pollEnabled
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
                   disabled={isUploading || !!media || pollEnabled}
                  onClick={() => videoInputRef.current?.click()}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                     media || pollEnabled
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground hover:text-pink-400 hover:bg-pink-500/10"
                  )}
                >
                  <Video className="h-4 w-4" />
                  <span className="hidden sm:inline">Video</span>
                </button>
                <button
                  type="button"
                  data-testid="button-create-poll"
                  title="Create Poll"
                  aria-pressed={pollEnabled}
                  disabled={isUploading || !!media}
                  onClick={() => { setPollEnabled((enabled) => !enabled); setPostError(null); }}
                  className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all", pollEnabled ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-primary hover:bg-primary/10")}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Poll</span>
                </button>

                {/* Anonymous toggle */}
                <button
                  type="button"
                  title="Post anonymously"
                  aria-label="Post anonymously"
                  aria-pressed={isAnonymous}
                  onClick={() => setIsAnonymous((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                    isAnonymous
                      ? "bg-violet-500/15 text-violet-300 border-violet-400/50 shadow-[0_0_12px_rgba(167,139,250,0.18)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5 border-transparent"
                  )}
                >
                  <Ghost className="h-4 w-4" />
                  <span>{isAnonymous ? "Anon on" : "Anon?"}</span>
                </button>
              </div>
              <Button
                data-testid="btn-create-post"
                className="gradient-btn rounded-full px-5 h-8 text-sm"
                onClick={handlePost}
                 disabled={(!content.trim() && !media && !pollEnabled) || createPost.isPending || isUploading}
              >
                {createPost.isPending ? "Posting..." : isAnonymous ? "Post Anon 👻" : "Post Gist"}
                <Sparkles className="h-3 w-3 ml-1.5" />
              </Button>
            </div>
            {postError && <p role="alert" data-testid="error-create-post" className="text-xs text-destructive">{postError}</p>}
          </div>
        </div>
      </motion.div>

      {/* Feed Header */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-bold text-base">
          {activeCategory ? activeCategory === "Amebo Hot" ? "Amebo Hot Posts" : `${activeCategory} Gist` : "Campus Gist"}
        </h2>
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
            <p className="font-medium">{activeCategory ? "No posts in this category yet. Be the first to share an update!" : "No gist yet on campus."}</p>
            {!activeCategory && <p className="text-sm mt-1">Be the first to drop something.</p>}
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
    </PullToRefresh>
  );
}
