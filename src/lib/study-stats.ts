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

/**
 * Stats are read by participants, not by analysts. "1,344 ms" is the number we
 * happen to store; nobody reads it as "about a second and a third", so the
 * screen says the duration in the units a person would use out loud.
 */
export function formatStudyDuration(milliseconds: number | null) {
  if (milliseconds === null) {
    return "Not recorded";
  }

  if (milliseconds < 100) {
    return "Under 0.1 seconds";
  }

  // Round before choosing the unit, so 9.95s reads as "10 seconds" rather than
  // "10.0 seconds" and 59.5s reads as "1 minute" rather than "60 seconds".
  const seconds = milliseconds / 1000;
  const tenths = Math.round(seconds * 10) / 10;

  if (tenths < 10) {
    return `${tenths.toFixed(1)} seconds`;
  }

  const wholeSeconds = Math.round(seconds);

  if (wholeSeconds < 60) {
    return `${wholeSeconds} seconds`;
  }

  const wholeMinutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds - wholeMinutes * 60;
  const minutePart = wholeMinutes === 1 ? "1 minute" : `${wholeMinutes} minutes`;

  if (remainingSeconds === 0) {
    return minutePart;
  }

  return `${minutePart} ${remainingSeconds} seconds`;
}
