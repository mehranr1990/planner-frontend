import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Clock values and ranges are an LTR island with tabular numerals, also inside
 * Persian text: "۱۴:۰۰ – ۱۶:۰۰" keeps its start-to-end order.
 */
export function ClockText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cn("tabular-nums", className)}>
      {children}
    </bdi>
  );
}
