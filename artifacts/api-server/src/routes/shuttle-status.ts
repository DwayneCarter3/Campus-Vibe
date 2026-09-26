import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { desc, eq, gte } from "drizzle-orm";
import { db, shuttleStatusVotesTable } from "@workspace/db";
import { VoteShuttleStatusBody, GetShuttleStatusResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const ACTIVE_VOTE_WINDOW_MS = 30 * 60 * 1000;

async function buildShuttleStatus(userId?: string) {
  const cutoff = new Date(Date.now() - ACTIVE_VOTE_WINDOW_MS);
  const activeVotes = await db
    .select({
      userId: shuttleStatusVotesTable.userId,
      status: shuttleStatusVotesTable.status,
      votedAt: shuttleStatusVotesTable.votedAt,
    })
    .from(shuttleStatusVotesTable)
    .where(gte(shuttleStatusVotesTable.votedAt, cutoff))
    .orderBy(desc(shuttleStatusVotesTable.votedAt));

  const totals = new Map<string, { count: number; latestVoteAt: Date }>();
  for (const vote of activeVotes) {
    const aggregate = totals.get(vote.status);
    if (aggregate) {
      aggregate.count += 1;
    } else {
      totals.set(vote.status, { count: 1, latestVoteAt: vote.votedAt });
    }
  }

  const rankedVotes = [...totals.entries()].sort((a, b) =>
    b[1].count - a[1].count ||
    b[1].latestVoteAt.getTime() - a[1].latestVoteAt.getTime() ||
    a[0].localeCompare(b[0])
  );
  const topVote = rankedVotes[0];
  const winner = topVote && topVote[1].count > activeVotes.length / 2 ? topVote : undefined;
  const myVote = userId
    ? activeVotes.find((vote) => vote.userId === userId)
    : undefined;

  return GetShuttleStatusResponse.parse({
    status: winner?.[0] ?? null,
    voteCount: activeVotes.length,
    updatedAt: activeVotes[0]?.votedAt.toISOString() ?? null,
    myVote: myVote?.status ?? null,
  });
}

router.get("/shuttle-status", async (req, res): Promise<void> => {
  const userId = getAuth(req)?.userId ?? undefined;
  res.json(await buildShuttleStatus(userId));
});

router.post("/shuttle-status/vote", requireAuth, async (req, res): Promise<void> => {
  const parsed = VoteShuttleStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = (req as any).userId as string;
  const votedAt = new Date();
  await db
    .insert(shuttleStatusVotesTable)
    .values({ userId, status: parsed.data.status, votedAt })
    .onConflictDoUpdate({
      target: shuttleStatusVotesTable.userId,
      set: { status: parsed.data.status, votedAt },
    });

  res.json(await buildShuttleStatus(userId));
});

export default router;