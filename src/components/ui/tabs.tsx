"use client";

import { cva } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import { pillListClass, pillVariants } from "./pills";

/*
 * In-content tab switching on Radix Tabs: tablist / tab / tabpanel roles,
 * roving focus with arrow keys (mirrored under RTL via the app's Radix
 * DirectionProvider), Home/End, automatic activation.
 *
 * The four P00 tab families (P00CardsTabs "Tab families"):
 * - A · Segmented — view mode (Day/Week/Month, List/Board). Use <Segmented>,
 *   or `capsule` here when the switch owns tab panels.
 * - B · Compact pills (`pills`) — small local option or filter: outlined
 *   34px capsules; active = soft scope tint below lg, ink-outlined surface
 *   pill from lg up.
 * - C · Filled pills (`filled`) — a mode that needs emphasis (Focus / Short
 *   break / Long break): canvas pills, the active one filled with primary.
 * - D · Folder tabs — sections of ONE object: FolderTabsCard (top, or
 *   bottom-even as in RingCard). It renders `unstyled` triggers here.
 *
 * Selection rule: view mode → Segmented; small local option → compact pills;
 * mode needing emphasis → filled pills; sections of ONE object →
 * FolderTabsCard; global destinations → navigation, never tabs; wizards →
 * stepper. When pills filter content instead of switching panels, use
 * PillGroup (pills.tsx), which shares these exact classes.
 *
 * `compact` is a deprecated alias of `pills`.
 */

export const Tabs = TabsPrimitive.Root;

export type TabsVariant = "capsule" | "pills" | "filled" | "unstyled" | "compact";
type ResolvedVariant = Exclude<TabsVariant, "compact">;

const resolve = (variant: TabsVariant | null | undefined): ResolvedVariant =>
  variant === "compact" ? "pills" : (variant ?? "capsule");

const listVariants = cva("", {
  variants: {
    variant: {
      capsule: "inline-flex max-w-full flex-wrap items-center gap-1 rounded-pill bg-raised p-1",
      pills: pillListClass,
      filled: pillListClass,
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
      pills: pillVariants({ variant: "outline" }),
      filled: pillVariants({ variant: "filled" }),
      unstyled: "",
    },
  },
  defaultVariants: { variant: "capsule" },
});

export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  /** `compact` is deprecated; use `pills`. */
  variant?: TabsVariant | null;
};

export function TabsList({ variant, className, ...props }: TabsListProps) {
  return <TabsPrimitive.List className={cn(listVariants({ variant: resolve(variant) }), className)} {...props} />;
}

export type TabsTriggerProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  /** `compact` is deprecated; use `pills`. */
  variant?: TabsVariant | null;
};

export function TabsTrigger({ variant, className, ...props }: TabsTriggerProps) {
  return <TabsPrimitive.Trigger className={cn(triggerVariants({ variant: resolve(variant) }), className)} {...props} />;
}

export type TabsContentProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;

export function TabsContent({ className, ...props }: TabsContentProps) {
  return <TabsPrimitive.Content className={cn("min-w-0", className)} {...props} />;
}
