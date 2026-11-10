import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { StudyVoteValue } from "@/lib/caption-votes";
import type { Tables } from "@/types/supabase";

type StudyVoteHistoryRow = Pick<
  Tables<"study_caption_vote_events">,
  "id" | "caption_id" | "client_event_id" | "study_caption_mapping_id" | "vote_value"
>;

type StudyVoteScopeSets = {
  activeCaptionIds: Set<string>;
  activeStudyCaptionMappingIds: Set<number>;
};

export type StudyVoteScope = {
  activeCaptionIds: string[];
  activeStudyCaptionMappingIds: number[];
};

export type UndoableStudyVote = {
  captionId: string;
  clientEventId: string;
  studyCaptionMappingId: number | null;
  value: StudyVoteValue;
};

export type PersistedUndoableStudyVote = UndoableStudyVote & {
  id: number;
};

type ScopedStudyVoteRow = Pick<
  Tables<"study_caption_vote_events">,
  "caption_id" | "study_caption_mapping_id"
>;

export function createStudyVoteScopeFromCaptions(
  captions: Array<{
    id: string;
    studyCaptionMappingId: number | null;
  }>
): StudyVoteScope {
  const activeCaptionIds = new Set<string>();
  const activeStudyCaptionMappingIds = new Set<number>();

  captions.forEach((caption) => {
    const trimmedId = caption.id.trim();

    if (trimmedId) {
      activeCaptionIds.add(trimmedId);
    }

    if (
      typeof caption.studyCaptionMappingId === "number" &&
      Number.isSafeInteger(caption.studyCaptionMappingId) &&
      caption.studyCaptionMappingId > 0
    ) {
      activeStudyCaptionMappingIds.add(caption.studyCaptionMappingId);
    }
  });

  return {
    activeCaptionIds: Array.from(activeCaptionIds),
    activeStudyCaptionMappingIds: Array.from(activeStudyCaptionMappingIds),
  };
}

function normalizeStudyVoteScope(scope: StudyVoteScope): StudyVoteScopeSets {
  const activeCaptionIds = new Set<string>();
  const activeStudyCaptionMappingIds = new Set<number>();

  scope.activeCaptionIds.forEach((captionId) => {
    const trimmedId = captionId.trim();

    if (trimmedId) {
      activeCaptionIds.add(trimmedId);
    }
  });

  scope.activeStudyCaptionMappingIds.forEach((mappingId) => {
    if (Number.isSafeInteger(mappingId) && mappingId > 0) {
      activeStudyCaptionMappingIds.add(mappingId);
    }
  });

  return {
    activeCaptionIds,
    activeStudyCaptionMappingIds,
  };
}

function matchesStudyVoteScope(
  vote: Pick<StudyVoteHistoryRow, "caption_id" | "study_caption_mapping_id">,
  scope: StudyVoteScopeSets
) {
  if (typeof vote.study_caption_mapping_id === "number") {
    return scope.activeStudyCaptionMappingIds.has(vote.study_caption_mapping_id);
  }

  return scope.activeCaptionIds.has(vote.caption_id);
}

function mapUndoableStudyVote(
  vote: StudyVoteHistoryRow
): PersistedUndoableStudyVote {
  return {
    id: vote.id,
    captionId: vote.caption_id,
    clientEventId: vote.client_event_id,
    studyCaptionMappingId: vote.study_caption_mapping_id,
    value: vote.vote_value,
  };
}

export async function fetchStudyVoteHistoryForScope(
  supabase: SupabaseClient,
  profileId: string,
  scope: StudyVoteScope
): Promise<{ history: UndoableStudyVote[]; error: PostgrestError | null }> {
  const normalizedScope = normalizeStudyVoteScope(scope);

  if (
    normalizedScope.activeCaptionIds.size === 0 &&
    normalizedScope.activeStudyCaptionMappingIds.size === 0
  ) {
    return { history: [], error: null };
  }

  const PAGE_SIZE = 1000;
  const history: UndoableStudyVote[] = [];
  let from = 0;
  let error: PostgrestError | null = null;

  while (true) {
    const { data, error: pageError } = await supabase
      .from("study_caption_vote_events")
      .select("id, caption_id, client_event_id, study_caption_mapping_id, vote_value")
      .eq("profile_id", profileId)
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (pageError) {
      error = pageError;
      break;
    }

    const rows = (data ?? []) as StudyVoteHistoryRow[];

    rows.forEach((vote) => {
      if (matchesStudyVoteScope(vote, normalizedScope)) {
        history.push(mapUndoableStudyVote(vote));
      }
    });

    if (rows.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return { history, error };
}

export async function fetchVotedStudyScopeState(
  supabase: SupabaseClient,
  profileId: string,
  scope: StudyVoteScope
): Promise<{
  votedCaptionIdsWithoutMapping: string[];
  votedStudyCaptionMappingIds: number[];
  error: PostgrestError | null;
}> {
  const normalizedScope = normalizeStudyVoteScope(scope);

  if (
    normalizedScope.activeCaptionIds.size === 0 &&
    normalizedScope.activeStudyCaptionMappingIds.size === 0
  ) {
    return {
      votedCaptionIdsWithoutMapping: [],
      votedStudyCaptionMappingIds: [],
      error: null,
    };
  }

  const QUERY_CHUNK_SIZE = 250;
  const votedCaptionIdsWithoutMapping = new Set<string>();
  const votedStudyCaptionMappingIds = new Set<number>();

  const activeStudyCaptionMappingIds = Array.from(
    normalizedScope.activeStudyCaptionMappingIds
  );
  for (
    let start = 0;
    start < activeStudyCaptionMappingIds.length;
    start += QUERY_CHUNK_SIZE
  ) {
    const mappingIdChunk = activeStudyCaptionMappingIds.slice(
      start,
      start + QUERY_CHUNK_SIZE
    );

    const { data, error } = await supabase
      .from("study_caption_vote_events")
      .select("caption_id, study_caption_mapping_id")
      .eq("profile_id", profileId)
      .in("study_caption_mapping_id", mappingIdChunk);

    if (error) {
      return {
        votedCaptionIdsWithoutMapping: [],
        votedStudyCaptionMappingIds: [],
        error,
      };
    }

    const rows = (data ?? []) as ScopedStudyVoteRow[];
    rows.forEach((vote) => {
      if (typeof vote.study_caption_mapping_id === "number") {
        votedStudyCaptionMappingIds.add(vote.study_caption_mapping_id);
      }
    });
  }

  const activeCaptionIds = Array.from(normalizedScope.activeCaptionIds);
  for (let start = 0; start < activeCaptionIds.length; start += QUERY_CHUNK_SIZE) {
    const captionIdChunk = activeCaptionIds.slice(start, start + QUERY_CHUNK_SIZE);

    const { data, error } = await supabase
      .from("study_caption_vote_events")
      .select("caption_id, study_caption_mapping_id")
      .eq("profile_id", profileId)
      .is("study_caption_mapping_id", null)
      .in("caption_id", captionIdChunk);

    if (error) {
      return {
        votedCaptionIdsWithoutMapping: [],
        votedStudyCaptionMappingIds: [],
        error,
      };
    }

    const rows = (data ?? []) as ScopedStudyVoteRow[];
    rows.forEach((vote) => {
      if (typeof vote.caption_id === "string" && vote.caption_id.length > 0) {
        votedCaptionIdsWithoutMapping.add(vote.caption_id);
      }
    });
  }

  return {
    votedCaptionIdsWithoutMapping: Array.from(votedCaptionIdsWithoutMapping),
    votedStudyCaptionMappingIds: Array.from(votedStudyCaptionMappingIds),
    error: null,
  };
}

export async function findMostRecentStudyVoteForScope(
  supabase: SupabaseClient,
  profileId: string,
  scope: StudyVoteScope
): Promise<{ vote: PersistedUndoableStudyVote | null; error: PostgrestError | null }> {
  const normalizedScope = normalizeStudyVoteScope(scope);

  if (
    normalizedScope.activeCaptionIds.size === 0 &&
    normalizedScope.activeStudyCaptionMappingIds.size === 0
  ) {
    return { vote: null, error: null };
  }

  const PAGE_SIZE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("study_caption_vote_events")
      .select("id, caption_id, client_event_id, study_caption_mapping_id, vote_value")
      .eq("profile_id", profileId)
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { vote: null, error };
    }

    const rows = (data ?? []) as StudyVoteHistoryRow[];
    const matchingVote = rows.find((vote) =>
      matchesStudyVoteScope(vote, normalizedScope)
    );

    if (matchingVote) {
      return { vote: mapUndoableStudyVote(matchingVote), error: null };
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return { vote: null, error: null };
}
