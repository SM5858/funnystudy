import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tables } from "@/types/supabase";

export type StudyParticipation = Tables<"study_participations">;

export function isStudyCompleted(participation?: StudyParticipation | null) {
  return Boolean(participation?.started_at && participation.ended_at);
}

export async function fetchStudyParticipations(
  supabase: SupabaseClient,
  profileId: string,
  studyIds: number[]
) {
  if (studyIds.length === 0) return { participations: [], error: null };

  const { data, error } = await supabase
    .from("study_participations")
    .select("profile_id, study_id, started_at, ended_at, completion_stats")
    .eq("profile_id", profileId)
    .in("study_id", studyIds);

  return { participations: (data ?? []) as StudyParticipation[], error };
}
