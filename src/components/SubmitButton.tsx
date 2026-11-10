"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function ButtonContent({
  children,
  pending,
  pendingLabel,
}: {
  children: ReactNode;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <span className="button-feedback-content">
      <span className="button-feedback-label" aria-hidden={pending || undefined}>
        {children}
      </span>
      <span className="button-feedback-pending" aria-hidden={!pending || undefined}>
        <span className="button-feedback-spinner" aria-hidden="true" />
        {pendingLabel}
      </span>
    </span>
  );
}

export function SubmitButton({
  children,
  disabled,
  pendingLabel,
  ...props
}: ComponentProps<"button"> & { pendingLabel: string }) {
  const { pending, action } = useFormStatus();
  // Sibling submit buttons share pending state, but only the chosen action
  // should show a progress label (for example Save versus Log out).
  const isSubmitting = pending && (!props.formAction || action === props.formAction);

  return (
    <>
      <button {...props} type="submit" disabled={disabled || pending} aria-busy={isSubmitting}>
        <ButtonContent pending={isSubmitting} pendingLabel={pendingLabel}>
          {children}
        </ButtonContent>
      </button>
      <span role="status" className="sr-only">{isSubmitting ? pendingLabel : ""}</span>
    </>
  );
}
