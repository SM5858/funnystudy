"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { StudyParticipation } from "@/lib/study-participation";
import { parseStudyStats, type StudyStats } from "@/lib/study-stats";

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

export async function endStudy(studyId: number, stats: StudyStats): Promise<StudyParticipationResult> {
  const validatedStats = parseStudyStats(stats);
  if (!validatedStats) return { success: false, error: "We couldn't save your study stats. Please refresh and try again." };
  return recordParticipation(studyId, "end_study", validatedStats);
}
