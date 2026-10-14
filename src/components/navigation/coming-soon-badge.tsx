import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Small "Coming soon" pill for planned navigation entries. Callers pass the
 * text (Common.comingSoon) and usually reference it via aria-describedby.
 */
export function ComingSoonBadge({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill bg-raised px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-fg-secondary",
        className,
      )}
      {...props}
    />
  );
}
