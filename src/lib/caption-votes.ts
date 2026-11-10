import type { Enums } from "@/types/supabase";

export const HEART_VOTE_VALUE = "funny" as const satisfies Enums<"study_vote_value">;
export const VOTE_INPUT_METHODS = ["button", "swipe", "keyboard"] as const satisfies readonly Enums<"study_vote_input_method">[];
export const STUDY_VOTE_VALUES = [
  "didnt get it",
  "not funny at all",
  "not very funny",
  "meh",
  HEART_VOTE_VALUE,
  "very funny",
] as const satisfies readonly Enums<"study_vote_value">[];

export type VoteInputMethod = (typeof VOTE_INPUT_METHODS)[number];
export type StudyVoteValue = (typeof STUDY_VOTE_VALUES)[number];
export type LegacyCaptionVoteValue = -1 | 1;

export function mapStudyVoteToCaptionVote(
  value: StudyVoteValue
): LegacyCaptionVoteValue | null {
  switch (value) {
    case "funny":
    case "very funny":
      return 1;
    case "not funny at all":
    case "not very funny":
      return -1;
    case "meh":
    case "didnt get it":
      return null;
    default:
      return null;
  }
}
