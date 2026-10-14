"use client";

import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the visible label is an icon or a glyph like "۱۲۳". */
  ariaLabel?: string;
  /** Language of the label text, e.g. "fa" for "۱۲۳". */
  lang?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Accessible name for the group. */
  label: string;
  /**
   * `accent` fills the active item with the scope colour (top-level settings);
   * `neutral` lifts it as a white thumb on a grey track (view switches).
   */
  variant?: "accent" | "neutral";
  /** `sm` is the compact in-card switch (e.g. the date picker's calendar toggle). */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Single-choice capsule control. Built on Radix ToggleGroup: items expose
 * role="radio" + aria-checked, arrow keys move between them and follow the
 * document direction through Radix's DirectionProvider.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  variant = "accent",
  size = "md",
  className,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix emits "" when the active item is pressed again; keep a selection.
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      aria-label={label}
      className={cn("inline-flex max-w-full flex-wrap items-center gap-1 rounded-pill bg-raised p-1", className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          lang={option.lang}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-pill font-semibold text-fg-secondary",
            "transition-[background-color,color,box-shadow]",
            size === "sm" ? "min-h-9 px-3 text-xs" : "min-h-touch min-w-touch px-4 text-body",
            "hover:text-fg",
            variant === "accent"
              ? "data-[state=on]:bg-primary data-[state=on]:text-on-accent"
              : "data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-island",
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
