"use client";

import { useState } from "react";

export function StudyEasterEgg({ revealText }: { revealText: string }) {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <button
      id="study-easter-egg"
      type="button"
      className="fixed bottom-5 left-4 z-50 max-w-[min(18rem,calc(100vw-2rem))] rounded-full border border-[var(--card-border)] bg-[var(--card-surface)] px-2.5 py-1 text-[10px] font-medium leading-none text-[var(--soft)] shadow-[var(--panel-shadow)] transition hover:-translate-y-0.5 hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)] sm:bottom-6 sm:left-6"
      onClick={() => setIsRevealed((current) => !current)}
    >
      {isRevealed ? revealText : "which study am I?"}
    </button>
  );
}
