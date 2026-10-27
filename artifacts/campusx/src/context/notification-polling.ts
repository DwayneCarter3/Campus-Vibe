/** Tracks successful snapshots, not fetch attempts, so failures cannot lose alerts. */
export class NotificationPollTracker {
  private userId: string | null = null;
  private primed = false;
  private seen = new Set<number>();

  update<T extends { id: number; isRead: boolean }>(
    userId: string | null,
    snapshot: readonly T[] | undefined,
  ): T[] {
    if (userId !== this.userId) {
      this.userId = userId;
      this.primed = false;
      this.seen.clear();
    }
    if (!userId || !snapshot) return [];
    const fresh = this.primed
      ? snapshot.filter((item) => !this.seen.has(item.id) && !item.isRead)
      : [];
    for (const item of snapshot) this.seen.add(item.id);
    this.primed = true;
    // IDs are monotonically assigned; retain a bounded recent history.
    if (this.seen.size > 300) {
      this.seen = new Set([...this.seen].sort((a, b) => b - a).slice(0, 300));
    }
    return fresh;
  }
}
