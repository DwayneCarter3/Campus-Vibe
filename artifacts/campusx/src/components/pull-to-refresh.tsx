import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { bindPullToRefresh, MAX_PULL_DISTANCE, REFRESH_TRIGGER_DISTANCE } from "@/lib/pull-to-refresh-gesture";

type PullToRefreshProps = {
  children: ReactNode;
  className?: string;
  onRefresh: () => Promise<unknown>;
};

/** Refresh the visible list only after an intentional touch pull from the exact top. */
export function PullToRefresh({ children, className, onRefresh }: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef(onRefresh);
  const runningRef = useRef(false);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  refreshRef.current = onRefresh;

  const setPullDistance = useCallback((value: number) => {
    const limited = Math.min(MAX_PULL_DISTANCE, Math.max(0, value));
    setDistance(limited);
  }, []);

  const refresh = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setFailed(false);
    setPullDistance(0);
    setRefreshing(true);
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    try {
      // Keep the indicator visible long enough to register even on a warm cache.
      const [result] = await Promise.all([
        refreshRef.current(),
        new Promise<void>((resolve) => setTimeout(resolve, 350)),
      ]);
      if (result && typeof result === "object" && "isError" in result && result.isError) {
        throw new Error("Refresh failed");
      }
    } catch {
      setFailed(true);
      messageTimerRef.current = setTimeout(() => setFailed(false), 2500);
    } finally {
      runningRef.current = false;
      setRefreshing(false);
    }
  }, [setPullDistance]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const unbind = bindPullToRefresh(root, {
      isRefreshing: () => runningRef.current,
      setDistance: setPullDistance,
      refresh: () => { void refresh(); },
    });
    return () => {
      unbind();
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, [refresh, setPullDistance]);

  const visible = distance > 0 || refreshing || failed;
  return (
    <div ref={rootRef} className={className}>
      <div
        role="status"
        aria-live="polite"
        aria-hidden={!visible}
        className={cn(
          "pointer-events-none fixed left-1/2 top-[4.5rem] z-40 flex items-center gap-2 rounded-full border border-primary/25 bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-[opacity,transform] duration-150",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: `translate(-50%, ${Math.round(distance / 3)}px)` }}
      >
        {refreshing
          ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
          : failed
            ? <RotateCcw className="h-4 w-4 text-destructive" />
            : <ArrowDown className={cn("h-4 w-4 text-primary transition-transform", distance >= REFRESH_TRIGGER_DISTANCE && "rotate-180")} />}
        <span>{refreshing ? "Refreshing…" : failed ? "Couldn't refresh. Pull to retry." : distance >= REFRESH_TRIGGER_DISTANCE ? "Release to refresh" : "Pull to refresh"}</span>
      </div>
      {children}
    </div>
  );
}