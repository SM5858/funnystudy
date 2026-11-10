"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { StudyParticipation } from "@/lib/study-participation";
import {
  fetchLikedStudyCaptionIds,
  fetchStudyCaptionEventState,
  medianOf,
} from "@/lib/study-progress";
import { fetchActiveStudyCaptionIdentities } from "@/lib/studies";
import { parseStudyStats, type StudyStats } from "@/lib/study-stats";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StudyParticipationResult =
  | { success: true; participation: StudyParticipation }
  | { success: false; error: string };

async function recordParticipation(
  studyId: number,
  action: "start_study" | "end_study",
  stats?: StudyStats
): Promise<StudyParticipationResult> {
  if (!Number.isSafeInteger(studyId) || studyId <= 0) {
    return { success: false, error: "Invalid study." };
  }

  const supabase = await createClient({ allowCookieWrite: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  // SECURITY INVOKER functions use this user's JWT and RLS. The database owns
  // the timestamps and preserves them across duplicate/concurrent requests.
  const args = stats
    ? { p_study_id: studyId, p_completion_stats: stats }
    : { p_study_id: studyId };
  const { data, error } = await supabase.rpc(action, args).single();
  if (error || !data) {
    console.error(`[${action}] record participation failed`, error);
    return {
      success: false,
      error: action === "start_study"
        ? "We couldn't start this study. Please try again; it may no longer be active."
        : "We couldn't end this study. Please try again.",
    };
  }

  revalidatePath("/");
  return { success: true, participation: data as StudyParticipation };
}

export async function startStudy(studyId: number): Promise<StudyParticipationResult> {
  return recordParticipation(studyId, "start_study");
}

/**
 * Widens one sitting's stats to cover every sitting of this study.
 *
 * The browser only knows what happened since the page loaded, so a study
 * finished over three visits used to save the third visit's numbers. The
 * recorded events know the whole history, and the sitting's own numbers stay
 * as a floor: navigation telemetry is fire-and-forget, so the very last
 * caption's event can still be in flight when End Study is pressed.
 */
async function widenStatsAcrossSittings(
  supabase: SupabaseClient,
  profileId: string,
  studyId: number,
  sessionStats: StudyStats
): Promise<StudyStats> {
  const { identities, error: identitiesError } =
    await fetchActiveStudyCaptionIdentities(supabase, new Date(), {
      includePrivateStudies: true,
      studyId,
    });

  if (identitiesError || identities.length === 0) {
    if (identitiesError) {
      console.error("[endStudy] load study captions failed", identitiesError);
    }
    return sessionStats;
  }

  const captionIds = identities.map((identity) => identity.captionId);
  const [eventState, { likedCaptionIds, error: likedError }] = await Promise.all([
    fetchStudyCaptionEventState(supabase, profileId, identities),
    fetchLikedStudyCaptionIds(supabase, profileId, captionIds),
  ]);

  if (eventState.error || likedError) {
    console.error(
      "[endStudy] load study history failed",
      eventState.error ?? likedError
    );
    return sessionStats;
  }

  const studyCaptionIds = new Set(captionIds);
  const seenCount = Array.from(eventState.seenCaptionIds).filter((captionId) =>
    studyCaptionIds.has(captionId)
  ).length;
  const viewedCount = Math.min(
    identities.length,
    Math.max(seenCount, sessionStats.viewedCount)
  );
  const likedCount = Math.min(
    viewedCount,
    Math.max(likedCaptionIds.size, sessionStats.likedCount)
  );
  const medianVoteTimeMs = eventState.voteTimesMs.length
    ? medianOf(eventState.voteTimesMs)
    : sessionStats.medianVoteTimeMs;
  const medianNavigationTimeMs = eventState.navigationTimesMs.length
    ? medianOf(eventState.navigationTimesMs)
    : sessionStats.medianNavigationTimeMs;

  return {
    likedCount,
    medianNavigationTimeMs,
    medianVoteTimeMs,
    sessionCount: Math.max(1, eventState.sessionIds.size),
    viewedCount,
  };
}

export async function endStudy(studyId: number, stats: StudyStats): Promise<StudyParticipationResult> {
  const validatedStats = parseStudyStats(stats);
  if (!validatedStats) return { success: false, error: "We couldn't save your study stats. Please refresh and try again." };

  if (!Number.isSafeInteger(studyId) || studyId <= 0) {
    return { success: false, error: "Invalid study." };
  }

  const supabase = await createClient({ allowCookieWrite: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in to continue." };

  const widenedStats = parseStudyStats(
    await widenStatsAcrossSittings(supabase, user.id, studyId, validatedStats)
  );

  return recordParticipation(
    studyId,
    "end_study",
    widenedStats ?? validatedStats
  );
}
