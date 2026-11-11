import { cn } from "@/lib/cn";

/*
 * PresenceDot (shared, context-neutral): a manual status as a small dot —
 * Available · Busy · Away · Off today, or a hollow ring for "No status".
 * Never colour alone: every use pairs it with the status text (visible or in
 * the accessible name).
 */

export type ManualStatus = "available" | "busy" | "away" | "off";

const DOT: Record<ManualStatus, string> = {
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
  status: ManualStatus | null;
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
