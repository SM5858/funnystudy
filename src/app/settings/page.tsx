import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { signOut } from "@/app/profile-actions";
import { AccountMenu } from "@/components/AccountMenu";
import { SettingsForm } from "@/components/SettingsForm";
import { PhoneSettingsForm } from "@/components/PhoneSettingsForm";
import type { AccountSettings } from "@/lib/account-settings";
import { phoneSettingsForUser } from "@/lib/phone-settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings | Humor Study" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, notify_new_study_email, notify_new_study_sms, notify_new_study_phone_call")
    .eq("id", user.id)
    .single<AccountSettings>();

  if (error) console.error("[Settings] load profile failed", error);
  const displayName = [settings?.first_name, settings?.last_name].filter(Boolean).join(" ").trim()
    || user.email || "your account";

  return (
    <div
      id="settings-root"
      className="relative flex h-[100svh] min-h-[100svh] flex-col overflow-hidden px-4 pt-6 pb-24 text-[var(--foreground)] sm:px-6 sm:pt-10"
    >
      <main
        id="settings-content"
        className="mx-auto min-h-0 w-full max-w-2xl flex-1 space-y-6 overflow-y-auto overscroll-contain p-1"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden />
          Back to studies
        </Link>
        <section className="glass-panel rounded-3xl p-6 sm:p-8">
          <header className="mb-7 space-y-2">
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-sm text-[var(--muted)]">Update your name and notification preferences.</p>
          </header>
          {error || !settings ? (
            <div role="alert" className="space-y-3">
              <p className="text-sm text-[var(--error-text)]">We couldn’t load your settings. Please try again.</p>
              <a href="/settings" className="inline-block rounded-xl border border-[var(--panel-border)] px-4 py-2 text-sm font-semibold">
                Try again
              </a>
            </div>
          ) : (
            <>
              <SettingsForm initialSettings={settings} />
              <PhoneSettingsForm initialState={phoneSettingsForUser(user)} />
            </>
          )}
        </section>
      </main>
      <AccountMenu displayName={displayName} email={user.email} signOutAction={signOut} />
    </div>
  );
}
