"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { NOTIFICATION_SETTINGS, type SettingsFormState } from "@/lib/account-settings";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/supabase";

export async function updateAccountSettings(
  _previousState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const supabase = await createClient({ allowCookieWrite: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const first = formData.get("first_name");
  const last = formData.get("last_name");
  if (
    typeof first !== "string" || typeof last !== "string" ||
    first.trim().length < 2 || last.trim().length < 2
  ) {
    return { status: "error", message: "Please enter a first and last name with at least two characters each." };
  }

  const update: TablesUpdate<"profiles"> = {
    first_name: first.trim(),
    last_name: last.trim(),
    modified_by_user_id: user.id,
  };
  for (const { name } of NOTIFICATION_SETTINGS) {
    const values = formData.getAll(name);
    const choice = values[0];
    if (values.length !== 1 || typeof choice !== "string" || !["on", "off", "unanswered"].includes(choice)) {
      return { status: "error", message: "Please select valid notification preferences and try again." };
    }
    update[name] = choice === "unanswered" ? null : choice === "on";
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id)
    .select("id")
    .single();

  if (error || !data) {
    console.error("[Settings] save profile failed", error);
    return { status: "error", message: "We couldn’t save your settings. Please try again." };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Settings saved." };
}
