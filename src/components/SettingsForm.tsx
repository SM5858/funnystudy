"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { updateAccountSettings } from "@/app/settings/actions";
import {
  INITIAL_SETTINGS_STATE,
  NOTIFICATION_SETTINGS,
  type AccountSettings,
} from "@/lib/account-settings";
import { SubmitButton } from "./SubmitButton";
import { PolicyLinks } from "./PolicyLinks";

export function SettingsForm({ initialSettings }: { initialSettings: AccountSettings }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState({
    ...initialSettings,
    first_name: initialSettings.first_name ?? "",
    last_name: initialSettings.last_name ?? "",
  });
  const [edited, setEdited] = useState(false);
  const [state, action, pending] = useActionState(updateAccountSettings, INITIAL_SETTINGS_STATE);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    // Action resets run while React's synthetic handlers are paused. A native
    // listener keeps the edited fields intact on both success and validation errors.
    const preserveValues = (event: Event) => event.preventDefault();
    form.addEventListener("reset", preserveValues);
    return () => form.removeEventListener("reset", preserveValues);
  }, []);

  return (
    <form
      id="settings-form"
      ref={formRef}
      action={action}
      onSubmit={() => setEdited(false)}
      className="space-y-6"
    >
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-70">
        <legend className="text-lg font-semibold">Your name</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { name: "first_name" as const, label: "First Name", autoComplete: "given-name" },
            { name: "last_name" as const, label: "Last Name", autoComplete: "family-name" },
          ].map(({ name, label, autoComplete }) => (
            <label key={name} className="block text-sm font-semibold">
              {label}
              <input
                name={name}
                autoComplete={autoComplete}
                required
                minLength={2}
                value={values[name]}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setValues((current) => ({ ...current, [name]: value }));
                  setEdited(true);
                }}
                className="mt-2 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-base text-[var(--foreground)] shadow-inner outline-none transition focus:ring-2 focus:ring-[var(--input-ring)]"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={pending} className="space-y-3 disabled:opacity-70">
        <legend className="text-lg font-semibold">New study notifications</legend>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Email, text, and phone reminders arrive daily at noon Eastern while a public study is available for you to finish.
          Texts and phone calls require a verified phone number below. You can turn off any channel here at any time.
        </p>
        <div className="space-y-3">
          {NOTIFICATION_SETTINGS.map(({ name, label }) => (
            <label
              key={name}
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[var(--panel-border)] bg-[var(--surface-muted)] px-4 py-3 text-sm font-semibold"
            >
              <span className="flex-1">{label}</span>
              <select
                name={name}
                value={values[name] === null ? "unanswered" : values[name] ? "on" : "off"}
                onChange={(event) => {
                  const choice = event.currentTarget.value;
                  setValues((current) => ({ ...current, [name]: choice === "unanswered" ? null : choice === "on" }));
                  setEdited(true);
                }}
                className="min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
              >
                <option value="unanswered">Not answered</option>
                <option value="on">Yes</option>
                <option value="off">No</option>
              </select>
            </label>
          ))}
        </div>
        <p className="text-sm leading-6 text-[var(--muted)]">Choosing Yes for Text message consents to automated study-reminder texts, at most once daily. Texts are optional. Message and data rates may apply. Reply STOP to stop texts or HELP for help.</p>
        <p className="text-sm leading-6 text-[var(--muted)]">Choosing Yes for Phone call consents to automated calls using an artificial or prerecorded voice from Humor Study, operated by Sparkling Javascript, Inc., at your verified number, at most once daily. Your phone plan may charge for calls. Choosing Yes for Email requests daily study-reminder emails. All reminders are optional and are not required to participate.</p>
        <p className="text-sm text-[var(--muted)]"><PolicyLinks /></p>
        <p className="text-sm leading-6 text-[var(--muted)]">Unanswered preferences will be asked about at your next login.</p>
      </fieldset>

      <div className="space-y-3">
        <div className="min-h-6 text-sm">
          {!pending && !edited && state.status !== "idle" ? (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className={state.status === "error" ? "text-[var(--error-text)]" : "text-[var(--foreground)]"}
            >
              {state.message}
            </p>
          ) : null}
        </div>
        <SubmitButton
          pendingLabel="Saving…"
          className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-contrast)] shadow-lg transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] sm:w-auto"
        >
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}
