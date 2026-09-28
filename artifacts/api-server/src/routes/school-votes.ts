import { Router } from "express";
import { eq, sql, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import * as dbModule from "@workspace/db";
import * as apiZodModule from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";

const { db, schoolVotesTable, schoolVotes, usersTable } = dbModule as any;

const apiZod = apiZodModule as any;
const getSchema = (name: string) =>
  apiZod[name] || {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

const VoteSchoolBody = getSchema("VoteSchoolBody");
const GetSchoolVotesResponse = getSchema("GetSchoolVotesResponse");

const router = Router() as any;

const actualSchoolVotesTable = schoolVotesTable || schoolVotes;

router.get("/school-votes", async (req: any, res: any): Promise<void> => {
  try {
    const votes = await db
      .select({
        school: actualSchoolVotesTable.school,
        count: sql`count(*)::int`,
      })
      .from(actualSchoolVotesTable)
      .groupBy(actualSchoolVotesTable.school);

    res.json({ votes });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error?.message || "Failed to fetch school votes" });
  }
});

router.post(
  "/school-votes",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    try {
      const clerkUserId = getAuth(req).userId;
      if (!clerkUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const body = VoteSchoolBody.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
      }

      const { school } = body.data;

      const existingVote = await db
        .select()
        .from(actualSchoolVotesTable)
        .where(eq(actualSchoolVotesTable.userId, clerkUserId))
        .limit(1);

      if (existingVote.length > 0) {
        await db
          .update(actualSchoolVotesTable)
          .set({ school, updatedAt: new Date() })
          .where(eq(actualSchoolVotesTable.userId, clerkUserId));
      } else {
        await db.insert(actualSchoolVotesTable).values({
          userId: clerkUserId,
          school,
        });
      }

      res.json({ success: true, school });
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error?.message || "Failed to submit school vote" });
    }
  },
);

export default router;
