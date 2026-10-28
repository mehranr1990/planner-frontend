"use client";

import { useSyncExternalStore } from "react";

/*
 * A sheet that arrives with the URL (?sheet=mood on first load) must not open
 * before the page under it has hydrated: the modal marks everything outside
 * itself aria-hidden (Radix hideOthers), and a page Suspense boundary that
 * streams in later (Journal, Finance: an async params read or a dynamic hole)
 * would then hydrate over server HTML that carries those attributes, a
 * hydration mismatch. The host waits until every element in #main-content
 * has hydrated (React attaches its fiber to a node when it does); opened
 * later from the page, the sheet shows at once.
 */

const FIBER_PREFIX = "__reactFiber$";
/** Never wait longer than this for a page that will not finish (open anyway). */
const MAX_WAIT_MS = 3000;

let ready = false;

function isPageHydrated(): boolean {
  if (ready) return true;
  const main = document.getElementById("main-content");
  if (main) {
    for (const element of main.querySelectorAll("*")) {
      if (!Object.keys(element).some((key) => key.startsWith(FIBER_PREFIX))) return false;
    }
  }
  ready = true;
  return true;
}

function subscribe(onChange: () => void): () => void {
  if (ready) return () => {};
  const started = performance.now();
  let frame = 0;
  const check = () => {
    if (performance.now() - started > MAX_WAIT_MS) ready = true;
    if (isPageHydrated()) onChange();
    else frame = requestAnimationFrame(check);
  };
  frame = requestAnimationFrame(check);
  return () => cancelAnimationFrame(frame);
}

/** False on the server and until the page under #main-content has hydrated. */
export function usePageHydrated(): boolean {
  return useSyncExternalStore(subscribe, isPageHydrated, () => false);
}
