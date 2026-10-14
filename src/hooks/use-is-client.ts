"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during SSR and hydration, true afterwards. For values that only exist
 * in the browser (e.g. the resolved theme) without a hydration mismatch.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
