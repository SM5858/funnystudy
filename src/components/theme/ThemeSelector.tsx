"use client";

import type { ReactNode } from "react";
import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/solid";

import { useTheme } from "./ThemeProvider";

type ThemeOption = {
  id: "system" | "light" | "dark";
  label: string;
  icon: ReactNode;
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "system",
    label: "System",
    icon: <ComputerDesktopIcon className="h-4 w-4" aria-hidden />,
  },
  {
    id: "light",
    label: "Light",
    icon: <SunIcon className="h-4 w-4" aria-hidden />,
  },
  {
    id: "dark",
    label: "Dark",
    icon: <MoonIcon className="h-4 w-4" aria-hidden />,
  },
];

export function ThemeSelector({
  className = "",
  label = "Theme",
  description,
}: {
  className?: string;
  label?: string;
  description?: string;
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const statusLabel =
    theme === "system"
      ? `Auto (${resolvedTheme})`
      : theme === "light"
        ? "Light"
        : "Dark";

  return (
    <div
      className={`rounded-2xl border border-[var(--panel-border)] bg-[var(--surface-muted)]/70 p-4 text-[var(--foreground)] shadow-[var(--panel-shadow)] backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--soft)]">
            {label}
          </p>
          {description ? (
            <p className="text-xs text-[var(--soft)]">{description}</p>
          ) : null}
        </div>
        <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--soft)] ring-1 ring-[var(--panel-border)]">
          {statusLabel}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
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
              className={`flex h-11 flex-1 min-w-[88px] items-center justify-center gap-2 rounded-xl border text-sm font-semibold text-[var(--foreground)] transition hover:-translate-y-0.5 ${
                selected
                  ? "border-[var(--accent-strong)] bg-[var(--card-surface)] shadow-[0_14px_36px_-16px_rgba(245,158,11,0.5)]"
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
  );
}
