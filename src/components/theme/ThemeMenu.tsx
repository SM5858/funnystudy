"use client";

import { useEffect, useRef, useState } from "react";
import { UserCircleIcon, XMarkIcon } from "@heroicons/react/24/solid";

import { THEME_OPTIONS } from "./ThemeSelector";
import { useTheme } from "./ThemeProvider";

export function ThemeMenu() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonId = "theme-menu-button";
  const panelId = "theme-menu-panel";

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

  const statusLabel =
    theme === "system"
      ? `Auto (${resolvedTheme})`
      : theme === "light"
        ? "Light"
        : "Dark";

  return (
    <div
      id="theme-menu-root"
      ref={menuRef}
      className="fixed bottom-5 right-4 z-50 sm:bottom-6 sm:right-6"
    >
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_20px_45px_-20px_rgba(245,158,11,0.75)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-strong)]"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <XMarkIcon className="h-7 w-7" aria-hidden /> : <UserCircleIcon className="h-7 w-7" aria-hidden />}
        <span className="sr-only">Theme and profile</span>
      </button>

      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-labelledby={buttonId}
          className="interaction-menu absolute bottom-16 right-0 min-w-[240px] rounded-2xl border border-[var(--menu-border)] bg-[var(--menu-surface)] p-4 text-[var(--foreground)] shadow-2xl backdrop-blur-lg"
        >
          <div
            id="theme-menu-header"
            className="flex items-center justify-between gap-2"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--soft)]">
              Theme
            </p>
            <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--soft)] ring-1 ring-[var(--panel-border)]">
              {statusLabel}
            </span>
          </div>
          <div id="theme-menu-options" className="mt-4 flex items-center gap-3">
            {THEME_OPTIONS.map((option) => {
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
      ) : null}
    </div>
  );
}
