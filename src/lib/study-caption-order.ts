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

export function formatCaptionProgressLabel(progress: {
  position: number;
  total: number;
}) {
  return `${progress.position.toLocaleString("en-US")}/${progress.total.toLocaleString("en-US")}`;
}
