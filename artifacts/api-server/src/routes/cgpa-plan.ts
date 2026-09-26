import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, cgpaPlansTable } from "@workspace/db";
import { GetMyCgpaPlanResponse, SaveMyCgpaPlanBody, SaveMyCgpaPlanResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const EMPTY_PLAN = {
  currentCgpa: null,
  completedUnits: null,
  targetCgpa: null,
  remainingUnits: null,
  courses: [],
  updatedAt: null,
};

function hasOnlyKeys(value: object, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

router.get("/users/me/cgpa-plan", requireAuth, async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const userId = (req as any).userId as string;
  const [plan] = await db
    .select()
    .from(cgpaPlansTable)
    .where(eq(cgpaPlansTable.clerkUserId, userId));

  if (!plan) {
    res.json(GetMyCgpaPlanResponse.parse(EMPTY_PLAN));
    return;
  }

  res.json(GetMyCgpaPlanResponse.parse({
    currentCgpa: plan.currentCgpa,
    completedUnits: plan.completedUnits,
    targetCgpa: plan.targetCgpa,
    remainingUnits: plan.remainingUnits,
    courses: plan.courses,
    updatedAt: plan.updatedAt,
  }));
});

router.put("/users/me/cgpa-plan", requireAuth, async (req, res): Promise<void> => {
  res.set("Cache-Control", "private, no-store");
  const body = req.body;
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !hasOnlyKeys(body, ["currentCgpa", "completedUnits", "targetCgpa", "remainingUnits", "courses"])
  ) {
    res.status(400).json({ error: "Invalid CGPA plan object." });
    return;
  }

  const parsed = SaveMyCgpaPlanBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { courses, completedUnits, remainingUnits, ...fields } = parsed.data;
  const rawCourses = body.courses as unknown[];
  if (
    (completedUnits !== null && !Number.isInteger(completedUnits)) ||
    (remainingUnits !== null && !Number.isInteger(remainingUnits)) ||
    courses.some((course) => !Number.isInteger(course.units) || !course.code.trim()) ||
    rawCourses.some((course) =>
      course === null ||
      typeof course !== "object" ||
      Array.isArray(course) ||
      !hasOnlyKeys(course, ["code", "units", "grade"])
    )
  ) {
    res.status(400).json({ error: "Units must be integers and course objects may only contain code, units, and grade." });
    return;
  }

  const userId = (req as any).userId as string;
  const updatedAt = new Date();
  const [saved] = await db
    .insert(cgpaPlansTable)
    .values({
      clerkUserId: userId,
      ...fields,
      completedUnits,
      remainingUnits,
      courses,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: cgpaPlansTable.clerkUserId,
      set: {
        ...fields,
        completedUnits,
        remainingUnits,
        courses,
        updatedAt,
      },
    })
    .returning();

  res.json(SaveMyCgpaPlanResponse.parse({
    currentCgpa: saved.currentCgpa,
    completedUnits: saved.completedUnits,
    targetCgpa: saved.targetCgpa,
    remainingUnits: saved.remainingUnits,
    courses: saved.courses,
    updatedAt: saved.updatedAt,
  }));
});

export default router;