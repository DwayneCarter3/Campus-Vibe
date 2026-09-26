import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGER_DISTANCE = 64;
const MAX_DISTANCE = 96;

type PullToRefreshProps = {
  children: ReactNode;
  className?: string;
  onRefresh: () => Promise<unknown>;
};

/** Refresh the currently visible list when a touch drag or trackpad pull starts at the top. */
export function PullToRefresh({ children, className, onRefresh }: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef(onRefresh);
  const distanceRef = useRef(0);
  const runningRef = useRef(false);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  refreshRef.current = onRefresh;

  const setPullDistance = useCallback((value: number) => {
    const limited = Math.min(MAX_DISTANCE, Math.max(0, value));
    distanceRef.current = limited;
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
    let start: { x: number; y: number } | null = null;
    let wheelDistance = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      start = null;
      if (distanceRef.current >= TRIGGER_DISTANCE) void refresh();
      else setPullDistance(0);
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || window.scrollY > 2 || runningRef.current) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const touchMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const deltaY = event.touches[0].clientY - start.y;
      const deltaX = event.touches[0].clientX - start.x;
      if (window.scrollY > 2 || deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
        setPullDistance(0);
        return;
      }
      if (deltaY < 8) return;
      if (event.cancelable) event.preventDefault();
      setPullDistance(deltaY * 0.48);
    };
    const wheel = (event: WheelEvent) => {
      if (runningRef.current || window.scrollY > 2 || event.deltaY >= 0 || event.ctrlKey) {
        wheelDistance = 0;
        if (wheelTimer) clearTimeout(wheelTimer);
        wheelTimer = null;
        setPullDistance(0);
        return;
      }
      if (event.cancelable) event.preventDefault();
      wheelDistance = Math.min(240, wheelDistance - event.deltaY);
      setPullDistance(wheelDistance * 0.48);
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelDistance = 0;
        if (distanceRef.current >= TRIGGER_DISTANCE) void refresh();
        else setPullDistance(0);
      }, 180);
    };

    root.addEventListener("touchstart", touchStart, { passive: true });
    root.addEventListener("touchmove", touchMove, { passive: false });
    root.addEventListener("touchend", finish);
    const cancel = () => {
      start = null;
      setPullDistance(0);
    };
    root.addEventListener("touchcancel", cancel);
    root.addEventListener("wheel", wheel, { passive: false });
    return () => {
      root.removeEventListener("touchstart", touchStart);
      root.removeEventListener("touchmove", touchMove);
      root.removeEventListener("touchend", finish);
      root.removeEventListener("touchcancel", cancel);
      root.removeEventListener("wheel", wheel);
      if (wheelTimer) clearTimeout(wheelTimer);
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
            : <ArrowDown className={cn("h-4 w-4 text-primary transition-transform", distance >= TRIGGER_DISTANCE && "rotate-180")} />}
        <span>{refreshing ? "Refreshing…" : failed ? "Couldn't refresh. Pull to retry." : distance >= TRIGGER_DISTANCE ? "Release to refresh" : "Pull to refresh"}</span>
      </div>
      {children}
    </div>
  );
}