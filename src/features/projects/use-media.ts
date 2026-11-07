"use client";

import { useSyncExternalStore } from "react";

/** Whether a media query matches (false on the server and in tests without matchMedia). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** lg and up (64rem), where popovers replace bottom sheets. */
export const DESKTOP_QUERY = "(min-width: 64rem)";
