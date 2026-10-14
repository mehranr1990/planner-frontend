"use client";

import { cva } from "class-variance-authority";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/locale/digits";

/*
 * Count or dot indicator (the "3" on the bell). Not a status pill: use
 * StatusChip for labelled states. The visible glyph is hidden from assistive
 * tech and the caller's label is read instead ("3 unread notifications").
 * Inside a control named by aria-label (e.g. IconButton) the badge text is
 * not part of the name: reference the badge with aria-describedby={id}, or
 * put the count in the control's label.
 */

export type BadgeTone = "danger" | "primary" | "neutral";

const badgeVariants = cva("inline-flex shrink-0 items-center justify-center rounded-pill font-bold leading-none tabular", {
  variants: {
    tone: {
      // danger-text, not --danger: keeps white/ink digits at AA in both themes.
      danger: "bg-danger-text text-on-accent",
      primary: "bg-primary text-on-accent",
      neutral: "bg-hairline text-fg-secondary",
    },
    kind: {
      count: "h-5 min-w-5 px-1.5 text-[11px]",
      dot: "size-2.5",
    },
    placement: {
      inline: "",
      // Pinned to the inline-end top corner of a relative parent (icon button).
      corner: "pointer-events-none absolute -top-0.5 -end-0.5 ring-2 ring-surface",
    },
  },
  compoundVariants: [{ kind: "dot", tone: "danger", className: "bg-danger" }],
  defaultVariants: { tone: "danger", kind: "count", placement: "inline" },
});

export interface BadgeProps {
  /** For aria-describedby on a parent control. */
  id?: string;
  /** Accessible text, e.g. "3 unread notifications". Required. */
  label: string;
  /** Omit (or pass `dot`) for a plain dot. */
  count?: number;
  /** Counts above this show as "99+". */
  max?: number;
  dot?: boolean;
  tone?: BadgeTone;
  placement?: "inline" | "corner";
  className?: string;
}

export function Badge({ id, label, count, max = 99, dot, tone, placement, className }: BadgeProps) {
  const { digits } = usePreferences();
  const isDot = dot || count === undefined;
  const text = isDot ? null : count > max ? `${formatNumber(max, digits)}+` : formatNumber(count, digits);
  return (
    <span id={id} className={cn(badgeVariants({ tone, kind: isDot ? "dot" : "count", placement }), className)}>
      {text != null ? (
        <span aria-hidden dir="ltr">
          {text}
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
    </span>
  );
}
