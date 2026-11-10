"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

import { ButtonContent } from "./SubmitButton";

export function GoogleSignInForm({ next, icon }: { next: string; icon: ReactNode }) {
  const [pending, setPending] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    // Native POST navigation can restore this page from the browser back cache.
    const reset = () => {
      submittedRef.current = false;
      setPending(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <form
      className="space-y-5"
      action="/auth/login"
      method="post"
      onSubmit={(event) => {
        if (submittedRef.current) {
          event.preventDefault();
          return;
        }
        submittedRef.current = true;
        setPending(true);
      }}
    >
      <input type="hidden" name="next" value={next} />
      <label className="flex items-start gap-3 text-sm leading-6 text-[var(--muted)]">
        <input
          type="checkbox"
          name="site_terms"
          required
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
        />
        <span>I am at least 18 years old, am located in the United States, and agree to the <Link href="/terms" target="_blank" rel="noopener" className="underline underline-offset-4">Terms of Use</Link>.</span>
      </label>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Read our <Link href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-4">Privacy Policy</Link> for how account and study information supports academic research at Columbia University. Research consent and optional notification choices are separate from these site terms.
      </p>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-contrast)] shadow-lg shadow-[0_15px_40px_-20px_rgba(245,158,11,0.55)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
      >
        <ButtonContent pending={pending} pendingLabel="Connecting to Google…">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--foreground)] ring-1 ring-[var(--panel-border)] shadow-inner shadow-black/40">
            {icon}
          </span>
          <span className="flex-1 text-center">Sign in with Google</span>
        </ButtonContent>
      </button>
      <span role="status" className="sr-only">{pending ? "Connecting to Google…" : ""}</span>
    </form>
  );
}
