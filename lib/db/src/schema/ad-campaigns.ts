import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const adCampaignsTable = pgTable(
  "ad_campaigns",
  {
    id: serial("id").primaryKey(),
    ownerClerkUserId: text("owner_clerk_user_id").notNull(),
    paymentReference: text("payment_reference").notNull(),
    packageType: text("package_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    destinationUrl: text("destination_url").notNull(),
    school: text("school").notNull(),
    campusLocation: text("campus_location").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedByClerkUserId: text("decided_by_clerk_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique("ad_campaigns_payment_reference_unique").on(table.paymentReference),
    index("ad_campaigns_scope_active_idx").on(table.school, table.campusLocation, table.status, table.expiresAt),
    index("ad_campaigns_owner_idx").on(table.ownerClerkUserId, table.createdAt),
  ],
);

export const insertAdCampaignSchema = createInsertSchema(adCampaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdCampaign = z.infer<typeof insertAdCampaignSchema>;
export type AdCampaign = typeof adCampaignsTable.$inferSelect;