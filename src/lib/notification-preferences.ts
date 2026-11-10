import { NOTIFICATION_SETTINGS, type AccountSettings } from "@/lib/account-settings";
import { createClient } from "@/lib/supabase/server";
import { normalizeRelativePath } from "@/lib/url";

export type NotificationPreference = (typeof NOTIFICATION_SETTINGS)[number]["name"];
export const NOTIFICATION_SKIPS_COOKIE = "notification_skips";

export function isNotificationPreference(value: unknown): value is NotificationPreference {
  return NOTIFICATION_SETTINGS.some(({ name }) => name === value);
}

export function notificationNextPath(value: string | string[] | null | undefined) {
  const path = normalizeRelativePath(value);
  if (path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) return "/";
  const url = new URL(path, "http://localhost");
  return ["/notification-preferences", "/demographics"].includes(url.pathname.replace(/\/+$/, ""))
    ? "/" : `${url.pathname}${url.search}${url.hash}`;
}

export function buildNotificationPreferencesPath(next: string, message?: string) {
  const params = new URLSearchParams({ next: notificationNextPath(next) });
  if (message) params.set("message", message);
  return `/notification-preferences?${params}`;
}

export function readNotificationSkips(value: string | undefined, profileId: string): NotificationPreference[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (parsed.profileId !== profileId || !Array.isArray(parsed.preferences)) return [];
    return [...new Set<NotificationPreference>(parsed.preferences.filter(isNotificationPreference))];
  } catch {
    return [];
  }
}

export function encodeNotificationSkips(profileId: string, preferences: NotificationPreference[]) {
  return encodeURIComponent(JSON.stringify({ profileId, preferences: [...new Set(preferences)] }));
}

export async function fetchNotificationPreferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  skipped: readonly NotificationPreference[] = []
) {
  const { data: profile, error } = await supabase.from("profiles")
    .select("first_name, last_name, notify_new_study_email, notify_new_study_sms, notify_new_study_phone_call")
    .eq("id", profileId).single<AccountSettings>();
  if (error) console.error("[Notifications] load preferences failed", error);
  return {
    profile,
    error,
    pending: error || !profile ? [] : NOTIFICATION_SETTINGS.filter(
      ({ name }) => profile[name] === null && !skipped.includes(name)
    ),
  };
}
