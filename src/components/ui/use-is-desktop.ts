"use client";

import { useSyncExternalStore } from "react";
import { SIGNATURE_DESKTOP_QUERY } from "@/design-system/surfaces/signature-card";

/*
 * True from the lg breakpoint (64rem): the same query the Signature card's
 * notch uses. For the places where lg changes what is rendered or enabled
 * (popover vs bottom sheet, drag side, timeline scale), not for layout, which
 * stays in CSS. `serverSnapshot` is what the server and hydration assume;
 * pick the side whose first paint is harmless (its data is still pending, or
 * it only renders once open).
 */

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(SIGNATURE_DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(SIGNATURE_DESKTOP_QUERY).matches;
}

export function useIsDesktop(serverSnapshot = true): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
