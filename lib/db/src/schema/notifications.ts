import { pgTable, text, serial, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorName: text("actor_name"),
    // Keep message intact for existing records and consumers; content is additive.
    content: text("content").notNull().default(""),
    message: text("message").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_user_id_created_at_idx").on(table.userId, table.createdAt)],
);

export type Notification = typeof notificationsTable.$inferSelect;
