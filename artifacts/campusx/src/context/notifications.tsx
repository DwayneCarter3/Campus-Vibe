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
  const [localNotifs, setLocalNotifs] = useState<AppNotification[]>([]);

  const { data, isLoading, refetch } = useListNotifications(
    { limit: 30 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 30 }),
        enabled: !!isSignedIn,
      },
    }
  );

  const notifications = localNotifs.length
    ? localNotifs
    : (data?.notifications ?? []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markRead = useCallback(async () => {
    try {
      await fetch("/api/notifications/read", { method: "PATCH" });
      setLocalNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 30 }) });
    } catch {
      // best-effort
    }
  }, [queryClient]);

  // Sync server data into local state when it loads
  useEffect(() => {
    if (data?.notifications) {
      setLocalNotifs(data.notifications);
    }
  }, [data]);

  // SSE connection
  useEffect(() => {
    if (!isSignedIn || !user) return;

    const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${basePath}/api/notifications/stream`;

    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener("notification", (e: MessageEvent) => {
      try {
        const notif = JSON.parse(e.data) as AppNotification;
        setLocalNotifs((prev) => [notif, ...prev]);
        playPopSound();
        const emoji = EMOJI[notif.type] ?? "🔔";
        toast({
          title: `${emoji} ${notif.message}`,
          description: notif.actorName ? `from ${notif.actorName}` : undefined,
        });
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
  }, [isSignedIn, user]);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markRead, isLoading }}>
      {children}
    </NotificationsContext.Provider>
  );
}
