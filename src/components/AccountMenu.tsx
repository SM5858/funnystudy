"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Cog6ToothIcon,
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

import { useTheme } from "./theme/ThemeProvider";
import { SubmitButton } from "./SubmitButton";

export function AccountMenu({
  displayName,
  email,
  signOutAction,
}: {
  displayName: string;
  email?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonId = "account-menu-button";
  const panelId = "account-menu-panel";

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div
      id="account-menu-root"
      ref={menuRef}
      className="fixed bottom-5 right-4 z-50 sm:bottom-6 sm:right-6"
    >
      <button
        id={buttonId}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_20px_45px_-20px_rgba(245,158,11,0.75)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? (
          <XMarkIcon className="h-6 w-6" aria-hidden />
        ) : (
          <UserCircleIcon className="h-7 w-7" aria-hidden />
        )}
      </button>

      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-labelledby={buttonId}
          className="interaction-menu absolute bottom-16 right-0 max-h-[calc(100svh-7rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface)] p-4 text-[var(--foreground)] shadow-2xl backdrop-blur-lg"
        >
          <div id="account-menu-meta" className="space-y-1">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--soft)]">
              Signed in as
            </p>
            <p className="break-words text-sm font-semibold">{displayName}</p>
            {email ? (
              <p className="break-words text-xs text-[var(--soft)]">{email}</p>
            ) : null}
          </div>
          <div id="account-menu-theme" className="mt-5 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--soft)]">
              Theme
            </p>
            <div id="account-menu-theme-options" className="flex items-center gap-3">
              {[
                {
                  id: "system" as const,
                  label: "System default",
                  icon: <ComputerDesktopIcon className="h-4 w-4" aria-hidden />,
                },
                {
                  id: "light" as const,
                  label: "Light mode",
                  icon: <SunIcon className="h-4 w-4" aria-hidden />,
                },
                {
                  id: "dark" as const,
                  label: "Dark mode",
                  icon: <MoonIcon className="h-4 w-4" aria-hidden />,
                },
              ].map((option) => {
                const selected = theme === option.id;
                const accessibleLabel =
                  theme === "system" && option.id === "system"
                    ? `${option.label} (auto ${resolvedTheme})`
                    : option.label;

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={accessibleLabel}
                    aria-pressed={selected}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border text-[var(--foreground)] transition hover:-translate-y-0.5 ${
                      selected
                        ? "border-[var(--accent-strong)] bg-[var(--surface-muted)] shadow-[0_14px_36px_-16px_rgba(245,158,11,0.5)]"
                        : "border-[var(--panel-border)] bg-[var(--surface-muted)]"
                    }`}
                    onClick={() => setTheme(option.id)}
                  >
                    {option.icon}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Link
              href="/settings"
              prefetch={false}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--panel-border)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
            >
              <Cog6ToothIcon className="h-4 w-4" aria-hidden />
              Settings
            </Link>
            <form action={signOutAction}>
              <SubmitButton
                role="menuitem"
                pendingLabel="Signing out…"
                className="w-full rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] shadow-lg shadow-[0_12px_32px_-14px_rgba(245,158,11,0.45)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
              >
                Sign out
              </SubmitButton>
            </form>
            <Link
              href="/terms"
              prefetch={false}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-center text-sm text-[var(--muted)] underline underline-offset-4"
            >
              Policies &amp; terms
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
