"use client";

import { useState, type ReactNode } from "react";
import { formatPillCount, pillCountClass, pillListClass, pillOutlineIdle, pillShape, pillSoftActive } from "@/components/ui/pills";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";

/*
 * Folder-tab card (P00CardsTabs D / D′, CLAUDE.md "FolderTabsCard"): sections
 * of ONE object. The active tab is part of the panel: 56px tall, 24px outer
 * radius, the panel's own background, joined to it by two 20px concave
 * fillets (radial gradients of --folder-bg, so they work on any page in both
 * themes). The start fillet is dropped on the first tab, whose panel corner
 * becomes square. Inactive tabs are 44px capsules with a 1.5px outline and an
 * optional muted count — never coloured badges.
 *
 * - `top`: tabs above the panel. Below lg the row collapses to compact pills
 *   (soft scope tint when active) above a fully rounded panel; it is the same
 *   tablist, restyled by lg: variants, so SSR needs no viewport guess.
 * - `bottom-even`: the RingCard row. Equal-width uppercase tabs hang below the
 *   panel, fillets on their top side; the end fillet is also dropped on the
 *   last tab, whose panel corner becomes square. Same geometry at every width.
 *
 * Logical properties throughout: under dir="rtl" the row starts on the right,
 * fillets swap sides and the gradients mirror through rtl: variants.
 * Hiding empty tabs is the caller's job.
 */

export interface FolderTab {
  value: string;
  label: ReactNode;
  /** Shown after the label. Numbers use the preferred digits; strings get their digits converted. */
  count?: number | string;
  disabled?: boolean;
  content: ReactNode;
}

export type FolderTabsSurface = "surface" | "subtle";

export interface FolderTabsCardProps {
  tabs: readonly FolderTab[];
  /** Accessible name of the tab row. */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** `top` (default) or `bottom-even` (RingCard). */
  variant?: "top" | "bottom-even";
  /** Panel and active-tab background: white card surface, or the subtle step (P00 `.ft.soft`). */
  surface?: FolderTabsSurface;
  /** @deprecated Use `surface`. Still honoured when `surface` is not set. */
  tone?: "surface" | "raised" | "elevated";
  /**
   * Content shared by every tab, at the top of the panel (e.g. RingCard's
   * title and ring). With `bottom-even` it precedes the tab row in DOM order,
   * so keyboard users meet it before the tabs and the panel after them.
   */
  header?: ReactNode;
  className?: string;
  headerClassName?: string;
  panelClassName?: string;
}

const backgroundClass = {
  surface: "[--folder-bg:var(--surface)]",
  subtle: "[--folder-bg:var(--surface-subtle)]",
  raised: "[--folder-bg:var(--surface-raised)]",
  elevated: "[--folder-bg:var(--surface-elevated)]",
} as const;

// Fillets are aria-hidden spans, so the trigger's ::after stays free for the pill hit area.
const filletBase = "pointer-events-none absolute size-(--folder-fillet)";
const fillets = {
  top: {
    // Below lg the row is pills, so fillets only exist from lg up.
    start: cn(
      filletBase,
      "bottom-0 end-full hidden lg:block",
      "bg-[radial-gradient(circle_at_0_0,transparent_calc(var(--folder-fillet)_-_0.5px),var(--folder-bg)_var(--folder-fillet))]",
      "rtl:bg-[radial-gradient(circle_at_100%_0,transparent_calc(var(--folder-fillet)_-_0.5px),var(--folder-bg)_var(--folder-fillet))]",
    ),
    end: cn(
      filletBase,
      "bottom-0 start-full hidden lg:block",
      "bg-[radial-gradient(circle_at_100%_0,transparent_calc(var(--folder-fillet)_-_0.5px),var(--folder-bg)_var(--folder-fillet))]",
      "rtl:bg-[radial-gradient(circle_at_0_0,transparent_calc(var(--folder-fillet)_-_0.5px),var(--folder-bg)_var(--folder-fillet))]",
    ),
  },
  "bottom-even": {
    start: cn(
      filletBase,
      "top-0 end-full",
      "bg-[radial-gradient(circle_at_0_100%,transparent_calc(var(--folder-fillet)_-_0.5px),var(--folder-bg)_var(--folder-fillet))]",
      "rtl:bg-[radial-gradient(circle_at_100%_100%,transparent_calc(var(--folder-fillet)_-_0.5px),var(--folder-bg)_var(--folder-fillet))]",
    ),
    end: cn(
      filletBase,
      "top-0 start-full",
      "bg-[radial-gradient(circle_at_100%_100%,transparent_calc(var(--folder-fillet)_-_0.5px),var(--folder-bg)_var(--folder-fillet))]",
      "rtl:bg-[radial-gradient(circle_at_0_100%,transparent_calc(var(--folder-fillet)_-_0.5px),var(--folder-bg)_var(--folder-fillet))]",
    ),
  },
} as const;

const topTrigger = {
  // Mobile-first: the compact pill (pills.tsx), restyled into a folder tab from lg up.
  base: cn(pillShape, "lg:h-11 lg:gap-2 lg:px-4.5 lg:text-sm"),
  idle: cn(pillOutlineIdle, "lg:mb-2 lg:font-semibold lg:inset-ring-[1.5px] lg:after:-inset-y-0.5"),
  active: cn(
    pillSoftActive,
    "lg:h-14 lg:rounded-b-none lg:rounded-t-folder-tab lg:bg-(--folder-bg) lg:px-6.5 lg:text-fg lg:after:inset-y-0",
  ),
};

const evenTrigger = {
  // 12px / 700 / uppercase / .12em (Persian drops case and tracking globally).
  base: "relative flex h-14 min-w-0 items-center justify-center gap-2 px-2 text-xs font-bold tracking-[0.12em] uppercase transition-colors disabled:pointer-events-none disabled:opacity-45",
  idle: "text-fg-secondary hover:text-fg",
  active: "rounded-b-folder-tab bg-(--folder-bg) text-fg",
};

export function FolderTabsCard({
  tabs,
  label,
  value,
  defaultValue,
  onValueChange,
  variant = "top",
  surface,
  tone,
  header,
  className,
  headerClassName,
  panelClassName,
}: FolderTabsCardProps) {
  const { digits } = usePreferences();
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? tabs[0]?.value ?? "");
  const current = value ?? uncontrolled;
  const activeIndex = tabs.findIndex((tab) => tab.value === current);
  const firstActive = activeIndex === 0;
  const lastActive = activeIndex === tabs.length - 1;
  const bottom = variant === "bottom-even";

  const change = (next: string) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const tabList = (
    <TabsList
      variant="unstyled"
      aria-label={label}
      className={
        bottom
          ? "relative z-1 order-last grid auto-cols-fr grid-flow-col"
          : cn(pillListClass, "relative z-1 mb-3 lg:-mb-px lg:items-end lg:gap-2.5")
      }
    >
      {tabs.map((tab, index) => {
        const active = index === activeIndex;
        const trigger = bottom ? evenTrigger : topTrigger;
        const fillet = fillets[variant];
        return (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            variant="unstyled"
            className={cn(trigger.base, active ? trigger.active : trigger.idle)}
          >
            {active && index > 0 ? <span aria-hidden="true" data-fillet="start" className={fillet.start} /> : null}
            {tab.label}
            {tab.count !== undefined ? (
              <>
                {/* Keeps "Tasks 18" apart in the accessible name; flex drops it visually. */}
                {" "}
                <span className={cn(pillCountClass, "lg:text-xs", active && !bottom && "max-lg:text-current")}>{formatPillCount(tab.count, digits)}</span>
              </>
            ) : null}
            {active && !(bottom && index === tabs.length - 1) ? (
              <span aria-hidden="true" data-fillet="end" className={fillet.end} />
            ) : null}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );

  const panelBox = "min-w-0 bg-(--folder-bg) px-card text-fg";
  const contents = tabs.map((tab) => (
    <TabsContent key={tab.value} value={tab.value}>
      {tab.content}
    </TabsContent>
  ));

  return (
    <Tabs
      value={current}
      onValueChange={change}
      data-variant={variant}
      className={cn("flex min-w-0 flex-col", backgroundClass[surface ?? tone ?? "surface"], className)}
    >
      {bottom ? (
        <>
          {header ? (
            <div data-slot="folder-tabs-header" className={cn(panelBox, "rounded-t-card pt-card", headerClassName)}>
              {header}
            </div>
          ) : null}
          {tabList}
          <div
            data-slot="folder-tabs-panel"
            className={cn(
              panelBox,
              "pb-card",
              // The active bottom tab merges in on its side: that corner is square.
              // Only the rounded corners are emitted, so no physical shorthand
              // (rounded-b-*) can override the logical square corner.
              header
                ? cn(!firstActive && "rounded-es-card", !lastActive && "rounded-ee-card")
                : cn("rounded-card pt-card", firstActive && "rounded-es-none", lastActive && "rounded-ee-none"),
              panelClassName,
            )}
          >
            {contents}
          </div>
        </>
      ) : (
        <>
          {tabList}
          <div
            data-slot="folder-tabs-panel"
            className={cn(panelBox, "rounded-card py-card", firstActive && "lg:rounded-ss-none", panelClassName)}
          >
            {header ? (
              <div data-slot="folder-tabs-header" className={headerClassName}>
                {header}
              </div>
            ) : null}
            {contents}
          </div>
        </>
      )}
    </Tabs>
  );
}
