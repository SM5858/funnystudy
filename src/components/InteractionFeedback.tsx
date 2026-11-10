"use client";

import { useEffect } from "react";

const CONTROL_SELECTOR = 'button, a[href], [role="button"], input[type="submit"], input[type="button"]';

export function InteractionFeedback() {
  useEffect(() => {
    const animations = new Map<HTMLElement, Animation>();

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(CONTROL_SELECTOR);
      if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;

      animations.get(control)?.cancel();
      // Animate scale independently so existing hover and heart transforms survive.
      // Click also covers keyboard activation and taps, including very quick presses.
      const animation = control.animate(
        [{ scale: "0.97" }, { scale: "1" }],
        { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
      );
      animations.set(control, animation);
      animation.onfinish = () => animations.delete(control);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);

  return null;
}
