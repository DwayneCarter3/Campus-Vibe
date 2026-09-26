import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { useGetPost, getGetPostQueryKey } from "@workspace/api-client-react";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const postId = Number(id);
  const validId = Number.isSafeInteger(postId) && postId > 0;
  const { data: post, isLoading, isError, refetch } = useGetPost(validId ? postId : 0, {
    query: { queryKey: getGetPostQueryKey(validId ? postId : 0), enabled: validId, retry: false },
  });

  return (
    <main className="container mx-auto max-w-2xl px-4 py-6 min-h-[60dvh]">
      <Link href="/feed" data-testid="link-back-to-feed" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to Gist
      </Link>
      <div className="mb-5">
        <span className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold">Campus conversation</span>
        <h1 className="text-2xl font-bold tracking-tight mt-1">Post detail</h1>
      </div>
      {isLoading ? (
        <div className="glass rounded-2xl p-5 space-y-5 border border-white/5">
          <div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-20" /></div></div>
          <Skeleton className="h-24 w-full" /><Skeleton className="h-8 w-48" />
        </div>
      ) : !validId || isError || !post ? (
        <div role="alert" className="glass rounded-2xl border border-white/10 p-10 text-center">
          <FileQuestion className="h-8 w-8 text-primary mx-auto mb-4" />
          <h2 className="font-semibold">This post isn't available</h2>
          <p className="text-sm text-muted-foreground mt-2">It may have been removed, or this link may be incorrect.</p>
          <div className="mt-5 flex justify-center gap-2">
            {validId && <Button variant="outline" onClick={() => refetch()}>Try again</Button>}
            <Link href="/feed" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">See the feed</Link>
          </div>
        </div>
      ) : <PostCard post={post} onDeleted={() => setLocation("/feed")} />}
    </main>
  );
}