import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import {
  fetchActiveStudyCaptionIdentities,
  type StudyCaptionIdentity,
} from "@/lib/studies";

// Supabase rejects very long `in` lists, so scoped lookups go out in chunks.
const QUERY_CHUNK_SIZE = 250;
const PAGE_SIZE = 1000;

type StudyEventRow = {
  caption_id: string | null;
  session_id: string | null;
  time_to_vote_ms?: number | null;
  time_to_next_caption_ms?: number | null;
};

/**
 * Everything a participant has already done to this study's captions, across
 * every sitting. A caption counts as seen once the participant advanced past
 * it (a navigation event) or liked it (a vote event); liking without advancing
 * happens when someone likes a caption and then closes the tab, and re-showing
 * that caption would be exactly the duplicate exposure we are removing.
 */
export type StudyCaptionEventState = {
  error: PostgrestError | null;
  navigationTimesMs: number[];
  seenCaptionIds: Set<string>;
  sessionIds: Set<string>;
  voteTimesMs: number[];
};

export type StudyProgress = {
  remainingCount: number;
  seenCount: number;
  sessionCount: number;
  totalCount: number;
};

function chunk<T>(values: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size));
  }

  return chunks;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function collectRows(
  rows: StudyEventRow[],
  state: {
    navigationTimesMs: number[];
    seenCaptionIds: Set<string>;
    sessionIds: Set<string>;
    voteTimesMs: number[];
  }
) {
  rows.forEach((row) => {
    if (typeof row.caption_id === "string" && row.caption_id.length > 0) {
      state.seenCaptionIds.add(row.caption_id);
    }

    if (typeof row.session_id === "string" && row.session_id.length > 0) {
      state.sessionIds.add(row.session_id);
    }

    if (isNonnegativeInteger(row.time_to_vote_ms)) {
      state.voteTimesMs.push(row.time_to_vote_ms);
    }

    if (isNonnegativeInteger(row.time_to_next_caption_ms)) {
      state.navigationTimesMs.push(row.time_to_next_caption_ms);
    }
  });
}

async function readScopedEvents(
  supabase: SupabaseClient,
  table: "study_caption_vote_events" | "study_caption_navigation_events",
  selection: string,
  profileId: string,
  identities: readonly StudyCaptionIdentity[],
  state: {
    navigationTimesMs: number[];
    seenCaptionIds: Set<string>;
    sessionIds: Set<string>;
    voteTimesMs: number[];
  }
): Promise<PostgrestError | null> {
  const mappingIds = identities
    .map((identity) => identity.mappingId)
    .filter(
      (mappingId): mappingId is number =>
        typeof mappingId === "number" &&
        Number.isSafeInteger(mappingId) &&
        mappingId > 0
    );
  const captionIds = identities.map((identity) => identity.captionId);

  for (const mappingIdChunk of chunk(mappingIds, QUERY_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select(selection)
        .eq("profile_id", profileId)
        .in("study_caption_mapping_id", mappingIdChunk)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return error;
      }

      const rows = (data ?? []) as unknown as StudyEventRow[];
      collectRows(rows, state);

      if (rows.length < PAGE_SIZE) {
        break;
      }
    }
  }

  // Older events were written before mappings were recorded; match them by
  // caption instead so a participant's earlier sittings still count.
  for (const captionIdChunk of chunk(captionIds, QUERY_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(table)
        .select(selection)
        .eq("profile_id", profileId)
        .is("study_caption_mapping_id", null)
        .in("caption_id", captionIdChunk)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return error;
      }

      const rows = (data ?? []) as unknown as StudyEventRow[];
      collectRows(rows, state);

      if (rows.length < PAGE_SIZE) {
        break;
      }
    }
  }

  return null;
}

export async function fetchStudyCaptionEventState(
  supabase: SupabaseClient,
  profileId: string,
  identities: readonly StudyCaptionIdentity[]
): Promise<StudyCaptionEventState> {
  const state = {
    navigationTimesMs: [] as number[],
    seenCaptionIds: new Set<string>(),
    sessionIds: new Set<string>(),
    voteTimesMs: [] as number[],
  };

  if (identities.length === 0) {
    return { ...state, error: null };
  }

  const navigationError = await readScopedEvents(
    supabase,
    "study_caption_navigation_events",
    "caption_id, session_id, time_to_next_caption_ms",
    profileId,
    identities,
    state
  );

  if (navigationError) {
    return { ...state, error: navigationError };
  }

  const voteError = await readScopedEvents(
    supabase,
    "study_caption_vote_events",
    "caption_id, session_id, time_to_vote_ms",
    profileId,
    identities,
    state
  );

  return { ...state, error: voteError };
}

/**
 * The participant's place in one study: how many of its captions they have
 * already seen, how many are left, and how many sittings produced that.
 * Returning an error here is deliberate — falling back to "nothing seen" would
 * silently restart the study from the beginning, which is the bug being fixed.
 */
export async function fetchStudyProgress(
  supabase: SupabaseClient,
  profileId: string,
  {
    includePrivateStudies = false,
    now = new Date(),
    studyId,
  }: {
    includePrivateStudies?: boolean;
    now?: Date;
    studyId: number;
  }
): Promise<{
  error: PostgrestError | null;
  identities: StudyCaptionIdentity[];
  progress: StudyProgress;
  seenCaptionIds: Set<string>;
}> {
  const emptyProgress: StudyProgress = {
    remainingCount: 0,
    seenCount: 0,
    sessionCount: 0,
    totalCount: 0,
  };
  const { identities, error: identitiesError } =
    await fetchActiveStudyCaptionIdentities(supabase, now, {
      includePrivateStudies,
      studyId,
    });

  if (identitiesError) {
    return {
      error: identitiesError,
      identities: [],
      progress: emptyProgress,
      seenCaptionIds: new Set<string>(),
    };
  }

  const eventState = await fetchStudyCaptionEventState(
    supabase,
    profileId,
    identities
  );

  if (eventState.error) {
    return {
      error: eventState.error,
      identities,
      progress: { ...emptyProgress, totalCount: identities.length },
      seenCaptionIds: new Set<string>(),
    };
  }

  const studyCaptionIds = new Set(
    identities.map((identity) => identity.captionId)
  );
  const seenCaptionIds = new Set(
    Array.from(eventState.seenCaptionIds).filter((captionId) =>
      studyCaptionIds.has(captionId)
    )
  );
  const totalCount = identities.length;
  const seenCount = Math.min(totalCount, seenCaptionIds.size);

  return {
    error: null,
    identities,
    progress: {
      remainingCount: Math.max(0, totalCount - seenCount),
      seenCount,
      sessionCount: eventState.sessionIds.size,
      totalCount,
    },
    seenCaptionIds,
  };
}

/**
 * The captions in this study the participant currently has a like on. Likes
 * live in `caption_votes` and are deleted when a like is taken back, so this
 * is the live state rather than a count of like actions.
 */
export async function fetchLikedStudyCaptionIds(
  supabase: SupabaseClient,
  profileId: string,
  captionIds: readonly string[]
): Promise<{ likedCaptionIds: Set<string>; error: PostgrestError | null }> {
  const likedCaptionIds = new Set<string>();

  for (const captionIdChunk of chunk(captionIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("caption_votes")
      .select("caption_id")
      .eq("profile_id", profileId)
      .eq("is_from_study", true)
      .gt("vote_value", 0)
      .in("caption_id", captionIdChunk);

    if (error) {
      return { likedCaptionIds: new Set<string>(), error };
    }

    ((data ?? []) as Array<{ caption_id: string | null }>).forEach((row) => {
      if (typeof row.caption_id === "string" && row.caption_id.length > 0) {
        likedCaptionIds.add(row.caption_id);
      }
    });
  }

  return { likedCaptionIds, error: null };
}

export function medianOf(values: readonly number[]) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function formatStudyProgressLabel({
  seenCount,
  totalCount,
}: Pick<StudyProgress, "seenCount" | "totalCount">) {
  return `${seenCount.toLocaleString("en-US")} of ${totalCount.toLocaleString(
    "en-US"
  )} seen`;
}

export function studyProgressPercent({
  seenCount,
  totalCount,
}: Pick<StudyProgress, "seenCount" | "totalCount">) {
  if (totalCount <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((seenCount / totalCount) * 100)));
}

export function formatRemainingCaptions(remainingCount: number) {
  return remainingCount === 1
    ? "1 caption left"
    : `${remainingCount.toLocaleString("en-US")} captions left`;
}
