"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/solid";

import {
  captionProgressPercent,
  formatCaptionProgressAnnouncement,
} from "@/lib/study-caption-order";

/**
 * Moving between captions used to be a gesture you had to be told about:
 * swipe, scroll, or arrow keys, none of them on screen. This puts the two
 * directions on screen as real buttons, next to a progress bar that says how
 * far through the study the participant is -- the thing the resume change is
 * supposed to make obvious. The buttons are the same path the gestures take,
 * so keyboard and pointer users end up in the same place.
 */
export function CaptionNavigator({
  label,
  onNext,
  onPrevious,
  position,
  variant = "floating",
}: {
  label: string;
  onNext: () => void;
  onPrevious: () => void;
  position: { position: number; total: number };
  variant?: "floating" | "inline";
}) {
  const percent = captionProgressPercent(position);
  // Inside the vote bar the panel already provides the surface; a second
  // bordered pill inside it would read as two separate controls.
  const shellClassName =
    variant === "floating"
      ? "glass-panel pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--panel-border)] bg-[var(--vote-panel-surface)] px-1.5 py-1.5 shadow-[var(--vote-panel-shadow)] backdrop-blur-xl"
      : "pointer-events-auto flex w-full items-center justify-between gap-1";

  return (
    <div id="caption-navigator" className={shellClassName}>
      <CaptionNavigatorButton
        direction="previous"
        label="Back"
        onClick={onPrevious}
      />
      <div
        className="min-w-[96px] px-1.5 sm:min-w-[112px]"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={position.total}
        aria-valuenow={position.position}
        aria-valuetext={formatCaptionProgressAnnouncement(position)}
      >
        <p className="text-center text-sm font-semibold tabular-nums text-[var(--foreground)]">
          {label}
        </p>
        <div
          aria-hidden
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--progress-track)]"
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <CaptionNavigatorButton
        direction="next"
        label="Next"
        onClick={onNext}
      />
    </div>
  );
}

function CaptionNavigatorButton({
  direction,
  label,
  onClick,
}: {
  direction: "next" | "previous";
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === "next" ? ChevronDownIcon : ChevronUpIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      // The visible word is "Back"/"Next"; the spoken name says what moves,
      // because "Back" alone could just as well mean leaving the study.
      aria-label={direction === "next" ? "Next caption" : "Previous caption"}
      className="flex h-10 items-center gap-1 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] sm:text-[13px]"
    >
      {direction === "previous" ? <Icon aria-hidden className="h-4 w-4" /> : null}
      {label}
      {direction === "next" ? <Icon aria-hidden className="h-4 w-4" /> : null}
    </button>
  );
}
