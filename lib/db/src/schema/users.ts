import { pgTable, text, serial, timestamp, boolean, uniqueIndex, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    registrationRank: serial("registration_rank").notNull().unique(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    fullName: text("full_name").notNull(),
    username: text("username"),
    department: text("department"),
    email: text("email").notNull().default(""),
    institutionId: text("institution_id"),
    school: text("school").notNull().default("Lagos State University (LASU)"),
    campusLocation: text("campus_location").notNull().default("Ojo"),
    level: text("level").notNull(),
    faculty: text("faculty").notNull(),
    enrollmentStatus: text("enrollment_status").notNull(),
    matricNumber: text("matric_number").notNull(),
    campus: text("campus").notNull().default("LASU Ojo"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    isAdmin: boolean("is_admin").notNull().default(false),
    role: text("role").notNull().default("student"),
    verificationStatus: text("verification_status").notNull().default("none"),
    // Public badge entitlement is deliberately separate from internal role/status grants.
    publicBadgeTier: text("public_badge_tier"),
    publicBadgeExpiresAt: timestamp("public_badge_expires_at", { withTimezone: true }),
    premiumBadgeDiscountPercent: integer("premium_badge_discount_percent").notNull().default(0),
    promoExpiresAt: timestamp("promo_expires_at", { withTimezone: true }),
    hustlePromoExpiresAt: timestamp("hustle_promo_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    // Partial unique index: only enforce email uniqueness when email is non-empty
    // (new users may register without email; empty string is allowed multiple times)
    uniqueIndex("users_email_nonempty_unique").on(sql`lower(btrim(${table.email}))`).where(sql`btrim(${table.email}) <> ''`),
    uniqueIndex("users_institution_matric_unique")
      .on(
        sql`coalesce(${table.institutionId}, regexp_replace(regexp_replace(lower(btrim(${table.school})), ' *[(][^)]*[)] *$', ''), '[^a-z0-9]+', '-', 'g'))`,
        sql`lower(btrim(${table.matricNumber}))`,
      )
      .where(sql`btrim(${table.matricNumber}) <> ''`),
    uniqueIndex("users_username_nonempty_unique").on(sql`lower(${table.username})`).where(sql`${table.username} IS NOT NULL AND ${table.username} != ''`),
  ]
);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
