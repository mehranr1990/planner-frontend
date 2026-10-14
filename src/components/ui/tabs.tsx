"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/*
 * In-content tab switching on Radix Tabs: tablist / tab / tabpanel roles,
 * roving focus with arrow keys (mirrored under RTL via the app's Radix
 * DirectionProvider), Home/End, automatic activation.
 *
 * Approved tab patterns (see /styleguide/rules); no single style is used
 * everywhere:
 * - `capsule` — Segmented View Switcher with panels: grey track, white thumb
 *   (Utility Day/Week/Month, S3 detail tabs, S8 Task/Event/Reminder).
 * - `compact` — Compact Tabs: a white island of small capsules, the active one
 *   in the scope soft tint with deep text (S4 project views).
 * - `unstyled` — behaviour only, for sculpted rows that draw their own shapes
 *   (FolderTabsCard's merged folder tabs, RingCard's bottom tabs).
 * Filled Pill Tabs (deep fill, e.g. S7 Week/Month/Agenda) use Segmented's
 * `accent` variant when they switch a view rather than panels.
 */

export const Tabs = TabsPrimitive.Root;

const listVariants = cva("", {
  variants: {
    variant: {
      capsule: "inline-flex max-w-full flex-wrap items-center gap-1 rounded-pill bg-raised p-1",
      compact: "inline-flex max-w-full flex-wrap items-center gap-1 rounded-pill border border-hairline bg-surface p-1",
      unstyled: "",
    },
  },
  defaultVariants: { variant: "capsule" },
});

const triggerVariants = cva("", {
  variants: {
    variant: {
      capsule: [
        "inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-pill px-4",
        "text-body font-semibold text-fg-secondary transition-[background-color,color,box-shadow] hover:text-fg",
        "data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-island",
        "disabled:pointer-events-none disabled:opacity-45",
      ],
      compact: [
        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-pill px-3.5",
        "text-sm font-semibold text-fg-secondary transition-[background-color,color] hover:text-fg",
        "data-[state=active]:bg-scope-soft data-[state=active]:text-scope-deep",
        "disabled:pointer-events-none disabled:opacity-45",
      ],
      unstyled: "",
    },
  },
  defaultVariants: { variant: "capsule" },
});

export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof listVariants>;

export function TabsList({ variant, className, ...props }: TabsListProps) {
  return <TabsPrimitive.List className={cn(listVariants({ variant }), className)} {...props} />;
}

export type TabsTriggerProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof triggerVariants>;

export function TabsTrigger({ variant, className, ...props }: TabsTriggerProps) {
  return <TabsPrimitive.Trigger className={cn(triggerVariants({ variant }), className)} {...props} />;
}

export type TabsContentProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;

export function TabsContent({ className, ...props }: TabsContentProps) {
  return <TabsPrimitive.Content className={cn("min-w-0", className)} {...props} />;
}
