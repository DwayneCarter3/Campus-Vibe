import { Router, type Request } from "express";
import { eq, and, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import * as dbModule from "@workspace/db";
import * as apiZodModule from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";

const { db, pollsTable, pollOptionsTable, pollVotesTable } = dbModule as any;

const apiZod = apiZodModule as any;
const getSchema = (name: string) =>
  apiZod[name] || {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

const VotePollBody = getSchema("VotePollBody");
const VotePollParams = getSchema("VotePollParams");
const VotePollResponse = getSchema("VotePollResponse");

const router = Router() as any;

router.post(
  "/polls/:pollId/vote",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    const rawPollId = Array.isArray(req.params.pollId)
      ? req.params.pollId[0]
      : req.params.pollId;
    const params = VotePollParams.safeParse({ pollId: rawPollId });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = VotePollBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const clerkUserId = getAuth(req).userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { pollId } = params.data;
    const { optionId } = body.data;

    // Verify poll option exists
    const [option] = await db
      .select()
      .from(pollOptionsTable)
      .where(
        and(
          eq(pollOptionsTable.id, optionId),
          eq(pollOptionsTable.pollId, pollId),
        ) as any,
      )
      .limit(1);

    if (!option) {
      res.status(404).json({ error: "Poll option not found" });
      return;
    }

    // Check for duplicate vote
    const existingVote = await db
      .select()
      .from(pollVotesTable)
      .where(
        and(
          eq(pollVotesTable.pollId, pollId),
          eq(pollVotesTable.userId, clerkUserId),
        ) as any,
      )
      .limit(1);

    if (existingVote.length > 0) {
      res.status(400).json({ error: "You have already voted on this poll" });
      return;
    }

    // Insert vote
    await db.insert(pollVotesTable).values({
      pollId,
      optionId,
      userId: clerkUserId,
    });

    // Increment option count
    await db
      .update(pollOptionsTable)
      .set({
        votesCount: sql`coalesce(${pollOptionsTable.votesCount}, 0) + 1` as any,
      })
      .where(eq(pollOptionsTable.id, optionId) as any);

    // Return updated options
    const options = await db
      .select({
        id: pollOptionsTable.id,
        text: pollOptionsTable.text,
        votesCount: pollOptionsTable.votesCount,
      })
      .from(pollOptionsTable)
      .where(eq(pollOptionsTable.pollId, pollId) as any);

    const totalVotes = options.reduce(
      (sum: number, opt: any) => sum + (opt.votesCount || 0),
      0,
    );

    res.json(
      VotePollResponse.parse({
        pollId,
        selectedOptionId: optionId,
        totalVotes,
        options,
      }),
    );
  },
);

export default router;
