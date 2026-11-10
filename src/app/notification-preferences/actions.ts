"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildNotificationPreferencesPath, encodeNotificationSkips, isNotificationPreference,
  notificationNextPath, NOTIFICATION_SKIPS_COOKIE, readNotificationSkips,
} from "@/lib/notification-preferences";
import { createClient } from "@/lib/supabase/server";

async function respondToPreference(formData: FormData, answer: boolean | null) {
  const supabase = await createClient({ allowCookieWrite: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nextValue = formData.get("next");
  const next = notificationNextPath(typeof nextValue === "string" ? nextValue : "/");
  const values = formData.getAll("preference");
  const preference = values[0];
  if (values.length !== 1 || !isNotificationPreference(preference)) {
    redirect(buildNotificationPreferencesPath(next, "Please try your choice again."));
  }

  if (answer === null) {
    const cookieStore = await cookies();
    const skipped = readNotificationSkips(cookieStore.get(NOTIFICATION_SKIPS_COOKIE)?.value, user.id);
    cookieStore.set(NOTIFICATION_SKIPS_COOKIE, encodeNotificationSkips(user.id, [...skipped, preference]), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    });
  } else {
    // A stale form cannot overwrite an answer saved in Settings or another tab.
    const { data, error } = await supabase.from("profiles")
      .update({ [preference]: answer, modified_by_user_id: user.id })
      .eq("id", user.id).is(preference, null).select("id");
    if (error || !data?.length) {
      // No returned row can mean a concurrent answer. Confirm before advancing.
      const current = await supabase.from("profiles")
        .select("notify_new_study_email, notify_new_study_sms, notify_new_study_phone_call")
        .eq("id", user.id).single();
      if (error || current.error || !current.data || current.data[preference] === null) {
        console.error("[Notifications] save preference failed", error ?? current.error);
        redirect(buildNotificationPreferencesPath(next, "We couldn’t save your choice. Please try again."));
      }
    }
    revalidatePath("/", "layout");
  }
  redirect(buildNotificationPreferencesPath(next));
}

export async function acceptNotification(formData: FormData) {
  await respondToPreference(formData, true);
}

export async function declineNotification(formData: FormData) {
  await respondToPreference(formData, false);
}

export async function skipNotification(formData: FormData) {
  await respondToPreference(formData, null);
}
