import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/context/notifications";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const EMOJI: Record<string, string> = {
  fire: "🔥",
  nocap: "🧢",
  whatsapp: "💰",
};

export function NotificationBell() {
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (!open && unreadCount > 0) {
      markRead();
    }
    setOpen((v) => !v);
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
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center"
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
              className="absolute right-0 top-11 z-50 w-80 glass rounded-2xl border border-white/10 shadow-2xl shadow-black/40 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm font-semibold">Notifications</span>
                {notifications.some((n) => n.isRead) || notifications.length === 0 ? null : (
                  <button
                    onClick={markRead}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center px-4">
                    <span className="text-3xl mb-2">🔔</span>
                    <p className="text-sm text-muted-foreground">No notifications yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">React to posts or list a service to get notified.</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={cn(
                        "flex gap-3 px-4 py-3 border-b border-white/5 last:border-0 transition-colors",
                        !notif.isRead && "bg-primary/5"
                      )}
                    >
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
                          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!notif.isRead && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
