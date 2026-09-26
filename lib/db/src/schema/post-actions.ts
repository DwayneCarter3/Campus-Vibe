import { sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { postsTable } from "./posts";
import { servicesTable } from "./services";

export const savedPostsTable = pgTable("saved_posts", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("saved_posts_post_user_unique").on(table.postId, table.userId)]);

export const savedServicesTable = pgTable("saved_services", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("saved_services_service_user_unique").on(table.serviceId, table.userId)]);

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => postsTable.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").references(() => servicesTable.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("reports_one_target_check", sql`(${table.postId} IS NOT NULL AND ${table.serviceId} IS NULL) OR (${table.serviceId} IS NOT NULL AND ${table.postId} IS NULL)`),
  uniqueIndex("reports_post_reporter_unique").on(table.postId, table.reporterId),
  uniqueIndex("reports_service_reporter_unique").on(table.serviceId, table.reporterId),
]);

/** Upload receipts let post deletion remove only objects issued to that post's author. */
export const uploadedMediaTable = pgTable("uploaded_media", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  uploaderId: text("uploader_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});