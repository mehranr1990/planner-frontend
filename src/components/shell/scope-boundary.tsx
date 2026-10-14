"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useShellScope } from "./use-shell-ui";

/*
 * Sets data-scope on the shell root from the URL (Personal outside every
 * context), so the frame, the content and the primary colour all take the
 * active context's accent. Switching context re-tints through the
 * [data-scope] custom properties in tokens.css. Overlays render in portals
 * outside this element, so each of them sets data-scope itself.
 */
export function ScopeBoundary({ children, className }: { children: ReactNode; className?: string }) {
  const scope = useShellScope();
  return (
    <div data-scope={scope} data-slot="scope-boundary" className={cn("contents", className)}>
      {children}
    </div>
  );
}
