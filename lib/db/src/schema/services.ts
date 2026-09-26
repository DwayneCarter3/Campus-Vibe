import { pgTable, text, serial, timestamp, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  blurDataUrl: text("blur_data_url"),
  price: text("price"),
  originalPrice: text("original_price"),
  isFlashSale: boolean("is_flash_sale").notNull().default(false),
  flashExpiresAt: timestamp("flash_expires_at", { withTimezone: true }),
  contactInfo: text("contact_info").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  isPinnedToProfile: boolean("is_pinned_to_profile").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("services_flash_expires_at_idx").on(t.flashExpiresAt),
  check("services_blur_data_url_webp_check", sql`${t.blurDataUrl} IS NULL OR (
    char_length(${t.blurDataUrl}) <= 10950
    AND ${t.blurDataUrl} ~ '^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$'
  )`),
]);

export const insertServiceSchema = createInsertSchema(servicesTable).omit({ id: true, createdAt: true, updatedAt: true, isActive: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
