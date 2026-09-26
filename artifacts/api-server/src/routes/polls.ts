import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, pollsTable, pollOptionsTable, pollVotesTable } from "@workspace/db";
import { VotePollBody, VotePollParams, VotePollResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { loadPublicPoll } from "../lib/polls";

const router: IRouter = Router();

router.post("/polls/:pollId/vote", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const pollId = Array.isArray(req.params.pollId) ? req.params.pollId[0] : req.params.pollId;
  const params = VotePollParams.safeParse({ pollId });
  const body = VotePollBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a valid poll option." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [poll] = await tx.select({ id: pollsTable.id, expiresAt: pollsTable.expiresAt })
      .from(pollsTable).where(eq(pollsTable.id, params.data.pollId)).for("update");
    if (!poll) return "not-found";

    const [option] = await tx.select({ id: pollOptionsTable.id }).from(pollOptionsTable)
      .where(and(eq(pollOptionsTable.id, body.data.optionId), eq(pollOptionsTable.pollId, poll.id)));
    if (!option) return "invalid-option";
    const [{ isExpired }] = await tx.select({
      isExpired: sql<boolean>`${pollsTable.expiresAt} <= clock_timestamp()`,
    }).from(pollsTable).where(eq(pollsTable.id, poll.id));
    if (isExpired) return "expired";

    // Check expiry in the INSERT itself, not only before it: the boundary can pass while
    // waiting for a transaction lock or fetching the chosen option.
    const vote = await tx.execute(sql`
      INSERT INTO poll_votes (poll_id, user_id, option_id)
      SELECT ${poll.id}, ${userId}, ${option.id}
      WHERE EXISTS (
        SELECT 1 FROM polls WHERE id = ${poll.id} AND expires_at > clock_timestamp()
      )
      ON CONFLICT (poll_id, user_id) DO NOTHING
      RETURNING id
    `);
    if (!vote.rows.length) {
      const [{ ended }] = await tx.select({
        ended: sql<boolean>`${pollsTable.expiresAt} <= clock_timestamp()`,
      }).from(pollsTable).where(eq(pollsTable.id, poll.id));
      return ended ? "expired" : "already-voted";
    }

    await tx.update(pollOptionsTable)
      .set({ voteCount: sql`${pollOptionsTable.voteCount} + 1` })
      .where(eq(pollOptionsTable.id, option.id));
    return "voted";
  });

  if (result === "not-found") { res.status(404).json({ error: "Poll not found." }); return; }
  if (result === "invalid-option") { res.status(400).json({ error: "Option does not belong to this poll." }); return; }
  if (result === "expired") { res.status(409).json({ error: "Poll Ended." }); return; }
  if (result === "already-voted") { res.status(409).json({ error: "You already voted on this poll." }); return; }

  const poll = await loadPublicPoll(params.data.pollId, userId);
  if (!poll) { res.status(404).json({ error: "Poll not found." }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(VotePollResponse.parse(poll));
});

export default router;