export const STUDY_CAPTION_BATCH_SIZE = 200;

export function shuffleStudyCaptionIds(captionIds: readonly string[]) {
  const shuffled = [...captionIds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}
