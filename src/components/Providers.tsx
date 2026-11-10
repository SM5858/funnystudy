"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "./theme/ThemeProvider";
import { InteractionFeedback } from "./InteractionFeedback";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <InteractionFeedback />
      {children}
    </ThemeProvider>
  );
}
