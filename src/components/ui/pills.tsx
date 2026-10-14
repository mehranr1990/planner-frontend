"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { ToggleGroup } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { convertDigits, formatNumber, type DigitSystem } from "@/lib/locale/digits";

/*
 * Pill tab families (P00CardsTabs B + C). One set of class definitions shared
 * by the tab triggers in tabs.tsx, PillGroup below and FolderTabsCard's mobile
 * pills, so the three never drift.
 *
 * - `outline` — Compact pill tabs (B): 34px capsules, 12px bold, 1px outline.
 *   Active below lg is the soft scope tint (PM01 "Tasks · Today 9"); from lg
 *   up it is a surface pill with a 1.5px ink outline (P00 desktop).
 * - `filled` — Filled pill tabs (C): 36px, 13px bold, canvas fill; the active
 *   one is filled with the primary colour (Focus / Short break / Long break).
 *
 * The active state is matched on data-state="active" (Radix Tabs) or
 * data-state="on" (Radix ToggleGroup) through one :is() selector. Visuals stay
 * 34/36px; an ::after inset widens the hit area to 48px tall.
 */

/** Compact pill geometry (B). Exported for FolderTabsCard's mobile pills. */
export const pillShape = [
  "relative inline-flex h-8.5 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3.5",
  "text-xs font-bold transition-[background-color,color,box-shadow]",
  "disabled:pointer-events-none disabled:opacity-45",
  "after:absolute after:-inset-x-0.75 after:-inset-y-1.75 after:content-['']",
].join(" ");

/** Inactive compact pill: transparent with a 1px outline. */
export const pillOutlineIdle = "inset-ring inset-ring-outline text-fg-secondary hover:text-fg";

/** Active compact pill below lg (soft scope tint, no outline). */
export const pillSoftActive = "bg-scope-soft text-scope-deep inset-ring-0";

export const pillVariants = cva("", {
  variants: {
    variant: {
      outline: [
        pillShape,
        pillOutlineIdle,
        // Mobile: soft scope tint.
        "[&:is([data-state=active],[data-state=on])]:bg-scope-soft",
        "[&:is([data-state=active],[data-state=on])]:text-scope-deep",
        "[&:is([data-state=active],[data-state=on])]:inset-ring-0",
        // The count follows the deep text on the tint (muted would miss AA in dark).
        "[&:is([data-state=active],[data-state=on])]:*:text-current",
        // Desktop: surface pill with a 1.5px ink outline.
        "lg:[&:is([data-state=active],[data-state=on])]:bg-surface",
        "lg:[&:is([data-state=active],[data-state=on])]:text-fg",
        "lg:[&:is([data-state=active],[data-state=on])]:inset-ring-[1.5px]",
        "lg:[&:is([data-state=active],[data-state=on])]:inset-ring-fg",
        "lg:[&:is([data-state=active],[data-state=on])]:*:text-fg-muted",
      ],
      filled: [
        "relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3.5",
        "text-[0.8125rem] font-bold transition-[background-color,color]",
        "disabled:pointer-events-none disabled:opacity-45",
        "after:absolute after:-inset-x-0.75 after:-inset-y-1.5 after:content-['']",
        // Canvas fill: #F1F1EE light, graphite #121412 dark (P00CardsTabs / Dark).
        "bg-canvas text-fg hover:bg-secondary-hover",
        "[&:is([data-state=active],[data-state=on])]:bg-primary",
        "[&:is([data-state=active],[data-state=on])]:text-on-accent",
        "[&:is([data-state=active],[data-state=on])]:hover:bg-primary-hover",
        // The muted count would fail contrast on the fill.
        "[&:is([data-state=active],[data-state=on])]:*:text-on-accent",
      ],
    },
  },
  defaultVariants: { variant: "outline" },
});

/** Row of pills: no island or track, 6px apart (P00 `.row.g6.wr`). */
export const pillListClass = "flex max-w-full flex-wrap items-center gap-1.5";

/** Muted count after a pill or folder-tab label. */
export const pillCountClass = "font-bold text-fg-muted tabular";

/** Numbers use the preferred digits; strings get their digits converted. */
export function formatPillCount(count: number | string, digits: DigitSystem) {
  return typeof count === "number" ? formatNumber(count, digits) : convertDigits(count, digits);
}

/** Count shown after a pill label, in the preferred digits. */
export function PillCount({ count, className, ...props }: Omit<ComponentProps<"span">, "children"> & { count: number | string }) {
  const { digits } = usePreferences();
  return (
    <span className={cn(pillCountClass, className)} {...props}>
      {formatPillCount(count, digits)}
    </span>
  );
}

export interface PillOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number | string;
  /** Accessible name when the visible label is not enough. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface PillGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly PillOption<T>[];
  /** Accessible name for the group. */
  label: string;
  variant?: NonNullable<VariantProps<typeof pillVariants>["variant"]>;
  className?: string;
}

/**
 * Single-select pills that filter or switch content in place (no tab panels),
 * e.g. Today / Overdue / This week, or Focus / Short break / Long break. On
 * Radix ToggleGroup like Segmented: role="radio" + aria-checked, arrow keys
 * follow the document direction. Use Tabs `pills` / `filled` when the pills
 * switch tab panels.
 */
export function PillGroup<T extends string>({
  value,
  onValueChange,
  options,
  label,
  variant = "outline",
  className,
}: PillGroupProps<T>) {
  const { digits } = usePreferences();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix emits "" when the active item is pressed again; keep a selection.
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      aria-label={label}
      className={cn(pillListClass, className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          disabled={option.disabled}
          className={pillVariants({ variant })}
        >
          {option.label}
          {option.count !== undefined ? (
            <>
              {/* The space keeps "Today 9" apart in the accessible name; flex drops it visually. */}
              {" "}
              <span className={pillCountClass}>{formatPillCount(option.count, digits)}</span>
            </>
          ) : null}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
