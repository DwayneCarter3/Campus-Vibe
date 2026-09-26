import { useEffect, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { BarChart3, Clock3, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useVotePoll, getListPostsQueryKey, getGetPostQueryKey, getGetUserPostsQueryKey } from "@workspace/api-client-react";
import type { Poll } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PollCardProps {
  poll: Poll;
  postId: number;
  authorId: string;
}

export function PollCard({ poll, postId, authorId }: PollCardProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [votedPoll, setVotedPoll] = useState<Poll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const expiryRefreshId = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setSelected(null);
    setVotedPoll(null);
    setError(null);
  }, [poll.id]);
  useEffect(() => {
    if (poll.isExpired || now < new Date(poll.expiresAt).getTime() || expiryRefreshId.current === poll.id) return;
    expiryRefreshId.current = poll.id;
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
    queryClient.invalidateQueries({ queryKey: getGetUserPostsQueryKey(authorId) });
  }, [poll.id, poll.isExpired, poll.expiresAt, now, postId, authorId, queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPostQueryKey(postId) });
    queryClient.invalidateQueries({ queryKey: getGetUserPostsQueryKey(authorId) });
  };
  const vote = useVotePoll({
    mutation: {
      onSuccess: (result) => {
        setVotedPoll(result);
        setError(null);
        refresh();
      },
      onError: (reason) => {
        setVotedPoll(null);
        setError(reason.status === 409 || reason.status === 400
          ? "This vote couldn't be counted. The poll may have ended or you may have already voted."
          : "Couldn't cast your vote. Please try again.");
        refresh();
      },
    },
  });
  const current = poll.selectedOptionId !== null
    ? poll
    : votedPoll?.id === poll.id ? votedPoll : poll;
  const expired = current.isExpired || now >= new Date(current.expiresAt).getTime();
  const showResults = current.totalVotes !== null && (expired || current.selectedOptionId !== null);
  const total = current.totalVotes ?? 0;

  return (
    <section data-testid={`poll-${poll.id}`} aria-label={`Poll: ${current.question}`} className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-3.5 sm:p-4">
      <div className="flex gap-2 items-start justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <BarChart3 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
          <h3 data-testid={`text-poll-question-${poll.id}`} className="text-sm font-semibold leading-snug break-words">{current.question}</h3>
        </div>
        {expired && <span data-testid={`status-poll-ended-${poll.id}`} className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Poll Ended</span>}
      </div>
      <div className="mt-3 space-y-2">
        {current.options.map((option) => {
          const chosen = current.selectedOptionId === option.id;
          const active = selected === option.id;
          const percent = total > 0 ? Math.round(((option.voteCount ?? 0) / total) * 100) : 0;
          return showResults ? (
            <div key={option.id} data-testid={`result-poll-option-${option.id}`} className={cn("relative isolate overflow-hidden rounded-lg border px-3 py-2.5 text-xs", chosen ? "border-primary/60 text-foreground" : "border-white/10 text-foreground/80")}>
              <div aria-hidden="true" className={cn("absolute inset-y-0 left-0 -z-10", chosen ? "bg-primary/25" : "bg-white/10")} style={{ width: `${percent}%` }} />
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0 break-words">{chosen && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />} {option.optionText}</span>
                <span className="shrink-0 font-semibold tabular-nums">{percent}%</span>
              </div>
            </div>
          ) : (
            <button
              key={option.id}
              type="button"
              data-testid={`button-poll-option-${option.id}`}
              aria-pressed={active}
              disabled={vote.isPending || expired}
              onClick={() => { setSelected(option.id); setError(null); }}
              className={cn("w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs transition-colors", active ? "border-primary/70 bg-primary/15 text-foreground" : "border-white/10 bg-white/[0.03] hover:border-primary/40 text-foreground/80")}
            >
              <span aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center", active ? "border-primary" : "border-muted-foreground/60")}>{active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}</span>
              <span className="break-words">{option.optionText}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 mt-3 text-[11px] text-muted-foreground">
        <span data-testid={`text-poll-status-${poll.id}`} className="inline-flex items-center gap-1">
          {expired ? showResults ? `${total} ${total === 1 ? "vote" : "votes"} · Final results` : "Loading final results…" : <><Clock3 className="h-3 w-3" /> {formatDistanceToNowStrict(new Date(current.expiresAt), { addSuffix: false })} remaining{showResults ? ` · ${total} ${total === 1 ? "vote" : "votes"}` : ""}</>}
        </span>
        {!showResults && !expired && <Button data-testid={`button-vote-poll-${poll.id}`} type="button" size="sm" className="gradient-btn rounded-full h-7 px-4 text-xs" disabled={selected === null || vote.isPending} onClick={() => { if (selected !== null) vote.mutate({ pollId: poll.id, data: { optionId: selected } }); }}>{vote.isPending ? "Voting…" : "Vote"}</Button>}
      </div>
      {error && <p role="alert" data-testid={`error-poll-${poll.id}`} className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}