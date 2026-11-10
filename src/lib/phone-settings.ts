import type { User } from "@supabase/supabase-js";

export function normalizePhone(value: string | undefined) {
  if (!value) return "";
  const phone = value.trim().replace(/[\s().-]/g, "");
  return /^\+?[1-9]\d{1,14}$/.test(phone) ? `+${phone.replace(/^\+/, "")}` : "";
}

export type PhoneSettingsState = {
  status: "idle" | "sent" | "verified" | "error";
  message: string;
  verifiedPhone: string;
  pendingPhone: string;
};

export function phoneSettingsForUser(user: User): PhoneSettingsState {
  return {
    status: "idle",
    message: "",
    verifiedPhone: user.phone_confirmed_at ? normalizePhone(user.phone) : "",
    pendingPhone: normalizePhone(user.new_phone),
  };
}
