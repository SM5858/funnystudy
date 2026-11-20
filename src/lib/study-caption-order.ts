export const STUDY_CAPTION_BATCH_SIZE = 200;

export function shuffleStudyCaptionIds(captionIds: readonly string[]) {
  const shuffled = [...captionIds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

/**
 * Where a caption sits in the whole study, not just in this run's queue.
 *
 * Captions seen in earlier sittings are not dealt again, so the queue is
 * shorter than the study. `seenBeforeThisRun` puts the readout back on the
 * study's own scale, and because it is known at first render the counter never
 * shows 1 and then corrects itself.
 */
export function captionProgressPosition({
  currentIndex,
  queueLength,
  seenBeforeThisRun,
  totalCaptionCount,
}: {
  currentIndex: number;
  queueLength: number;
  seenBeforeThisRun: number;
  totalCaptionCount: number;
}) {
  const seen = Math.max(0, seenBeforeThisRun);
  const total = Math.max(totalCaptionCount, seen + Math.max(0, queueLength));
  const position = Math.min(total, seen + Math.max(0, currentIndex) + 1);

  return { position, total };
}

/**
 * The readout a sighted participant glances at. "7 of 13" says what "7/13"
 * only implied: a slash is a ratio, and participants read it as a score.
 */
export function formatCaptionProgressLabel(progress: {
  position: number;
  total: number;
}) {
  return `${progress.position.toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")}`;
}

/**
 * The same position, spoken. A screen reader reads the bare numbers out of
 * context, so the announcement names what is being counted.
 */
export function formatCaptionProgressAnnouncement(progress: {
  position: number;
  total: number;
}) {
  return `Caption ${formatCaptionProgressLabel(progress)}`;
}

export function captionProgressPercent({
  position,
  total,
}: {
  position: number;
  total: number;
}) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((position / total) * 100)));
}
