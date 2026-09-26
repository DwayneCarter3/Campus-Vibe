import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/react";
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
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data, isLoading, refetch } = useListNotifications(
    { limit: 30 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 30 }),
        enabled: !!isSignedIn,
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

  // SSE connection
  useEffect(() => {
    if (!isSignedIn || !user) return;

    const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${basePath}/api/notifications/stream`;

    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;
    es.onopen = () => {
      refetch();
    };

    es.addEventListener("notification", (e: MessageEvent) => {
      try {
        const notif = JSON.parse(e.data) as AppNotification;
        queryClient.setQueryData(
          getListNotificationsQueryKey({ limit: 30 }),
          (current: typeof data) => {
            const existing = current?.notifications ?? [];
            if (existing.some((item) => item.id === notif.id)) return current;
            return {
              notifications: [notif, ...existing].slice(0, 30),
              unreadCount: (current?.unreadCount ?? 0) + (notif.isRead ? 0 : 1),
            };
          }
        );
        // DM notifications share the stream with the richer DM event. Let the DM
        // event own its toast so both events never produce duplicate alerts.
        if (!/^(dm|message|direct_message)$/i.test(notif.type)) {
          playPopSound();
          const emoji = EMOJI[notif.type] ?? "🔔";
          toast({
            title: `${emoji} ${notif.message}`,
            description: notif.actorName ? `from ${notif.actorName}` : undefined,
          });
        }
      } catch {
        // malformed event
      }
    });

    es.addEventListener("dm", (e: MessageEvent) => {
      try {
        const dm = JSON.parse(e.data) as {
          conversationId: number;
          senderId: string;
          senderName: string;
          content: string;
        };
        // Refresh conversation list sidebar immediately
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        // Refresh messages if this conversation is open
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(dm.conversationId) });
        playPopSound();
        toast({
          title: `💬 ${dm.senderName}`,
          description: dm.content.length > 60 ? dm.content.slice(0, 60) + "…" : dm.content,
        });
      } catch {
        // malformed event
      }
    });

    es.onerror = () => {
      // SSE auto-reconnects; no action needed
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isSignedIn, user, queryClient, refetch]);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markRead, isLoading }}>
      {children}
    </NotificationsContext.Provider>
  );
}
