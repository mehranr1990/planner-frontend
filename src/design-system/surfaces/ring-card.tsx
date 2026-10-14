"use client";

import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToggleGroup } from "radix-ui";
import { useId, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ProgressRing } from "@/design-system/data-display/progress-ring";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import type { Scope } from "@/design-system/tokens/colors";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { convertDigits, formatNumber, type DigitSystem } from "@/lib/locale/digits";

/*
 * Ring card (P00CardsTabs D′, Cards → "Monthly focus"): title, ring with
 * prev/next period buttons, two stat columns, a period selector and
 * HISTORY / DETAILS tabs hanging below the card — FolderTabsCard's
 * `bottom-even` variant, so the merged tab and its 20px fillet are the
 * shared folder geometry. Rings are reserved for Today progress and this
 * Habit RingCard (CLAUDE.md rule 6 "Progress"); everything else uses number + bar.
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

  const periodSelector =
    periods.length > 0 ? (
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
    ) : null;

  const header = (
    <>
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
    </>
  );

  return (
    <section aria-labelledby={titleId} className={cn("flex min-w-0 flex-col", className)}>
      {/*
        FolderTabsCard bottom-even owns the tab geometry. DOM order: header,
        tab row, panels, so keyboard and screen-reader users reach the tabs
        before the panel they control; visually the row hangs below the card.
      */}
      <FolderTabsCard
        variant="bottom-even"
        surface="surface"
        label={tabsLabel}
        value={currentView}
        onValueChange={changeView}
        header={header}
        headerClassName="flex flex-col items-center gap-4.5 pb-4.5 max-sm:px-4"
        panelClassName="max-sm:px-4"
        tabs={[
          { value: "history", label: historyLabel, content: periodSelector },
          { value: "details", label: detailsLabel, content: details },
        ]}
      />
    </section>
  );
}
