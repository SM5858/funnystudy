"use client";

import type { RefObject } from "react";

/**
 * The last step used to be a sentence and a button. It did not say how much of
 * the study it was about to record, it did not say that ending is final, and
 * the only way back to the captions was a gesture -- the same hidden-navigation
 * problem the caption screen had before it gained its Back and Next buttons.
 */
export function StudyEndPage({
  canGoBack,
  containerRef,
  ending,
  onBack,
  onEnd,
  pendingCount,
  totalCaptionCount,
}: {
  canGoBack: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  ending: boolean;
  onBack: () => void;
  onEnd: () => void;
  pendingCount: number;
  totalCaptionCount: number;
}) {
  const isSaving = ending || pendingCount > 0;

  return (
    <div className="flex min-h-0 w-full max-w-xl flex-1 items-center sm:max-w-2xl">
      <div
        data-native-scroll-region="true"
        ref={containerRef}
        tabIndex={-1}
        className="glass-panel max-h-full w-full overflow-y-auto overscroll-contain rounded-[28px] border border-[var(--panel-border)] bg-[var(--vote-panel-surface)] p-6 text-center shadow-[var(--vote-panel-shadow)] focus:outline-none sm:p-8"
      >
        <h1 className="text-2xl font-bold sm:text-3xl">You&apos;ve reached the end!</h1>
        {totalCaptionCount > 0 ? (
          <div
            className="mt-5 space-y-2 text-left"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalCaptionCount}
            aria-valuenow={totalCaptionCount}
            aria-valuetext={`All ${totalCaptionCount.toLocaleString(
              "en-US"
            )} captions seen`}
          >
            <p className="text-sm font-semibold text-[var(--foreground)]">
              All {totalCaptionCount.toLocaleString("en-US")} captions seen
            </p>
            <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-[var(--progress-track)]">
              <div className="h-full w-full rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        ) : null}
        <p className="mt-5 text-sm leading-6 text-[var(--soft)] sm:text-base">
          Ending the study saves your completion and opens your humor stats,
          counting every session you spent on it.
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--soft)] sm:text-base">
          This is the last step. Once a study is ended you cannot go back to its
          captions.
        </p>
        {pendingCount > 0 ? (
          <p role="status" className="mt-4 text-sm text-[var(--soft)]">Saving your last vote…</p>
        ) : null}
        <button type="button" onClick={onEnd} disabled={isSaving}
          className="mt-6 w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-wait disabled:opacity-60">
          {ending ? "Ending…" : "End Study"}
        </button>
        {/* The way back was a swipe nobody had been told about. It is offered
            only when this sitting actually has a caption behind it: a
            participant who returned with everything already seen has an empty
            queue, and a button that silently does nothing is worse than no
            button. The back arrow to the study list is still in the corner. */}
        {canGoBack ? (
          <button type="button" onClick={onBack} disabled={isSaving}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-[var(--panel-border)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] disabled:opacity-60">
            Back to captions
          </button>
        ) : null}
      </div>
    </div>
  );
}
