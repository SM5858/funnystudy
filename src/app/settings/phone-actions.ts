"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizePhone, phoneSettingsForUser, type PhoneSettingsState } from "@/lib/phone-settings";
import { createClient } from "@/lib/supabase/server";

export async function updatePhoneNumber(
  _previousState: PhoneSettingsState,
  formData: FormData
): Promise<PhoneSettingsState> {
  const supabase = await createClient({ allowCookieWrite: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const state = phoneSettingsForUser(user);
  const operation = formData.get("operation");

  if (operation === "send") {
    if (formData.getAll("verification_sms_consent").length !== 1 || formData.get("verification_sms_consent") !== "on") {
      return { ...state, status: "error", message: "Agree to receive a verification text before requesting a code." };
    }
    const value = formData.get("phone");
    const phone = typeof value === "string" && value.trim().startsWith("+") ? normalizePhone(value) : "";
    if (!phone || formData.getAll("phone").length !== 1) {
      return { ...state, status: "error", message: "Enter your phone number with its country code, such as +12125551234." };
    }
    if (phone === state.verifiedPhone && !state.pendingPhone) {
      return { ...state, status: "verified", message: "This phone number is already verified." };
    }
    const { error } = await supabase.auth.updateUser({ phone });
    if (error) {
      return { ...state, status: "error", message: error.status === 429
        ? "Please wait a minute before requesting another code."
        : "We couldn’t send a verification code. Please try again." };
    }
    revalidatePath("/settings");
    return { ...state, pendingPhone: phone, status: "sent", message: `A verification code is on its way to ${phone}.` };
  }

  if (operation === "verify") {
    const value = formData.get("code");
    const code = typeof value === "string" ? value.trim() : "";
    if (!state.pendingPhone || !/^\d{6}$/.test(code) || formData.getAll("code").length !== 1) {
      return { ...state, status: "error", message: "Request a code, then enter the six digits from your text message." };
    }
    // Use the pending number from the authenticated account, never a submitted
    // phone/identity. This cannot verify a different participant's account.
    const { data, error } = await supabase.auth.verifyOtp({
      phone: state.pendingPhone, token: code, type: "phone_change",
    });
    if (error || !data.user || data.user.id !== user.id || !data.user.phone_confirmed_at) {
      return { ...state, status: "error", message: "That code is invalid or has expired. Try again or request a new code." };
    }
    revalidatePath("/settings");
    return { ...phoneSettingsForUser(data.user), status: "verified", message: "Phone number verified." };
  }
  return { ...state, status: "error", message: "Please choose a valid phone verification action." };
}
