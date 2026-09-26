import { pgTable, serial, text, integer, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

export const paymentTransactionsTable = pgTable(
  "payment_transactions",
  {
    id: serial("id").primaryKey(),
    reference: text("reference").notNull(),
    clerkUserId: text("clerk_user_id").notNull(),
    packageType: text("package_type").notNull(),
    durationDays: integer("duration_days").notNull().default(30),
    baseAmountKobo: integer("base_amount_kobo").notNull(),
    chargedAmountKobo: integer("charged_amount_kobo").notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("initialized"),
    paystackStatus: text("paystack_status"),
    authorizationUrl: text("authorization_url"),
    accessCode: text("access_code"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    entitlementExpiresAt: timestamp("entitlement_expires_at", { withTimezone: true }),
    webhookReceivedAt: timestamp("webhook_received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique("payment_transactions_reference_unique").on(table.reference),
    uniqueIndex("payment_transactions_user_reference_idx").on(table.clerkUserId, table.reference),
  ],
);

export const earlyBirdClaimsTable = pgTable(
  "early_bird_claims",
  {
    id: serial("id").primaryKey(),
    claimRank: integer("claim_rank").notNull().unique(),
    clerkUserId: text("clerk_user_id").notNull(),
    badgeClaimedAt: timestamp("badge_claimed_at", { withTimezone: true }),
    promotionClaimedAt: timestamp("promotion_claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("early_bird_claims_user_unique").on(table.clerkUserId),
  ],
);

export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;
export type EarlyBirdClaim = typeof earlyBirdClaimsTable.$inferSelect;