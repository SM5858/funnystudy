"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getDeviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const getServerTimeZone = () => "UTC";

export function LocalDateTime({ value }: { value: string }) {
  // Keep SSR and initial hydration identical, then use the device's timezone.
  const timeZone = useSyncExternalStore(
    subscribe,
    getDeviceTimeZone,
    getServerTimeZone
  );
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value));

  return <time dateTime={value}>{formatted}</time>;
}
