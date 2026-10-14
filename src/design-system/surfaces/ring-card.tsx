"use client";

import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToggleGroup } from "radix-ui";
import { useId, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProgressRing } from "@/design-system/data-display/progress-ring";
import type { Scope } from "@/design-system/tokens/colors";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { convertDigits, formatNumber, type DigitSystem } from "@/lib/locale/digits";

/*
 * Ring card (Cards → "Monthly focus"): title, ring with prev/next period
 * buttons, two stat columns, a period selector and HISTORY / DETAILS tabs
 * that hang below the card, the active one merged in with a concave fillet.
 * The ring shrinks below sm so the card fits a 320px-wide column.
 * Generic: the caller supplies values, labels and what the arrows do.
 */

export interface RingCardStat {
  id: string;
  icon?: LucideIcon;
  value: number | string;
  label: ReactNode;
}

export interface RingCardPeriod {
  id: string;
  value: number | string;
  label: ReactNode;
  /** Accessible name when the visible value + label are not enough. */
  ariaLabel?: string;
}

export type RingCardView = "history" | "details";

export interface RingCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Ring value and range. */
  value: number;
  max: number;
  /** Visible centre value; defaults to `value` in the preferred digits. */
  displayValue?: string;
  unit: ReactNode;
  /** Accessible name of the ring. */
  ringLabel: string;
  ringValueText?: string;
  tone?: Scope | "scope";
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  /** Defaults to Common "Previous" / "Next". */
  previousLabel?: string;
  nextLabel?: string;
  stats?: readonly RingCardStat[];
  periods?: readonly RingCardPeriod[];
  selectedPeriod?: string;
  onPeriodChange?: (id: string) => void;
  /** Accessible name of the period selector. */
  periodsLabel: string;
  /** Content of the DETAILS tab. */
  details?: ReactNode;
  historyLabel: string;
  detailsLabel: string;
  /** Accessible name of the bottom tab row. */
  tabsLabel: string;
  view?: RingCardView;
  defaultView?: RingCardView;
  onViewChange?: (view: RingCardView) => void;
  className?: string;
}

function localise(value: number | string, digits: DigitSystem) {
  return typeof value === "number" ? formatNumber(value, digits) : convertDigits(value, digits);
}

const tabBase =
  "relative flex h-14 flex-1 items-center justify-center type-label transition-colors disabled:pointer-events-none disabled:opacity-45";
const tabOff = "text-fg-secondary hover:text-fg";
const tabOn = "rounded-b-tile bg-surface font-extrabold text-fg after:absolute after:top-0 after:size-4.5 after:content-['']";
// The fillet joins the active bottom tab to the card on its inner side.
const historyFillet =
  "after:start-full after:bg-[radial-gradient(circle_at_100%_100%,transparent_17.5px,var(--surface)_18px)] rtl:after:bg-[radial-gradient(circle_at_0_100%,transparent_17.5px,var(--surface)_18px)]";
const detailsFillet =
  "after:end-full after:bg-[radial-gradient(circle_at_0_100%,transparent_17.5px,var(--surface)_18px)] rtl:after:bg-[radial-gradient(circle_at_100%_100%,transparent_17.5px,var(--surface)_18px)]";

export function RingCard({
  title,
  subtitle,
  value,
  max,
  displayValue,
  unit,
  ringLabel,
  ringValueText,
  tone = "scope",
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
  previousLabel,
  nextLabel,
  stats = [],
  periods = [],
  selectedPeriod,
  onPeriodChange,
  periodsLabel,
  details,
  historyLabel,
  detailsLabel,
  tabsLabel,
  view,
  defaultView = "history",
  onViewChange,
  className,
}: RingCardProps) {
  const t = useTranslations("Common");
  const { digits } = usePreferences();
  const titleId = useId();
  const [uncontrolledView, setUncontrolledView] = useState<RingCardView>(defaultView);
  const currentView = view ?? uncontrolledView;

  const changeView = (next: string) => {
    const nextView: RingCardView = next === "details" ? "details" : "history";
    if (view === undefined) setUncontrolledView(nextView);
    onViewChange?.(nextView);
  };

  return (
    <section aria-labelledby={titleId} className={cn("flex min-w-0 flex-col", className)}>
      {/*
        DOM order: header, tab row, panels, so keyboard and screen-reader users
        reach the tabs before the panel they control. Visually the tab row
        hangs below the card (order-last); the header and panel blocks share
        one surface.
      */}
      <Tabs value={currentView} onValueChange={changeView} className="flex flex-col">
        <div className="flex flex-col items-center gap-4.5 rounded-t-card bg-surface px-5.5 pt-6 pb-4.5 text-fg max-sm:px-4">
          <div className="flex flex-col items-center gap-0.5 text-center">
            <h2 id={titleId} className="type-title font-medium">
              {title}
            </h2>
            {subtitle ? <p className="type-caption font-semibold text-fg-muted">{subtitle}</p> : null}
          </div>

          {/* 48 + 8 + 144 + 8 + 48 = 256px below sm, so the card fits a 320px column. */}
          <div className="flex items-center gap-2 sm:gap-3.5">
            <IconButton
              icon={ChevronLeft}
              mirror
              label={previousLabel ?? t("previous")}
              onClick={onPrevious}
              disabled={previousDisabled || !onPrevious}
            />
            <ProgressRing
              value={value}
              max={max}
              label={ringLabel}
              valueText={ringValueText}
              tone={tone}
              // Cards board "Monthly focus": the ring is drawn in the scope base colour.
              shade="base"
              className="max-sm:size-36"
            >
              <span className="grid size-29.5 place-items-center content-center rounded-full bg-surface shadow-island sm:size-40">
                <span className="type-display font-light tabular max-sm:text-[2.5rem]">
                  {displayValue ?? formatNumber(value, digits)}
                </span>
                <span className="type-caption font-bold text-scope-deep">{unit}</span>
              </span>
            </ProgressRing>
            <IconButton
              icon={ChevronRight}
              mirror
              label={nextLabel ?? t("next")}
              onClick={onNext}
              disabled={nextDisabled || !onNext}
            />
          </div>

          {stats.length > 0 ? (
            <dl className="grid w-full grid-cols-2 border-t border-line pt-3.5">
              {stats.map((stat, index) => (
                <div
                  key={stat.id}
                  className={cn("flex flex-col-reverse items-center gap-1 py-1 text-center", index > 0 && "border-s border-line")}
                >
                  <dt className="type-caption font-semibold text-fg-muted">{stat.label}</dt>
                  <dd className="type-title font-normal tabular">{localise(stat.value, digits)}</dd>
                  {stat.icon ? (
                    <span className="grid size-8 place-items-center rounded-full bg-scope-soft text-scope-deep" aria-hidden="true">
                      <Icon icon={stat.icon} size={15} />
                    </span>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <TabsList variant="unstyled" aria-label={tabsLabel} className="order-last grid grid-cols-2">
          <TabsTrigger
            variant="unstyled"
            value="history"
            className={cn(tabBase, currentView === "history" ? cn(tabOn, historyFillet) : tabOff)}
          >
            {historyLabel}
          </TabsTrigger>
          <TabsTrigger
            variant="unstyled"
            value="details"
            className={cn(tabBase, currentView === "details" ? cn(tabOn, detailsFillet) : tabOff)}
          >
            {detailsLabel}
          </TabsTrigger>
        </TabsList>

        <div
          data-slot="ring-card-panels"
          className={cn(
            "bg-surface px-5.5 pb-5 text-fg max-sm:px-4",
            // The active tab merges into the card on its side.
            currentView === "history" ? "rounded-ee-card" : "rounded-es-card",
          )}
        >
          <TabsContent value="history" className="w-full">
            {periods.length > 0 ? (
              <ToggleGroup.Root
                type="single"
                value={selectedPeriod}
                onValueChange={(next) => {
                  if (next) onPeriodChange?.(next);
                }}
                aria-label={periodsLabel}
                className="flex w-full gap-1 rounded-row bg-subtle p-1"
              >
                {periods.map((period) => (
                  <ToggleGroup.Item
                    key={period.id}
                    value={period.id}
                    aria-label={period.ariaLabel}
                    className={cn(
                      "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[calc(var(--radius-row)-0.25rem)] text-fg-secondary",
                      "transition-[background-color,color,box-shadow] hover:text-fg",
                      "data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-island",
                    )}
                  >
                    <span className="text-base font-semibold tabular in-data-[state=on]:font-extrabold">
                      {localise(period.value, digits)}
                    </span>
                    <span className="text-xs font-bold text-fg-muted">{period.label}</span>
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            ) : null}
          </TabsContent>
          <TabsContent value="details" className="w-full">
            {details}
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
