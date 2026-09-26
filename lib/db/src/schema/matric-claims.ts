import { pgTable, serial, integer, text, timestamp, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const matricClaimsTable = pgTable(
  "matric_claim_requests",
  {
    id: serial("id").primaryKey(),
    claimantClerkId: text("claimant_clerk_id").notNull(),
    existingAccountId: integer("existing_account_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    matricNumber: text("matric_number").notNull(),
    institution: text("institution").notNull(),
    evidenceType: text("evidence_type").notNull(),
    evidenceObjectPath: text("evidence_object_path").notNull().unique(),
    status: text("status").notNull().default("pending"),
    adminDecision: text("admin_decision"),
    adminDecisionNote: text("admin_decision_note"),
    decidedByClerkId: text("decided_by_clerk_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    check("matric_claim_requests_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
    check("matric_claim_requests_evidence_type_check", sql`${table.evidenceType} IN ('student-id', 'course-form')`),
    check("matric_claim_requests_decision_check", sql`${table.adminDecision} IS NULL OR ${table.adminDecision} IN ('approved', 'rejected')`),
    check("matric_claim_requests_audit_state_check", sql`(
      ${table.status} = 'pending'
      AND ${table.adminDecision} IS NULL
      AND ${table.decidedByClerkId} IS NULL
      AND ${table.decidedAt} IS NULL
    ) OR (
      ${table.status} IN ('approved', 'rejected')
      AND ${table.adminDecision} = ${table.status}
      AND ${table.decidedByClerkId} IS NOT NULL
      AND ${table.decidedAt} IS NOT NULL
    )`),
    uniqueIndex("matric_claim_requests_pending_claimant_account_unique")
      .on(table.claimantClerkId, table.existingAccountId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const insertMatricClaimSchema = createInsertSchema(matricClaimsTable).omit({
  id: true,
  status: true,
  adminDecision: true,
  adminDecisionNote: true,
  decidedByClerkId: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMatricClaim = z.infer<typeof insertMatricClaimSchema>;
export type MatricClaim = typeof matricClaimsTable.$inferSelect;