"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/solid";

import { saveDemographicQuestionAnswerSelection } from "@/app/demographics/actions";
import type { DemographicQuestion } from "@/lib/demographics";
import { DEMOGRAPHIC_SKIPS_COOKIE, encodeDemographicSkips } from "@/lib/demographic-skips";

const PREVIOUS_WINDOW_MS = 3600;

type PendingAnswer = {
  answerSelection: string;
  isLastQuestion: boolean;
  questionId: string;
  questionIndex: number;
  timeoutId: number;
};

type PreviousState = {
  questionIndex: number;
  selectedValue: string;
} | null;

export function DemographicQuestionCard({
  message,
  next,
  profileId,
  questions,
  skipped,
}: {
  message?: string | null;
  next: string;
  profileId: string;
  questions: readonly DemographicQuestion[];
  skipped: readonly string[];
}) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>(
    {}
  );
  const [previousState, setPreviousState] = useState<PreviousState>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const [answerSearch, setAnswerSearch] = useState("");
  const pendingSaveCountRef = useRef(0);
  const pendingAnswersRef = useRef(new Map<number, PendingAnswer>());
  const skippedRef = useRef<string[]>([...skipped]);
  const finishedRef = useRef(false);
  const redirectPathRef = useRef<string | null>(null);
  const question = questions[currentIndex] ?? null;
  const remaining = Math.max(questions.length - currentIndex, 0);
  const remainingLabel = useMemo(
    () => `${remaining.toLocaleString("en-US")} remaining`,
    [remaining]
  );
  const hasManyAnswers = (question?.options.length ?? 0) > 10;
  const visibleOptions = useMemo(() => {
    if (!question) {
      return [];
    }

    const query = answerSearch.trim().toLowerCase();

    if (!hasManyAnswers || !query) {
      return question.options;
    }

    return question.options.filter((option) =>
      option.label.toLowerCase().includes(query)
    );
  }, [answerSearch, hasManyAnswers, question]);

  const updatePendingSaveCount = useCallback((nextCount: number) => {
    pendingSaveCountRef.current = Math.max(0, nextCount);
    setPendingSaveCount(pendingSaveCountRef.current);
  }, []);

  const canFinish = useCallback(
    () =>
      finishedRef.current &&
      pendingAnswersRef.current.size === 0 &&
      pendingSaveCountRef.current === 0 &&
      redirectPathRef.current,
    []
  );

  const finishIfReady = useCallback(() => {
    const redirectPath = canFinish();

    if (redirectPath) {
      router.push(redirectPath);
    }
  }, [canFinish, router]);

  const saveAnswer = useCallback(
    async (pendingAnswer: Omit<PendingAnswer, "timeoutId">) => {
      updatePendingSaveCount(pendingSaveCountRef.current + 1);

      const result = await saveDemographicQuestionAnswerSelection({
        answerSelection: pendingAnswer.answerSelection,
        next,
        questionId: pendingAnswer.questionId,
        skippedQuestionIds: skippedRef.current,
      });

      updatePendingSaveCount(pendingSaveCountRef.current - 1);

      if (!result.success) {
        setSaveError(result.error);
        finishedRef.current = false;
        setAnswerSearch("");
        setCurrentIndex(pendingAnswer.questionIndex);
        return;
      }

      if (pendingAnswer.isLastQuestion) {
        redirectPathRef.current = result.redirectPath;
      }

      finishIfReady();
    },
    [finishIfReady, next, updatePendingSaveCount]
  );

  const clearPendingAnswer = useCallback((questionIndex: number) => {
    const pendingAnswer = pendingAnswersRef.current.get(questionIndex);

    if (!pendingAnswer) {
      return null;
    }

    window.clearTimeout(pendingAnswer.timeoutId);
    pendingAnswersRef.current.delete(questionIndex);
    return pendingAnswer;
  }, []);

  const commitPendingAnswer = useCallback(
    (pendingAnswer: PendingAnswer) => {
      window.clearTimeout(pendingAnswer.timeoutId);
      pendingAnswersRef.current.delete(pendingAnswer.questionIndex);
      setPreviousState((current) =>
        current?.questionIndex === pendingAnswer.questionIndex ? null : current
      );
      void saveAnswer(pendingAnswer);
    },
    [saveAnswer]
  );

  const commitPendingAnswersExcept = useCallback(
    (questionIndex: number | null = null) => {
      for (const pendingAnswer of pendingAnswersRef.current.values()) {
        if (pendingAnswer.questionIndex !== questionIndex) {
          commitPendingAnswer(pendingAnswer);
        }
      }
    },
    [commitPendingAnswer]
  );

  const scheduleSave = useCallback(
    (pendingAnswer: Omit<PendingAnswer, "timeoutId">) => {
      clearPendingAnswer(pendingAnswer.questionIndex);
      commitPendingAnswersExcept(pendingAnswer.questionIndex);

      const timeoutId = window.setTimeout(() => {
        pendingAnswersRef.current.delete(pendingAnswer.questionIndex);
        setPreviousState((current) =>
          current?.questionIndex === pendingAnswer.questionIndex ? null : current
        );
        void saveAnswer(pendingAnswer);
      }, PREVIOUS_WINDOW_MS);

      pendingAnswersRef.current.set(pendingAnswer.questionIndex, {
        ...pendingAnswer,
        timeoutId,
      });
    },
    [clearPendingAnswer, commitPendingAnswersExcept, saveAnswer]
  );

  const goForward = useCallback(
    (questionIndex: number) => {
      if (questionIndex >= questions.length - 1) {
        finishedRef.current = true;
        setCurrentIndex(questions.length);
        return;
      }

      setCurrentIndex(questionIndex + 1);
    },
    [questions.length]
  );

  const answerQuestion = useCallback(
    (answerSelection: string) => {
      if (!question) {
        return;
      }

      const questionIndex = currentIndex;
      const isLastQuestion = questionIndex >= questions.length - 1;

      setSaveError(null);
      setSelectedValues((current) => ({
        ...current,
        [question.id]: answerSelection,
      }));
      setAnswerSearch("");
      scheduleSave({
        answerSelection,
        isLastQuestion,
        questionId: question.id,
        questionIndex,
      });
      setPreviousState({ questionIndex, selectedValue: answerSelection });
      goForward(questionIndex);
    },
    [currentIndex, goForward, question, questions.length, scheduleSave]
  );

  const goBackToPrevious = useCallback(() => {
    if (!previousState) {
      return;
    }

    clearPendingAnswer(previousState.questionIndex);
    finishedRef.current = false;
    redirectPathRef.current = null;
    setAnswerSearch("");
    setCurrentIndex(previousState.questionIndex);
    setPreviousState(null);
  }, [clearPendingAnswer, previousState]);

  const skipQuestion = useCallback(() => {
    if (!question) {
      return;
    }

    skippedRef.current = [...skippedRef.current, question.id];
    // A session cookie lets the server honor "Skip for now" after returning
    // home. It is scoped to this user and cleared on the next successful login.
    document.cookie = `${DEMOGRAPHIC_SKIPS_COOKIE}=${encodeDemographicSkips(profileId, skippedRef.current)}; Path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    setSaveError(null);
    setPreviousState(null);
    setAnswerSearch("");
    commitPendingAnswersExcept();

    if (currentIndex >= questions.length - 1) {
      finishedRef.current = true;
      redirectPathRef.current = next;
      setCurrentIndex(questions.length);
      finishIfReady();
      return;
    }

    goForward(currentIndex);
    finishIfReady();
  }, [
    commitPendingAnswersExcept,
    currentIndex,
    finishIfReady,
    goForward,
    next,
    profileId,
    question,
    questions.length,
  ]);

  useEffect(() => {
    const pendingAnswers = pendingAnswersRef.current;

    return () => {
      for (const pendingAnswer of pendingAnswers.values()) {
        window.clearTimeout(pendingAnswer.timeoutId);
      }
    };
  }, []);

  if (!question) {
    return (
      <section
        className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card-surface)] p-6 text-center shadow-[var(--panel-shadow)] sm:p-8"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--soft)]">
            Participant Demographic Survey
          </p>
          <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
            Finishing up
          </h1>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            {pendingSaveCount ? "Saving your answers..." : "All set."}
          </p>
        </div>
        <div className="mt-5 flex min-h-9 items-center justify-start">
          <PreviousButton
            previousState={previousState}
            onPrevious={goBackToPrevious}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card-surface)] p-6 shadow-[var(--panel-shadow)] sm:p-8"
    >
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--soft)]">
            Participant Demographic Survey
          </p>
          <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
            {question.prompt}
          </h1>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--panel-border)] sm:mt-1">
          {remainingLabel}
        </span>
      </div>

      {question.description ? (
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          {question.description}
        </p>
      ) : null}

      {message || saveError ? (
        <p className="mt-5 rounded-lg bg-[color-mix(in_srgb,_var(--accent)_12%,_transparent)] px-4 py-3 text-sm font-medium text-[var(--foreground)] ring-1 ring-[color-mix(in_srgb,_var(--accent)_35%,_transparent)]">
          {saveError ?? message}
        </p>
      ) : null}

      <div className="mt-7">
        {hasManyAnswers ? (
          <label className="mb-3 block text-sm font-semibold text-[var(--foreground)]">
            Search answers
            <input
              type="search"
              value={answerSearch}
              onChange={(event) => setAnswerSearch(event.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-base text-[var(--foreground)] shadow-inner outline-none ring-1 ring-[var(--input-border)] transition focus:ring-2 focus:ring-[var(--input-ring)]"
              placeholder="Type to filter"
            />
          </label>
        ) : null}
      </div>

      <div
        className={
          hasManyAnswers
            ? "mt-3 max-h-80 overflow-y-auto px-1 pt-1"
            : ""
        }
        data-native-scroll-region={hasManyAnswers ? "true" : undefined}
      >
        <div className="grid gap-3">
          {visibleOptions.map((option) => {
            const value = `${option.mappingId}::${option.id}`;
            const isSelected = selectedValues[question.id] === value;

            return (
              <button
                key={option.mappingId}
                type="button"
                aria-pressed={isSelected}
                className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,_var(--accent)_12%,_var(--surface-muted))] hover:shadow-[0_12px_28px_-20px_color-mix(in_srgb,_var(--accent)_60%,_transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] ${
                  isSelected
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,_var(--accent)_18%,_transparent)]"
                    : "border-[var(--input-border)] bg-[var(--surface-muted)]"
                }`}
                onClick={() => answerQuestion(value)}
              >
                <span
                  aria-hidden
                  className={`h-4 w-4 shrink-0 rounded-full border ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,_var(--accent)_24%,_transparent)]"
                      : "border-[var(--input-border)]"
                  }`}
                />
                <span>{option.label}</span>
              </button>
            );
          })}
          {hasManyAnswers && !visibleOptions.length ? (
            <p className="rounded-lg border border-[var(--input-border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
              No matching answers.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 pt-2">
        <div className="flex min-h-9 items-center">
          {previousState ? (
            <PreviousButton
              previousState={previousState}
              onPrevious={goBackToPrevious}
            />
          ) : (
            <span aria-hidden />
          )}
        </div>
        <button
          type="button"
          className="rounded-lg border border-[var(--panel-border)] bg-[var(--surface-muted)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,_var(--accent)_12%,_var(--surface-muted))] hover:shadow-[0_12px_28px_-20px_color-mix(in_srgb,_var(--accent)_60%,_transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
          onClick={skipQuestion}
        >
          Skip for now
        </button>
      </div>
    </section>
  );
}

function PreviousButton({
  onPrevious,
  previousState,
}: {
  onPrevious: () => void;
  previousState: PreviousState;
}) {
  if (!previousState) {
    return null;
  }

  return (
    <div className="flex justify-start">
      <div
        key={previousState.questionIndex}
        className="demographic-previous-affordance pointer-events-auto flex items-center gap-2"
        style={{ animationDuration: `${PREVIOUS_WINDOW_MS}ms` }}
      >
        <button
          type="button"
          aria-label="Go back to previous question"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--panel-border)] bg-[var(--surface-muted)] text-[var(--foreground)] transition hover:-translate-x-0.5 hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
          onClick={onPrevious}
        >
          <ArrowUturnLeftIcon className="h-5 w-5" aria-hidden />
        </button>
        <span className="text-xs text-[var(--soft)]">
          Back to change your last answer
        </span>
      </div>
    </div>
  );
}
