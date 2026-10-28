"use client";

import { useEffect, useState } from "react";

/*
 * A sheet that arrives with the URL (?sheet=mood on first load) must not open
 * before the page under it has hydrated: the modal marks everything outside
 * itself aria-hidden (Radix hideOthers), and a page Suspense boundary that
 * streams in later (Journal, Finance) would then hydrate over server HTML
 * that carries those attributes — a hydration mismatch. So on the first load
 * the host waits for the document to finish loading and the main thread to go
 * idle (React has done its hydration work by then); afterwards, sheets opened
 * from the page show at once.
 */

let pageReady = false;

/** False on the server and during the first load until the page has hydrated. */
export function usePageHydrated(): boolean {
  const [ready, setReady] = useState(pageReady);

  useEffect(() => {
    if (pageReady) return;
    let idleId: number | undefined;
    const markReady = () => {
      pageReady = true;
      setReady(true);
    };
    const whenIdle = () => {
      idleId =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(markReady)
          : window.setTimeout(markReady, 0);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    return () => {
      window.removeEventListener("load", whenIdle);
      if (idleId === undefined) return;
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, []);

  return ready;
}
