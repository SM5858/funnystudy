export type StudyStats = {
  likedCount: number;
  viewedCount: number;
  medianVoteTimeMs: number | null;
  medianNavigationTimeMs: number | null;
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

  return {
    likedCount: stats.likedCount,
    viewedCount: stats.viewedCount,
    medianVoteTimeMs: stats.medianVoteTimeMs,
    medianNavigationTimeMs: stats.medianNavigationTimeMs,
  };
}
