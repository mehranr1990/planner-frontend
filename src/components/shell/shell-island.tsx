import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/*
 * One white island of the top bar (CommandBar direction A): a 56px capsule
 * with the island shadow (none in dark, where the lighter surface carries the
 * depth). Controls inside are 48px, so 4px of padding rings them.
 */
export const shellIslandClassName =
  "flex h-14 shrink-0 items-center gap-1 rounded-pill bg-surface p-1 text-fg shadow-island";

export function ShellIsland({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(shellIslandClassName, className)} {...props} />;
}
