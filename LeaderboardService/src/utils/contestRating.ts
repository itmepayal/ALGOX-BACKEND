/**
 * Server-side contest rating (Elo-inspired).
 * Never accept client-supplied deltas — only call after final leaderboard recompute.
 */

export type RatingEntry = { userId: string; rank: number };

/**
 * Expected score vs average opponent for a rank among n players.
 * Rank 1 → near 1.0 expected performance relative to field.
 */
export function expectedPerformance(rank: number, n: number): number {
  if (n <= 1) return 0.5;
  // Linear map: best rank → 1, worst → 0
  return (n - rank) / Math.max(1, n - 1);
}

/**
 * Deterministic rating delta for a finished contest.
 * K=24, field expected ≈ 0.5 → delta = K * (perf - 0.5), clamped ±80.
 */
export function ratingDeltaForRank(rank: number, fieldSize: number): number {
  const perf = expectedPerformance(rank, fieldSize);
  const raw = 24 * (perf - 0.5);
  const rounded = Math.round(raw);
  return Math.max(-80, Math.min(80, rounded));
}

export function computeContestRatingDeltas(
  entries: RatingEntry[]
): Array<{ userId: string; rank: number; delta: number }> {
  const sorted = [...entries]
    .filter((e) => e.userId && e.rank >= 1)
    .sort((a, b) => a.rank - b.rank);
  const n = sorted.length;
  return sorted.map((e) => ({
    userId: String(e.userId),
    rank: e.rank,
    delta: ratingDeltaForRank(e.rank, n),
  }));
}
