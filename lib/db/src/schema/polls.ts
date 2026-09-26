import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { postsTable } from "./posts";

export const pollsTable = pgTable("polls", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '24 hours'`),
}, (table) => [uniqueIndex("polls_post_id_unique").on(table.postId)]);

export const pollOptionsTable = pgTable("poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => pollsTable.id, { onDelete: "cascade" }),
  optionText: text("option_text").notNull(),
  voteCount: integer("vote_count").notNull().default(0),
}, (table) => [check("poll_options_vote_count_check", sql`${table.voteCount} >= 0`)]);

export const pollVotesTable = pgTable("poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => pollsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  optionId: integer("option_id").notNull().references(() => pollOptionsTable.id, { onDelete: "cascade" }),
  votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("poll_votes_poll_user_unique").on(table.pollId, table.userId)]);

export const insertPollSchema = createInsertSchema(pollsTable).omit({ id: true, createdAt: true, expiresAt: true });
export const insertPollOptionSchema = createInsertSchema(pollOptionsTable).omit({ id: true, voteCount: true });
export const insertPollVoteSchema = createInsertSchema(pollVotesTable).omit({ id: true, votedAt: true });
export type InsertPoll = z.infer<typeof insertPollSchema>;
export type Poll = typeof pollsTable.$inferSelect;