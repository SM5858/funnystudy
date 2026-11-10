"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CompletedStudy } from "@/components/CompletedStudy";
import { isStudyCompleted, type StudyParticipation } from "@/lib/study-participation";

import {
  CaptionVoteFlow,
  type CaptionForVote,
} from "./CaptionVoteFlow";

export function CaptionVoteSection({
  captionOrder,
  captions,
  includePrivateStudies,
  initialNextOffset,
  initialTotalCaptionCount,
  initialParticipation,
  participationLoadError = false,
  loadError,
  reservedTopPx = 0,
  studyId,
}: {
  captionOrder: string[];
  captions: CaptionForVote[];
  includePrivateStudies?: boolean;
  initialNextOffset: number | null;
  initialTotalCaptionCount: number;
  initialParticipation: StudyParticipation | null;
  participationLoadError?: boolean;
  loadError: boolean;
  reservedTopPx?: number;
  studyId?: number | null;
}) {
  const [isCompactHeight, setIsCompactHeight] = useState(false);
  // Server-action revalidation must not replace an active run with the revisit
  // screen or reset its caption queue. A new route entry gets a fresh snapshot.
  const [entry] = useState({ captionOrder, captions, initialParticipation, initialNextOffset, initialTotalCaptionCount });
  const hasCaptions = entry.captions.length > 0;
  const showLoadErrorBanner = loadError && hasCaptions;
  const showLoadErrorState = loadError && !hasCaptions;

  useEffect(() => {
    const update = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      setIsCompactHeight(height < 520);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const flowPadding = isCompactHeight ? "pb-4 pt-4" : "";

  return (
    <div
      id="vote-section-inner"
      className={`relative mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col items-center justify-start overflow-visible rounded-3xl py-3 sm:py-4 text-[var(--foreground)] gap-3 sm:gap-4 lg:gap-5 ${flowPadding}`}
    >
      {showLoadErrorBanner ? (
        <p className="w-full max-w-xl rounded-xl bg-[var(--error-bg)] px-4 py-3 text-center text-sm font-semibold text-[var(--error-text)] ring-1 ring-[var(--error-border)]">
          We couldn&apos;t load captions right now. Please refresh and try
          again.
        </p>
      ) : null}

      <div
        id="vote-section-flow-shell"
        className="flex w-full max-w-4xl flex-1 min-h-0 items-center justify-center"
      >
        {participationLoadError ? (
          <div role="alert" className="glass-panel w-full max-w-xl rounded-2xl p-6 text-center">
            <p className="text-lg font-semibold">We couldn&apos;t load your study progress</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Please refresh and try again.</p>
          </div>
        ) : isStudyCompleted(entry.initialParticipation) && entry.initialParticipation ? (
          <CompletedStudy participation={entry.initialParticipation} />
        ) : showLoadErrorState ? (
          <div
            id="vote-load-error-state"
            className="glass-panel w-full max-w-xl rounded-2xl border border-[var(--error-border)] bg-[var(--error-bg)] p-6 text-center text-[var(--foreground)] shadow-inner"
          >
            <p className="text-lg font-semibold text-[var(--error-text)]">
              We couldn&apos;t load captions
            </p>
            <p className="mt-2 text-sm text-[var(--soft)]">
              Refresh and try again. We&apos;re not showing an all-caught-up
              state because the caption query failed.
            </p>
          </div>
        ) : !hasCaptions ? (
          <div
            id="no-study-captions-state"
            className="glass-panel w-full max-w-xl rounded-2xl border border-[var(--panel-border)] bg-[var(--vote-panel-surface)] p-6 text-center text-[var(--foreground)] shadow-[var(--vote-panel-shadow)] sm:p-8"
          >
            <h1 className="text-2xl font-bold sm:text-3xl">
              No captions available for this study
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--soft)] sm:text-base">
              Please choose another study or check back later.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
            >
              Back to studies
            </Link>
          </div>
        ) : (
          <CaptionVoteFlow
            captionOrder={entry.captionOrder}
            captions={entry.captions}
            includePrivateStudies={includePrivateStudies}
            initialNextOffset={entry.initialNextOffset}
            initialTotalCaptionCount={entry.initialTotalCaptionCount}
            initialParticipation={entry.initialParticipation}
            reservedTopPx={reservedTopPx}
            studyId={studyId}
          />
        )}
      </div>
    </div>
  );
}
