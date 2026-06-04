import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { schoolVotes } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

router.post("/school-votes", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const schoolName = (req.body as { schoolName?: unknown }).schoolName;
  if (typeof schoolName !== "string" || !schoolName.trim()) {
    return res.status(400).json({ error: "schoolName is required" });
  }

  await db
    .insert(schoolVotes)
    .values({ schoolName: schoolName.trim(), voterClerkId: userId })
    .onConflictDoUpdate({
      target: schoolVotes.voterClerkId,
      set: { schoolName: schoolName.trim() },
    });

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schoolVotes)
    .where(eq(schoolVotes.schoolName, schoolName.trim()));

  return res.json({ schoolName: schoolName.trim(), votes: row?.count ?? 1 });
});

export default router;
