import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  GetMyProfileResponse,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
  GetUserProfileParams,
  GetUserProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  if (!user) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(GetMyProfileResponse.parse(user));
});

router.put("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));

  let user;
  if (existing.length === 0) {
    const data = parsed.data as any;
    if (!data.fullName || !data.level || !data.faculty || !data.enrollmentStatus || !data.matricNumber) {
      res.status(400).json({ error: "Missing required profile fields" });
      return;
    }
    [user] = await db
      .insert(usersTable)
      .values({
        clerkUserId: userId,
        fullName: data.fullName,
        email: data.email || "",
        school: data.school || "Lagos State University (LASU)",
        campusLocation: data.campusLocation || "Ojo",
        level: data.level,
        faculty: data.faculty,
        enrollmentStatus: data.enrollmentStatus,
        matricNumber: data.matricNumber,
        campus: data.campus || "LASU Ojo",
        bio: data.bio ?? null,
        avatarUrl: data.avatarUrl ?? null,
      })
      .returning();
  } else {
    [user] = await db
      .update(usersTable)
      .set(parsed.data)
      .where(eq(usersTable.clerkUserId, userId))
      .returning();
  }

  res.json(UpdateMyProfileResponse.parse(user));
});

router.get("/users/:userId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = GetUserProfileParams.safeParse({ userId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      clerkUserId: usersTable.clerkUserId,
      fullName: usersTable.fullName,
      school: usersTable.school,
      campusLocation: usersTable.campusLocation,
      level: usersTable.level,
      faculty: usersTable.faculty,
      enrollmentStatus: usersTable.enrollmentStatus,
      campus: usersTable.campus,
      bio: usersTable.bio,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, params.data.userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetUserProfileResponse.parse(user));
});

export default router;
