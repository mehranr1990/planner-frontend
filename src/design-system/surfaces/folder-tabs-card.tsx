"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { convertDigits, formatNumber } from "@/lib/locale/digits";

/*
 * Folder-tab card (design guide §4, Cards → Tabbed surfaces): the active tab
 * is part of the card surface, joined to it by two concave 18px fillets;
 * inactive tabs are outlined capsules. The fillets are pseudo-elements filled
 * with a radial gradient of the card's own surface token, so they work on any
 * background in both themes, and swap sides and centres under dir="rtl".
 */

export interface FolderTab {
  value: string;
  label: ReactNode;
  /** Shown after the label. Numbers use the preferred digits; strings get their digits converted. */
  count?: number | string;
  disabled?: boolean;
  content: ReactNode;
}

export interface FolderTabsCardProps {
  tabs: readonly FolderTab[];
  /** Accessible name of the tab row. */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  tone?: "surface" | "raised" | "elevated";
  className?: string;
  panelClassName?: string;
}

const toneClass = {
  surface: "[--folder-bg:var(--surface)]",
  raised: "[--folder-bg:var(--surface-raised)]",
  elevated: "[--folder-bg:var(--surface-elevated)]",
} as const;

const filletBase = "before:absolute before:bottom-0 before:size-4.5 before:content-[''] after:absolute after:bottom-0 after:size-4.5 after:content-['']";
// Start fillet: outside the tab's inline-start edge; end fillet: outside its inline-end edge.
const filletShape = [
  "before:end-full before:bg-[radial-gradient(circle_at_0_0,transparent_17.5px,var(--folder-bg)_18px)]",
  "rtl:before:bg-[radial-gradient(circle_at_100%_0,transparent_17.5px,var(--folder-bg)_18px)]",
  "after:start-full after:bg-[radial-gradient(circle_at_100%_0,transparent_17.5px,var(--folder-bg)_18px)]",
  "rtl:after:bg-[radial-gradient(circle_at_0_0,transparent_17.5px,var(--folder-bg)_18px)]",
].join(" ");

export function FolderTabsCard({
  tabs,
  label,
  value,
  defaultValue,
  onValueChange,
  tone = "surface",
  className,
  panelClassName,
}: FolderTabsCardProps) {
  const { digits } = usePreferences();
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? tabs[0]?.value ?? "");
  const current = value ?? uncontrolled;
  const firstActive = tabs[0]?.value === current;

  const change = (next: string) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  return (
    <Tabs value={current} onValueChange={change} className={cn("flex min-w-0 flex-col", toneClass[tone], className)}>
      <TabsList variant="unstyled" aria-label={label} className="relative z-1 -mb-px flex flex-wrap items-end gap-3">
        {tabs.map((tab, index) => {
          const active = tab.value === current;
          const count =
            tab.count === undefined
              ? null
              : typeof tab.count === "number"
                ? formatNumber(tab.count, digits)
                : convertDigits(tab.count, digits);
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              disabled={tab.disabled}
              variant="unstyled"
              className={cn(
                "relative inline-flex items-center gap-2 whitespace-nowrap transition-[background-color,color,border-color]",
                "disabled:pointer-events-none disabled:opacity-45",
                active
                  ? cn("h-14 rounded-t-tile bg-(--folder-bg) px-6 text-body font-bold text-fg", filletBase, filletShape, index === 0 && "before:hidden")
                  : "mb-2 h-12 rounded-pill border-[1.5px] border-outline px-4.5 text-sm font-semibold text-fg-secondary hover:bg-subtle hover:text-fg",
              )}
            >
              {tab.label}
              {count !== null ? <span className="type-caption font-bold text-fg-muted tabular">{count}</span> : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
      <div className={cn("min-w-0 rounded-card bg-(--folder-bg) p-card text-fg", firstActive && "rounded-ss-none", panelClassName)}>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
