export const REFRESH_TRIGGER_DISTANCE = 80;
export const MAX_PULL_DISTANCE = 120;
const INTENT_DISTANCE = 20;
const INTERACTIVE_TARGETS = "button, a, input, textarea, select, [contenteditable], [role=button], [role=slider], [role=menuitem]";

type PullHandlers = {
  isRefreshing: () => boolean;
  setDistance: (distance: number) => void;
  refresh: () => void;
};

/** A gesture must start and remain at the exact top; wheel scrolling stays native. */
export function bindPullToRefresh(root: HTMLElement, handlers: PullHandlers) {
  let gesture: { x: number; y: number; ancestors: Element[] } | null = null;
  let distance = 0;

  const atTop = (ancestors: Element[]) =>
    window.scrollY === 0 && ancestors.every((element) => element.scrollTop === 0);

  const cancel = () => {
    gesture = null;
    distance = 0;
    handlers.setDistance(0);
  };

  const touchStart = (event: TouchEvent) => {
    cancel();
    if (event.touches.length !== 1 || handlers.isRefreshing()) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(INTERACTIVE_TARGETS)) return;
    const ancestors: Element[] = [];
    for (let node: Element | null = target; node; node = node.parentElement) {
      ancestors.push(node);
    }
    // Include the wrapper explicitly, even if an event is retargeted.
    if (!ancestors.includes(root)) ancestors.push(root);
    if (!atTop(ancestors)) return;
    gesture = { x: event.touches[0].clientX, y: event.touches[0].clientY, ancestors };
  };

  const touchMove = (event: TouchEvent) => {
    if (!gesture) return;
    if (event.touches.length !== 1 || handlers.isRefreshing() || !atTop(gesture.ancestors)) {
      cancel();
      return;
    }
    const deltaY = event.touches[0].clientY - gesture.y;
    const deltaX = event.touches[0].clientX - gesture.x;
    // Once scrolling up/sideways, don't re-arm later in the same gesture.
    if (deltaY < 0 || (Math.abs(deltaX) >= INTENT_DISTANCE && Math.abs(deltaX) >= deltaY)) {
      cancel();
      return;
    }
    if (deltaY < INTENT_DISTANCE || deltaY < Math.abs(deltaX) * 1.25) {
      distance = 0;
      handlers.setDistance(0);
      return;
    }
    if (!event.cancelable) {
      cancel();
      return;
    }
    event.preventDefault();
    distance = Math.min(MAX_PULL_DISTANCE, deltaY);
    handlers.setDistance(distance);
  };

  const finish = () => {
    const shouldRefresh = gesture !== null && atTop(gesture.ancestors) &&
      distance >= REFRESH_TRIGGER_DISTANCE && !handlers.isRefreshing();
    cancel();
    if (shouldRefresh) handlers.refresh();
  };

  const onScroll = () => {
    if (gesture && !atTop(gesture.ancestors)) cancel();
  };

  root.addEventListener("touchstart", touchStart, { passive: true });
  root.addEventListener("touchmove", touchMove, { passive: false });
  root.addEventListener("touchend", finish);
  root.addEventListener("touchcancel", cancel);
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  return () => {
    root.removeEventListener("touchstart", touchStart);
    root.removeEventListener("touchmove", touchMove);
    root.removeEventListener("touchend", finish);
    root.removeEventListener("touchcancel", cancel);
    window.removeEventListener("scroll", onScroll, true);
  };
}
