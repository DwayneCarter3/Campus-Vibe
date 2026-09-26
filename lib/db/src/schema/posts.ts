import { pgTable, text, serial, timestamp, integer, boolean, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: text("author_id").notNull(),
  targetInstitutionId: text("target_institution_id"),
  content: text("content").notNull(),
  category: text("category").notNull().default("Amebo Hot"),
  imageUrl: text("image_url"),
  blurDataUrl: text("blur_data_url"),
  videoUrl: text("video_url"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  isPinnedToProfile: boolean("is_pinned_to_profile").notNull().default(false),
  isPinnedToFeed: boolean("is_pinned_to_feed").notNull().default(false),
  isFeaturedTrending: boolean("is_featured_trending").notNull().default(false),
  likesCount: integer("likes_count").notNull().default(0),
  noCapsCount: integer("no_caps_count").notNull().default(0),
  reshareCount: integer("reshare_count").notNull().default(0),
  originalPostId: integer("original_post_id").references((): AnyPgColumn => postsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  check("posts_blur_data_url_webp_check", sql`${t.blurDataUrl} IS NULL OR (
    char_length(${t.blurDataUrl}) <= 10950
    AND ${t.blurDataUrl} ~ '^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$'
  )`),
]);

export const postLikesTable = pgTable("post_likes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postNoCapsTable = pgTable("post_nocaps", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postCommentsTable = pgTable("post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true, likesCount: true, noCapsCount: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
