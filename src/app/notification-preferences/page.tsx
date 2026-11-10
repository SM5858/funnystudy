import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signOut } from "@/app/profile-actions";
import { AccountMenu } from "@/components/AccountMenu";
import { SubmitButton } from "@/components/SubmitButton";
import { PolicyLinks } from "@/components/PolicyLinks";
import { DEMOGRAPHIC_SKIPS_COOKIE, readDemographicSkips } from "@/lib/demographic-skips";
import { buildDemographicsPath, hasPendingDemographicQuestions } from "@/lib/demographics";
import {
  fetchNotificationPreferences, notificationNextPath, NOTIFICATION_SKIPS_COOKIE, readNotificationSkips,
} from "@/lib/notification-preferences";
import { createClient } from "@/lib/supabase/server";
import { acceptNotification, declineNotification, skipNotification } from "./actions";

export const metadata: Metadata = { title: "Notification preferences | Humor Study" };

const questions = {
  notify_new_study_email: "Would you like to receive an email when a new humor study is available?",
  notify_new_study_sms: "Would you like to receive a text message when a new humor study is available?",
  notify_new_study_phone_call: "Would you like to receive a phone call when a new humor study is available?",
};

export default async function NotificationPreferencesPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const next = notificationNextPath(params.next);
  const message = Array.isArray(params.message) ? params.message[0] : params.message;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const cookieStore = await cookies();
  const skipped = readNotificationSkips(cookieStore.get(NOTIFICATION_SKIPS_COOKIE)?.value, user.id);
  const { profile, pending } = await fetchNotificationPreferences(supabase, user.id, skipped);
  const question = pending[0];
  if (!question) {
    const skippedQuestionIds = readDemographicSkips(cookieStore.get(DEMOGRAPHIC_SKIPS_COOKIE)?.value, user.id);
    if (await hasPendingDemographicQuestions(supabase, user.id, skippedQuestionIds)) {
      redirect(buildDemographicsPath({ next, skippedQuestionIds }));
    }
    redirect(next);
  }
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
    || user.email || "your account";

  return (
    <div id="notification-preferences-root" className="relative flex h-[100svh] min-h-[100svh] flex-col overflow-hidden px-4 pt-6 pb-24 text-[var(--foreground)] sm:px-6">
      <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 items-center overflow-y-auto overscroll-contain py-4">
        <section className="glass-panel my-auto w-full shrink-0 rounded-3xl p-6 sm:p-8" aria-labelledby="notification-question">
          <h1 id="notification-question" className="text-2xl font-bold leading-snug">{questions[question.name]}</h1>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Reminders arrive daily at noon Eastern while an active public study is available for you to finish.
            {question.name === "notify_new_study_sms" ? " Text messages require a verified phone number in Settings. Message and data rates may apply." : ""}
            {question.name === "notify_new_study_phone_call" ? " Automated phone reminders require a verified phone number in Settings." : ""}
          </p>
          {question.name === "notify_new_study_sms" ? (
            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              <p>Choosing Yes consents to automated study-reminder texts, at most once daily. Texts are optional. Reply STOP to stop texts or HELP for help.</p>
            </div>
          ) : null}
          {question.name === "notify_new_study_phone_call" ? (
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Choosing Yes consents to automated calls using an artificial or prerecorded voice from Humor Study, operated by Sparkling Javascript, Inc., at your verified number, at most once daily. Your phone plan may charge for calls.</p>
          ) : null}
          <p className="mt-3 text-sm text-[var(--muted)]"><PolicyLinks /></p>
          {message ? <p role="alert" className="mt-4 text-sm text-[var(--error-text)]">{message}</p> : null}
          <form className="mt-6 grid grid-cols-2 gap-3">
            <input type="hidden" name="preference" value={question.name} />
            <input type="hidden" name="next" value={next} />
            <SubmitButton formAction={acceptNotification} pendingLabel="Saving…" className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[var(--accent-contrast)]">Yes</SubmitButton>
            <SubmitButton formAction={declineNotification} pendingLabel="Saving…" className="rounded-xl border border-[var(--panel-border)] px-5 py-3 font-semibold">No</SubmitButton>
            <SubmitButton formAction={skipNotification} pendingLabel="Skipping…" className="col-span-2 rounded-xl px-5 py-3 text-sm font-semibold text-[var(--muted)]">Skip</SubmitButton>
          </form>
        </section>
      </main>
      <AccountMenu displayName={displayName} email={user.email} signOutAction={signOut} />
    </div>
  );
}
