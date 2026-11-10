"use server";

import { resolveStudyCaptionImageUrl } from "@/lib/caption-images";
import { createClient } from "@/lib/supabase/server";
import {
  STUDY_VOTE_VALUES,
  VOTE_INPUT_METHODS,
  mapStudyVoteToCaptionVote,
  type StudyVoteValue,
  type VoteInputMethod,
} from "@/lib/caption-votes";
import {
  fetchActiveStudyCaptions,
  fetchActiveStudyCaptionPage,
} from "@/lib/studies";
import {
  createStudyVoteScopeFromCaptions,
  findMostRecentStudyVoteForScope,
  type UndoableStudyVote,
} from "@/lib/study-vote-history";
import type { TablesInsert } from "@/types/supabase";
import { STUDY_CAPTION_BATCH_SIZE } from "@/lib/study-caption-order";

export type SaveVoteResult =
  | { success: true }
  | { success: false; error: string };
export type SaveNavigationResult =
  | { success: true }
  | { success: false; error: string };
export type SaveCaptionSaveResult =
  | { success: true }
  | { success: false; error: string };
export type RemoveVoteResult =
  | { success: true }
  | { success: false; error: string };
export type RemoveCaptionSaveResult =
  | { success: true }
  | { success: false; error: string };
export type UndoVoteResult =
  | { success: true; undoneVote: UndoableStudyVote }
  | { success: false; error: string; noUndoableVote?: boolean };
export type LoadMoreCaptionsResult =
  | {
      success: true;
      captions: Array<{
        content: string | null;
        id: string;
        imageSrc: string | null;
        isLiked: boolean;
        isSaved: boolean;
        studyCaptionMappingId: number | null;
      }>;
    }
  | { success: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadMoreCaptionVoteCaptions({
  captionIds,
  includePrivateStudies,
  studyId,
}: {
  captionIds: string[];
  includePrivateStudies?: boolean;
  studyId?: number | null;
}): Promise<LoadMoreCaptionsResult> {
  const normalizedStudyId =
    typeof studyId === "number" && Number.isSafeInteger(studyId) && studyId > 0
      ? studyId
      : null;

  if (
    !Array.isArray(captionIds) ||
    captionIds.length === 0 ||
    captionIds.length > STUDY_CAPTION_BATCH_SIZE ||
    captionIds.some((id) => typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
    normalizedStudyId === null
  ) {
    return { success: false, error: "Invalid caption page" };
  }

  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in" };
  }

  const { captions, error } = await fetchActiveStudyCaptionPage(
    supabase,
    user.id,
    {
      captionIds,
      includePrivateStudies: Boolean(includePrivateStudies),
      studyId: normalizedStudyId,
    }
  );

  if (error) {
    console.error("[loadMoreCaptionVoteCaptions] load captions failed", error);
    return {
      success: false,
      error: "Could not load more captions. Please try again.",
    };
  }

  return {
    success: true,
    captions: captions.map((caption) => ({
      content: caption.content,
      id: caption.id,
      imageSrc: resolveStudyCaptionImageUrl(caption),
      isLiked: caption.is_liked,
      isSaved: caption.is_saved,
      studyCaptionMappingId: caption.study_caption_mapping_id,
    })),
  };
}

export async function saveCaptionSave({
  captionId,
}: {
  captionId: string;
}): Promise<SaveCaptionSaveResult> {
  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in" };
  }

  const trimmedId = captionId.trim();

  if (!trimmedId) {
    return { success: false, error: "Invalid save target" };
  }

  const savePayload: TablesInsert<"caption_saves"> = {
    caption_id: trimmedId,
    created_by_user_id: user.id,
    modified_by_user_id: user.id,
    profile_id: user.id,
  };

  const { error } = await supabase.from("caption_saves").upsert(savePayload, {
    onConflict: "caption_id,profile_id",
  });

  if (error) {
    console.error("[saveCaptionSave] save caption_saves row failed", error);
    return { success: false, error: "Could not save bookmark. Please try again." };
  }

  return { success: true };
}

export async function removeCaptionSave({
  captionId,
}: {
  captionId: string;
}): Promise<RemoveCaptionSaveResult> {
  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in" };
  }

  const trimmedId = captionId.trim();

  if (!trimmedId) {
    return { success: false, error: "Invalid save target" };
  }

  const { error } = await supabase
    .from("caption_saves")
    .delete()
    .eq("profile_id", user.id)
    .eq("caption_id", trimmedId);

  if (error) {
    console.error("[removeCaptionSave] delete caption_saves row failed", error);
    return { success: false, error: "Could not remove bookmark. Please try again." };
  }

  return { success: true };
}

export async function saveCaptionVote({
  captionId,
  clientEventId,
  inputMethod,
  sessionId,
  studyCaptionMappingId,
  timeToVoteMs,
  value,
}: {
  captionId: string;
  clientEventId: string;
  inputMethod: VoteInputMethod;
  sessionId: string | null;
  studyCaptionMappingId?: number | null;
  timeToVoteMs: number;
  value: StudyVoteValue;
}): Promise<SaveVoteResult> {
  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in" };
  }

  const trimmedId = captionId.trim();
  const trimmedClientEventId = clientEventId.trim();
  const trimmedSessionId = sessionId?.trim() || null;
  const normalizedTimeToVoteMs = Number.isFinite(timeToVoteMs)
    ? Math.max(0, Math.round(timeToVoteMs))
    : 0;
  const isValidValue = STUDY_VOTE_VALUES.includes(value);
  const isValidInputMethod = VOTE_INPUT_METHODS.includes(inputMethod);
  const normalizedStudyCaptionMappingId =
    typeof studyCaptionMappingId === "number" &&
    Number.isSafeInteger(studyCaptionMappingId) &&
    studyCaptionMappingId > 0
      ? studyCaptionMappingId
      : null;

  if (!trimmedId || !isValidValue || !isValidInputMethod || !UUID_PATTERN.test(trimmedClientEventId)) {
    return { success: false, error: "Invalid vote" };
  }

  const eventPayload: TablesInsert<"study_caption_vote_events"> = {
    caption_id: trimmedId,
    client_event_id: trimmedClientEventId,
    created_by_user_id: user.id,
    input_method: inputMethod,
    profile_id: user.id,
    session_id: UUID_PATTERN.test(trimmedSessionId ?? "")
      ? trimmedSessionId
      : null,
    study_caption_mapping_id: normalizedStudyCaptionMappingId,
    time_to_vote_ms: normalizedTimeToVoteMs,
    vote_value: value,
  };

  const { error } = await supabase
    .from("study_caption_vote_events")
    .upsert(eventPayload, {
      onConflict: "client_event_id",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error("[saveCaptionVote] save study vote failed", error);
    return { success: false, error: "Could not save vote. Please try again." };
  }

  const legacyVoteValue = mapStudyVoteToCaptionVote(value);

  if (legacyVoteValue === null) {
    return { success: true };
  }

  const legacyVotePayload: TablesInsert<"caption_votes"> = {
    caption_id: trimmedId,
    created_by_user_id: user.id,
    is_from_study: true,
    modified_by_user_id: user.id,
    profile_id: user.id,
    vote_value: legacyVoteValue,
  };

  const { error: captionVotesError } = await supabase
    .from("caption_votes")
    .upsert(legacyVotePayload, {
      onConflict: "profile_id,caption_id",
    });

  if (captionVotesError) {
    console.error("[saveCaptionVote] save caption_votes vote failed", captionVotesError);

    const { error: rollbackError } = await supabase
      .from("study_caption_vote_events")
      .delete()
      .eq("profile_id", user.id)
      .eq("client_event_id", trimmedClientEventId);

    if (rollbackError) {
      console.error(
        "[saveCaptionVote] rollback study vote after caption_votes failure failed",
        rollbackError
      );
    }

    return { success: false, error: "Could not save vote. Please try again." };
  }

  return { success: true };
}

export async function saveCaptionNavigationEvent({
  captionId,
  clientEventId,
  inputMethod,
  sessionId,
  studyCaptionMappingId,
  timeToNextCaptionMs,
}: {
  captionId: string;
  clientEventId: string;
  inputMethod: VoteInputMethod;
  sessionId: string | null;
  studyCaptionMappingId?: number | null;
  timeToNextCaptionMs: number;
}): Promise<SaveNavigationResult> {
  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in" };
  }

  const trimmedId = captionId.trim();
  const trimmedClientEventId = clientEventId.trim();
  const trimmedSessionId = sessionId?.trim() || null;
  const normalizedTimeToNextCaptionMs = Number.isFinite(timeToNextCaptionMs)
    ? Math.max(0, Math.round(timeToNextCaptionMs))
    : 0;
  const isValidInputMethod = VOTE_INPUT_METHODS.includes(inputMethod);
  const normalizedStudyCaptionMappingId =
    typeof studyCaptionMappingId === "number" &&
    Number.isSafeInteger(studyCaptionMappingId) &&
    studyCaptionMappingId > 0
      ? studyCaptionMappingId
      : null;

  if (!trimmedId || !isValidInputMethod || !UUID_PATTERN.test(trimmedClientEventId)) {
    return { success: false, error: "Invalid navigation event" };
  }

  const eventPayload: TablesInsert<"study_caption_navigation_events"> = {
    caption_id: trimmedId,
    client_event_id: trimmedClientEventId,
    created_by_user_id: user.id,
    input_method: inputMethod,
    profile_id: user.id,
    session_id: UUID_PATTERN.test(trimmedSessionId ?? "")
      ? trimmedSessionId
      : null,
    study_caption_mapping_id: normalizedStudyCaptionMappingId,
    time_to_next_caption_ms: normalizedTimeToNextCaptionMs,
  };

  const { error } = await supabase
    .from("study_caption_navigation_events")
    .upsert(eventPayload, {
      onConflict: "client_event_id",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error("[saveCaptionNavigationEvent] save navigation event failed", error);
    return {
      success: false,
      error: "Could not save navigation telemetry. Please try again.",
    };
  }

  return { success: true };
}

async function syncLegacyCaptionVoteAfterUndo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  captionId: string
) {
  const { data: remainingVotes, error: remainingVoteError } = await supabase
    .from("study_caption_vote_events")
    .select("vote_value")
    .eq("profile_id", userId)
    .eq("caption_id", captionId)
    .order("id", { ascending: false })
    .limit(1);

  if (remainingVoteError) {
    console.error(
      "[undoCaptionVote] load remaining study vote for caption_votes sync failed",
      remainingVoteError
    );
    return;
  }

  const remainingVoteValue = remainingVotes?.[0]?.vote_value ?? null;
  const remainingLegacyVoteValue =
    remainingVoteValue && STUDY_VOTE_VALUES.includes(remainingVoteValue)
      ? mapStudyVoteToCaptionVote(remainingVoteValue)
      : null;

  if (remainingLegacyVoteValue === null) {
    const { error: captionVotesDeleteError } = await supabase
      .from("caption_votes")
      .delete()
      .eq("profile_id", userId)
      .eq("caption_id", captionId)
      .eq("is_from_study", true);

    if (captionVotesDeleteError) {
      console.error(
        "[undoCaptionVote] delete caption_votes vote failed",
        captionVotesDeleteError
      );
    }

    return;
  }

  const legacyVotePayload: TablesInsert<"caption_votes"> = {
    caption_id: captionId,
    created_by_user_id: userId,
    is_from_study: true,
    modified_by_user_id: userId,
    profile_id: userId,
    vote_value: remainingLegacyVoteValue,
  };

  const { error: captionVotesUpsertError } = await supabase
    .from("caption_votes")
    .upsert(legacyVotePayload, {
      onConflict: "profile_id,caption_id",
    });

  if (captionVotesUpsertError) {
    console.error(
      "[undoCaptionVote] upsert caption_votes vote failed",
      captionVotesUpsertError
    );
  }
}

export async function removeCaptionVote({
  captionId,
  studyCaptionMappingId,
}: {
  captionId: string;
  studyCaptionMappingId?: number | null;
}): Promise<RemoveVoteResult> {
  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in" };
  }

  const trimmedId = captionId.trim();
  const normalizedStudyCaptionMappingId =
    typeof studyCaptionMappingId === "number" &&
    Number.isSafeInteger(studyCaptionMappingId) &&
    studyCaptionMappingId > 0
      ? studyCaptionMappingId
      : null;

  if (!trimmedId) {
    return { success: false, error: "Invalid vote" };
  }

  let deleteQuery = supabase
    .from("study_caption_vote_events")
    .delete({ count: "exact" })
    .eq("profile_id", user.id)
    .eq("caption_id", trimmedId);

  if (normalizedStudyCaptionMappingId === null) {
    deleteQuery = deleteQuery.is("study_caption_mapping_id", null);
  } else {
    deleteQuery = deleteQuery.eq(
      "study_caption_mapping_id",
      normalizedStudyCaptionMappingId
    );
  }

  const { count, error } = await deleteQuery;

  if (error) {
    console.error("[removeCaptionVote] delete study vote failed", error);
    return { success: false, error: "Could not remove your vote. Please try again." };
  }

  if (!count) {
    return { success: true };
  }

  await syncLegacyCaptionVoteAfterUndo(supabase, user.id, trimmedId);

  return { success: true };
}

export async function undoCaptionVote(): Promise<UndoVoteResult> {
  const supabase = await createClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not signed in" };
  }

  const { captions: activeCaptions, error: activeStudyError } =
    await fetchActiveStudyCaptions(supabase);

  if (activeStudyError) {
    console.error("[undoCaptionVote] load active studies failed", activeStudyError);
    return { success: false, error: "Could not undo your last vote. Please try again." };
  }

  const activeVoteScope = createStudyVoteScopeFromCaptions(
    activeCaptions.map((caption) => ({
      id: caption.id,
      studyCaptionMappingId: caption.study_caption_mapping_id,
    }))
  );

  const { vote: latestVote, error: latestVoteError } =
    await findMostRecentStudyVoteForScope(supabase, user.id, activeVoteScope);

  if (latestVoteError) {
    console.error("[undoCaptionVote] load latest study vote failed", latestVoteError);
    return { success: false, error: "Could not undo your last vote. Please try again." };
  }

  if (!latestVote) {
    return {
      success: false,
      error: "Could not find your last vote in an active study to undo.",
      noUndoableVote: true,
    };
  }

  const { count, error } = await supabase
    .from("study_caption_vote_events")
    .delete({ count: "exact" })
    .eq("profile_id", user.id)
    .eq("id", latestVote.id);

  if (error) {
    console.error("[undoCaptionVote] delete study vote failed", error);
    return { success: false, error: "Could not undo your last vote. Please try again." };
  }

  if (count !== 1) {
    return {
      success: false,
      error: "Could not find your last vote in an active study to undo.",
      noUndoableVote: true,
    };
  }

  await syncLegacyCaptionVoteAfterUndo(supabase, user.id, latestVote.captionId);

  return {
    success: true,
    undoneVote: {
      captionId: latestVote.captionId,
      clientEventId: latestVote.clientEventId,
      studyCaptionMappingId: latestVote.studyCaptionMappingId,
      value: latestVote.value,
    },
  };
}
