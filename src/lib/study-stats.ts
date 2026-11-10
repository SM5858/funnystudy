export type StudyStats = {
  likedCount: number;
  viewedCount: number;
  medianVoteTimeMs: number | null;
  medianNavigationTimeMs: number | null;
  // How many sittings the counts above cover. Snapshots saved before this
  // existed have no session count, and their stats screen says nothing about
  // sittings rather than claiming a number nobody recorded.
  sessionCount?: number;
};

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parseStudyStats(value: unknown): StudyStats | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stats = value as Record<string, unknown>;
  if (
    !isNonnegativeInteger(stats.likedCount) ||
    !isNonnegativeInteger(stats.viewedCount) ||
    stats.likedCount > stats.viewedCount ||
    (stats.medianVoteTimeMs !== null && !isNonnegativeInteger(stats.medianVoteTimeMs)) ||
    (stats.medianNavigationTimeMs !== null && !isNonnegativeInteger(stats.medianNavigationTimeMs))
  ) return null;

  const hasSessionCount = stats.sessionCount !== undefined && stats.sessionCount !== null;
  if (hasSessionCount && !isNonnegativeInteger(stats.sessionCount)) return null;

  return {
    likedCount: stats.likedCount,
    viewedCount: stats.viewedCount,
    medianVoteTimeMs: stats.medianVoteTimeMs,
    medianNavigationTimeMs: stats.medianNavigationTimeMs,
    ...(hasSessionCount ? { sessionCount: stats.sessionCount as number } : {}),
  };
}
