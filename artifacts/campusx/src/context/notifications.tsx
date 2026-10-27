import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useUser } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  getListNotificationsQueryKey,
  getListConversationsQueryKey,
  getListMessagesQueryKey,
  useListNotifications,
  markNotificationsRead,
} from "@workspace/api-client-react";
import type { AppNotification } from "@workspace/api-client-react";
import { NotificationPollTracker } from "./notification-polling";

interface NotificationsCtx {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: () => void;
  isLoading: boolean;
}

const NotificationsContext = createContext<NotificationsCtx>({
  notifications: [],
  unreadCount: 0,
  markRead: () => {},
  isLoading: false,
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

function playPopSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 500);
  } catch {
    // AudioContext not available (e.g. during SSR or blocked by browser)
  }
}

const EMOJI: Record<string, string> = {
  fire: "🔥",
  nocap: "🧢",
  whatsapp: "💰",
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const tracker = useRef(new NotificationPollTracker());

  const { data, isLoading, refetch } = useListNotifications(
    { limit: 30 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 30 }),
        enabled: !!isSignedIn,
        // Finite requests work across instances; inactive tabs do not poll.
        refetchInterval: (query) => query.state.status === "error" ? 30_000 : 5_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        retry: false,
      },
    }
  );

  const notifications = data?.notifications ?? [];

  const unreadCount = data?.unreadCount ?? 0;

  const markRead = useCallback(async () => {
    try {
      await markNotificationsRead();
      queryClient.setQueryData(
        getListNotificationsQueryKey({ limit: 30 }),
        (current: typeof data) => current
          ? { ...current, unreadCount: 0, notifications: current.notifications.map((n) => ({ ...n, isRead: true })) }
          : current
      );
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 30 }) });
    } catch {
      refetch();
    }
  }, [queryClient, refetch, data]);

  // Use persisted notifications, not an instance-local stream. Do not replay
  // the initial inbox or re-alert on read changes/refetches.
  useEffect(() => {
    const fresh = tracker.current.update<AppNotification>(
      isSignedIn && user ? user.id : null,
      data?.notifications,
    );
    if (!fresh.length) return;
    playPopSound();
    for (const notif of fresh) {
      const isDm = /^(dm|message|direct_message)$/i.test(notif.type);
      if (isDm) {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        const conversationId = Number(notif.targetId);
        if (notif.targetType === "conversation" && Number.isSafeInteger(conversationId) && conversationId > 0) {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) });
        }
      }
      const content = notif.content || notif.message;
      toast({
        title: isDm ? `💬 ${notif.actorName ?? "New message"}` : `${EMOJI[notif.type] ?? "🔔"} ${notif.message}`,
        description: isDm
          ? content.length > 60 ? content.slice(0, 60) + "…" : content
          : notif.actorName ? `from ${notif.actorName}` : undefined,
      });
    }
  }, [isSignedIn, user?.id, data, queryClient]);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markRead, isLoading }}>
      {children}
    </NotificationsContext.Provider>
  );
}
