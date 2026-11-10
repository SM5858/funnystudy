"use client";

import { useActionState, useEffect, useRef } from "react";

import { updatePhoneNumber } from "@/app/settings/phone-actions";
import type { PhoneSettingsState } from "@/lib/phone-settings";
import { SubmitButton } from "./SubmitButton";
import { PolicyLinks } from "./PolicyLinks";

export function PhoneSettingsForm({ initialState }: { initialState: PhoneSettingsState }) {
  const [state, action, pending] = useActionState(updatePhoneNumber, initialState);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const preserveValues = (event: Event) => event.preventDefault();
    section.addEventListener("reset", preserveValues, true);
    return () => section.removeEventListener("reset", preserveValues, true);
  }, []);
  const inputClass = "mt-2 w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-base text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--input-ring)]";
  const buttonClass = "rounded-xl border border-[var(--panel-border)] px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]";

  return (
    <section ref={sectionRef} className="mt-8 border-t border-[var(--panel-border)] pt-7" aria-labelledby="phone-heading">
      <h2 id="phone-heading" className="text-lg font-semibold">Your phone number</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        Verify your number to receive text and phone reminders. Reminders arrive daily at noon Eastern
        while a public study is available for you to finish. Message and data rates may apply.
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Verification sends a code by text. It does not subscribe you to study reminders. Reply STOP to stop texts or HELP for help.</p>
      <p className="mt-2 text-sm text-[var(--muted)]"><PolicyLinks /></p>
      {state.verifiedPhone ? <p className="mt-3 text-sm">Verified number: {state.verifiedPhone}</p> : null}
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="operation" value="send" />
        <fieldset disabled={pending} className="space-y-3 disabled:opacity-70">
          <label className="block text-sm font-semibold">
            Phone number, including country code
            <input type="tel" name="phone" autoComplete="tel" required maxLength={32}
              defaultValue={state.pendingPhone || state.verifiedPhone} placeholder="+12125551234"
              className={inputClass} />
          </label>
          <label className="flex items-start gap-3 text-sm leading-6">
            <input type="checkbox" name="verification_sms_consent" value="on" required
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
            <span>I agree to receive automated text messages from Humor Study to verify this phone number. Message and data rates may apply.</span>
          </label>
          <SubmitButton pendingLabel="Sending…" className={buttonClass}>Send verification code</SubmitButton>
        </fieldset>
      </form>
      {state.pendingPhone ? (
        <form action={action} className="mt-5 space-y-3">
          <input type="hidden" name="operation" value="verify" />
          <fieldset disabled={pending} className="space-y-3 disabled:opacity-70">
            <label className="block text-sm font-semibold">
              Verification code sent to {state.pendingPhone}
              <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code"
                required pattern="[0-9]{6}" minLength={6} maxLength={6} className={inputClass} />
            </label>
            <SubmitButton pendingLabel="Verifying…" className={buttonClass}>Verify phone number</SubmitButton>
          </fieldset>
        </form>
      ) : null}
      <div className="mt-3 min-h-6 text-sm" aria-live="polite">
        {state.message ? <p role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "text-[var(--error-text)]" : ""}>{state.message}</p> : null}
      </div>
    </section>
  );
}
