import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { postsTable } from "./posts";

export const dispatchNewsArticlesTable = pgTable(
  "dispatch_news_articles",
  {
    id: serial("id").primaryKey(),
    institutionId: text("institution_id").notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    canonicalSourceUrl: text("canonical_source_url").notNull(),
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }).notNull(),
    postId: integer("post_id").references(() => postsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("dispatch_news_articles_source_url_unique").on(table.canonicalSourceUrl),
    uniqueIndex("dispatch_news_articles_institution_title_unique").on(table.institutionId, table.normalizedTitle),
    uniqueIndex("dispatch_news_articles_post_id_unique").on(table.postId),
  ],
);

export type DispatchNewsArticle = typeof dispatchNewsArticlesTable.$inferSelect;