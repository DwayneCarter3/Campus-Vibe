import { db, pollsTable, pollOptionsTable, pollVotesTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

/** Public poll projections deliberately omit the voter list and hide results until voted or expired. */
export async function loadPublicPolls(postIds: number[], viewerId?: string) {
  const uniqueIds = [...new Set(postIds)];
  if (!uniqueIds.length) return new Map<number, PublicPoll>();

  const polls = await db
    .select({
      id: pollsTable.id,
      postId: pollsTable.postId,
      question: pollsTable.question,
      createdAt: pollsTable.createdAt,
      expiresAt: pollsTable.expiresAt,
      isExpired: sql<boolean>`${pollsTable.expiresAt} <= clock_timestamp()`,
    })
    .from(pollsTable)
    .where(inArray(pollsTable.postId, uniqueIds));
  if (!polls.length) return new Map<number, PublicPoll>();

  const ids = polls.map((poll) => poll.id);
  const [options, votes] = await Promise.all([
    db.select().from(pollOptionsTable).where(inArray(pollOptionsTable.pollId, ids)).orderBy(pollOptionsTable.id),
    viewerId
      ? db.select({ pollId: pollVotesTable.pollId, optionId: pollVotesTable.optionId })
          .from(pollVotesTable)
          .where(and(inArray(pollVotesTable.pollId, ids), eq(pollVotesTable.userId, viewerId)))
      : Promise.resolve([]),
  ]);
  const selectedByPoll = new Map(votes.map((vote) => [vote.pollId, vote.optionId]));
  const byPost = new Map<number, PublicPoll>();

  for (const poll of polls) {
    const pollOptions = options.filter((option) => option.pollId === poll.id);
    const selectedOptionId = selectedByPoll.get(poll.id) ?? null;
    const showResults = poll.isExpired || selectedOptionId !== null;
    byPost.set(poll.postId, {
      id: poll.id,
      question: poll.question,
      createdAt: poll.createdAt.toISOString(),
      expiresAt: poll.expiresAt.toISOString(),
      isExpired: poll.isExpired,
      selectedOptionId,
      totalVotes: showResults ? pollOptions.reduce((sum, option) => sum + option.voteCount, 0) : null,
      options: pollOptions.map((option) => ({
        id: option.id,
        optionText: option.optionText,
        voteCount: showResults ? option.voteCount : null,
      })),
    });
  }
  return byPost;
}

export async function loadPublicPoll(pollId: number, viewerId?: string) {
  const [poll] = await db.select({ postId: pollsTable.postId }).from(pollsTable).where(eq(pollsTable.id, pollId));
  if (!poll) return null;
  return (await loadPublicPolls([poll.postId], viewerId)).get(poll.postId) ?? null;
}

export type PublicPoll = {
  id: number;
  question: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  selectedOptionId: number | null;
  totalVotes: number | null;
  options: { id: number; optionText: string; voteCount: number | null }[];
};