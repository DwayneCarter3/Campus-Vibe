import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/context/notifications";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";

const EMOJI: Record<string, string> = {
  fire: "🔥",
  nocap: "🧢",
  whatsapp: "💰",
};

export function NotificationBell() {
  const { notifications, unreadCount, markRead, isLoading } = useNotifications();
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const toggle = () => {
    setOpen((v) => !v);
  };

  const getNotificationHref = (notif: (typeof notifications)[number]) => {
    // Older notifications only contain the base fields. Use metadata when a
    // newer backend provides it, otherwise keep the row informational.
    const meta = notif as typeof notif & {
      sourceType?: string;
      entityType?: string;
      targetType?: string;
      postId?: number | string;
      conversationId?: number | string;
    };
    const sourceType = (meta.sourceType ?? meta.entityType ?? meta.targetType ?? "").toLowerCase();
    if (meta.postId || sourceType.includes("post")) return "/feed";
    if (meta.conversationId || /dm|message|conversation/.test(sourceType)) return "/messages";
    if (/profile|user/.test(sourceType)) return "/profile";
    return null;
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative h-9 w-9 rounded-full flex items-center justify-center border border-white/10 hover:border-primary/40 transition-colors bg-white/5 hover:bg-white/10"
      >
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] glass rounded-2xl border border-white/10 shadow-2xl shadow-black/40 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm font-semibold">Notifications</span>
                {unreadCount === 0 ? null : (
                  <button
                    onClick={markRead}
                    aria-label="Mark all notifications as read"
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-96 overflow-y-auto">
                {isLoading && notifications.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Loading notifications…</div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center px-4">
                    <span className="text-3xl mb-2">🔔</span>
                    <p className="text-sm text-muted-foreground">No notifications yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">React to posts or list a service to get notified.</p>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const href = getNotificationHref(notif);
                    const rowClass = cn(
                      "flex w-full text-left gap-3 px-4 py-3 border-b border-white/5 last:border-0 transition-colors",
                      !notif.isRead && "bg-primary/5",
                      href && "hover:bg-white/5"
                    );
                    const content = (
                      <>
                        <span className="text-lg shrink-0 mt-0.5">
                          {EMOJI[notif.type] ?? "🔔"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-snug">{notif.message}</p>
                          {notif.actorName && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              from {notif.actorName}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-1">
                            {Number.isNaN(new Date(notif.createdAt).getTime())
                              ? ""
                              : formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        {!notif.isRead && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                        )}
                      </>
                    );
                    return href ? (
                      <button
                        key={notif.id}
                        type="button"
                        className={rowClass}
                        onClick={() => {
                          setOpen(false);
                          setLocation(href);
                        }}
                      >
                        {content}
                      </button>
                    ) : (
                      <div key={notif.id} className={rowClass}>
                        {content}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
