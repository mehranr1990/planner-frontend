"use client";

import { useEffect } from "react";

/**
 * Replaces a client navigation with a full page load of `href`. Used where a
 * route interception would otherwise swallow a real page (see the @drawer
 * task route). Renders nothing.
 */
export function HardNavigation({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return null;
}
