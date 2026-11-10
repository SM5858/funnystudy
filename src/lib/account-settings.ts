import type { Tables } from "@/types/supabase";

export const NOTIFICATION_SETTINGS = [
  { name: "notify_new_study_email", label: "Email" },
  { name: "notify_new_study_sms", label: "Text message" },
  { name: "notify_new_study_phone_call", label: "Phone call" },
] as const;

export type AccountSettings = Pick<
  Tables<"profiles">,
  | "first_name"
  | "last_name"
  | "notify_new_study_email"
  | "notify_new_study_sms"
  | "notify_new_study_phone_call"
>;

export type SettingsFormState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const INITIAL_SETTINGS_STATE: SettingsFormState = {
  status: "idle",
  message: "",
};
