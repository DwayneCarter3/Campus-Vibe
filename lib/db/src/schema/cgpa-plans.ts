import { jsonb, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type CgpaPlanCourse = {
  code: string;
  units: number;
  grade: "A" | "B" | "C" | "D" | "E" | "F";
};

export const cgpaPlansTable = pgTable("cgpa_plans", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  currentCgpa: numeric("current_cgpa", { mode: "number" }),
  completedUnits: integer("completed_units"),
  targetCgpa: numeric("target_cgpa", { mode: "number" }),
  remainingUnits: integer("remaining_units"),
  courses: jsonb("courses").$type<CgpaPlanCourse[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CgpaPlan = typeof cgpaPlansTable.$inferSelect;