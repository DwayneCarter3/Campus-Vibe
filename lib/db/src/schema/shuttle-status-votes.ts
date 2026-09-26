import { index, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const shuttleStatusVotesTable = pgTable("shuttle_status_votes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull(),
  votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("shuttle_status_votes_user_id_idx").on(t.userId),
  index("shuttle_status_votes_voted_at_idx").on(t.votedAt),
]);