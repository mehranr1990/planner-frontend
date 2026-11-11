"use client";

import type { PresenceStatus } from "@/data/team-domain";
import { cn } from "@/lib/cn";

/*
 * PresenceDot (TS-01): the manual status as a small dot. Never colour alone —
 * every use pairs it with the status text (visible or in the accessible name).
 * "No status" is a hollow ring.
 */

const DOT: Record<PresenceStatus, string> = {
  available: "bg-success-text",
  busy: "bg-warning",
  away: "bg-fg-muted",
  off: "bg-danger",
};

export function PresenceDot({
  status,
  size = "sm",
  className,
}: {
  status: PresenceStatus | null;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-presence={status ?? "none"}
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "sm" ? "size-2" : "size-2.5",
        status ? DOT[status] : "border border-line-strong bg-transparent",
        className,
      )}
    />
  );
}
