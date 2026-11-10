"use client";

import { useEffect, useId, useRef, useState } from "react";

export function PrivateStudyDisclaimer() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const messageId = useId();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!dismissed && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Private study notice"
      aria-describedby={messageId}
      data-native-scroll-region="true"
      className="private-study-disclaimer m-auto w-[calc(100%-2rem)] max-w-xl overflow-visible border-0 bg-transparent p-0 text-[var(--foreground)]"
      onClose={() => setDismissed(true)}
    >
      <div className="private-study-disclaimer-card max-h-[calc(100svh-4rem)] overflow-y-auto overscroll-contain rounded-[2rem] border-2 border-[var(--accent)] bg-[var(--menu-surface)] p-6 shadow-[var(--panel-shadow)] sm:p-8">
        <p id={messageId} className="text-center text-xl font-normal leading-relaxed sm:text-2xl">
          <strong className="font-bold">Admin Only: </strong>
          This study is private and is only visible to Admins.
        </p>
        <button
          type="button"
          autoFocus
          className="mt-6 flex min-h-32 w-full items-center justify-center rounded-3xl bg-[var(--accent)] px-8 py-6 text-6xl font-black text-[var(--accent-contrast)] shadow-lg transition hover:brightness-110 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-strong)] sm:min-h-40 sm:text-7xl"
          onClick={() => dialogRef.current?.close()}
        >
          OK
        </button>
      </div>
    </dialog>
  );
}
