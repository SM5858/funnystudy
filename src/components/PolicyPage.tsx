import type { ReactNode } from "react";
import Link from "next/link";

import { PolicyLinks } from "./PolicyLinks";

export function PolicyPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-[100svh] flex-col overflow-hidden px-4 py-6 text-[var(--foreground)] sm:px-6 sm:py-10">
      <main className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain p-1">
        <Link href="/" className="mb-5 inline-block rounded-lg px-2 py-2 text-sm font-semibold text-[var(--muted)]">
          ← Back to Humor Study
        </Link>
        <article className="glass-panel rounded-3xl p-6 sm:p-10">
          <header className="mb-8 space-y-3">
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="text-sm text-[var(--muted)]">Effective October 4, 2026</p>
            <nav aria-label="Policies" className="text-sm"><PolicyLinks /></nav>
          </header>
          <div className="space-y-7 text-sm leading-7 text-[var(--muted)] [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[var(--foreground)] [&_p+p]:mt-3 [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
            {children}
          </div>
        </article>
      </main>
    </div>
  );
}
