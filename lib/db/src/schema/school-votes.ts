import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const schoolVotes = pgTable("school_votes", {
  id: serial("id").primaryKey(),
  schoolName: text("school_name").notNull(),
  voterClerkId: text("voter_clerk_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("school_votes_voter_uniq").on(t.voterClerkId)]);
