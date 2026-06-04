import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { ClaimAdminResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/admin/claim", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true))
    .limit(1);

  if (existing) {
    res.status(403).json({ error: "An admin already exists." });
    return;
  }

  await db
    .update(usersTable)
    .set({ isAdmin: true })
    .where(eq(usersTable.clerkUserId, userId));

  res.json(ClaimAdminResponse.parse({ success: true, message: "You are now the CampusX admin!" }));
});

export default router;
