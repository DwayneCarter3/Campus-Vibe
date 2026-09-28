import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import * as dbModule from "@workspace/db";
import * as apiZodModule from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";

const { db, usersTable, users } = dbModule as any;

const apiZod = apiZodModule as any;
const getSchema = (name: string) =>
  apiZod[name] || {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

const UpdateUserProfileBody = getSchema("UpdateUserProfileBody");
const UserProfileResponse = getSchema("UserProfileResponse");

const router = Router() as any;

const actualUsersTable = usersTable || users;

router.get(
  "/users/me",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    try {
      const clerkUserId = getAuth(req).userId;
      if (!clerkUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const result = await db
        .select()
        .from(actualUsersTable)
        .where(eq(actualUsersTable.clerkId || actualUsersTable.id, clerkUserId))
        .limit(1);

      if (!result || result.length === 0) {
        res.status(404).json({ error: "User profile not found" });
        return;
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.json(UserProfileResponse.parse(result[0]));
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error?.message || "Failed to fetch user profile" });
    }
  },
);

router.patch(
  "/users/me",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    try {
      const clerkUserId = getAuth(req).userId;
      if (!clerkUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const body = UpdateUserProfileBody.safeParse(req.body);
      if (!body.success) {
        res
          .status(400)
          .json({ error: body.error?.message || "Invalid payload" });
        return;
      }

      const updateData = {
        ...body.data,
        updatedAt: new Date(),
      };

      const updated = await db
        .update(actualUsersTable)
        .set(updateData)
        .where(eq(actualUsersTable.clerkId || actualUsersTable.id, clerkUserId))
        .returning();

      if (!updated || updated.length === 0) {
        res.status(404).json({ error: "User profile not found" });
        return;
      }

      res.json(UserProfileResponse.parse(updated[0]));
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error?.message || "Failed to update user profile" });
    }
  },
);

export default router;
