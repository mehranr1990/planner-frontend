"use client";

import { addMonths, startOfMonth } from "date-fns";
import { addMonths as addJalaliMonths, startOfMonth as startOfJalaliMonth } from "date-fns-jalali";
import { Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type { ProjectPhase, ProjectSummary } from "@/data/project-domain";
import { getPlannerToday } from "@/data/clock";
import { projectHref } from "@/features/navigation/contexts";
import { formatDate } from "@/lib/dates/format";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { daysBetween, dayToDate, useProjectFormat } from "../format";

const toDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/*
 * PJ-01 "Phases & timeline" (product card, PhasesTimeline): phase chips
 * (done ✓ · current with progress and "n d behind" · upcoming), then one lane
 * per phase on the project's date span with month ticks and the today line.
 * Volt only on the now-dot (the one volt area of the screen). Geometry is
 * positioned by date with logical insets, so RTL mirrors the time axis by
 * coordinates (never a CSS flip).
 */
export function PhasesTimeline({ project, phases }: { project: ProjectSummary; phases: readonly ProjectPhase[] }) {
  const t = useTranslations("Project.phases");
  const format = useProjectFormat();
  const { calendar, locale, digits } = usePreferences();
  const today = getPlannerToday();
  // Undeclared project dates fall back to the phases' own dates (never guessed).
  const sorted = phases.flatMap((phase) => [phase.start, phase.end]).filter((day): day is string => day !== null).sort();
  const startDate = project.startDate ?? sorted[0] ?? today;
  const endDate = project.endDate ?? sorted.at(-1) ?? today;
  const span = Math.max(1, daysBetween(startDate, endDate));
  const at = (day: string) => Math.min(100, Math.max(0, (daysBetween(startDate, day) / span) * 100));
  const current =
    phases.find((phase) => !phase.done && phase.start !== null && phase.end !== null && today >= phase.start && today <= phase.end) ??
    phases.find((phase) => !phase.done);
  const nowAt = at(today);
  const showNow = today >= startDate && today <= endDate;

  // Month ticks at the first day of each month of the user's calendar inside the span.
  const ticks: { key: string; at: number; label: string }[] = [];
  const startOf = calendar === "jalali" ? startOfJalaliMonth : startOfMonth;
  const next = calendar === "jalali" ? addJalaliMonths : addMonths;
  const end = dayToDate(endDate);
  for (let cursor = startOf(dayToDate(startDate)); cursor <= end; cursor = next(cursor, 1)) {
    const day = toDay(cursor);
    ticks.push({
      key: day,
      at: at(day < startDate ? startDate : day),
      label: formatDate(cursor, "monthYear", { calendar, locale, digits }).split(" ")[0]!,
    });
  }

  return (
    <ProductCard as="section" aria-labelledby="phases-title" className="gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="phases-title" className="flex flex-wrap items-baseline gap-2 type-title text-fg">
          {t("title")}
          {current?.end ? (
            <span className="text-xs font-semibold text-fg-secondary">
              {t("ends", { phase: current.name, date: format.day(current.end) })}
            </span>
          ) : null}
        </h2>
        <Link
          href={projectHref(project.id, "timeline")}
          className="text-xs font-bold text-fg underline underline-offset-2 hover:text-scope-deep"
        >
          {t("open")}
        </Link>
      </div>

      <ol className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {phases.map((phase) => {
          const isCurrent = phase.id === current?.id;
          return (
            <li
              key={phase.id}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex min-w-32 flex-1 flex-col gap-1 rounded-row px-3 py-2.5",
                phase.done && "bg-scope-soft",
                isCurrent && "bg-surface ring-2 ring-primary",
                !phase.done && !isCurrent && "bg-subtle",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-fg">
                {phase.done ? (
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-on-accent">
                    <Icon icon={Check} size={12} />
                    <span className="sr-only">{t("done")}</span>
                  </span>
                ) : null}
                <bdi className="truncate">{phase.name}</bdi>
              </span>
              <span className="truncate text-xs font-medium text-fg-secondary">
                {/* Live phases carry no dates, progress or delay (not served): those parts are left out. */}
                {phase.start === null || phase.end === null
                  ? null
                  : phase.start === phase.end
                    ? format.day(phase.end)
                    : format.range(phase.start, phase.end)}
                {isCurrent && phase.behindDays !== null && phase.behindDays > 0
                  ? ` · ${t("behind", { days: format.number(phase.behindDays) })}`
                  : ""}
              </span>
              {isCurrent && phase.progress !== null ? (
                <span aria-hidden="true" className="mt-1 h-1 w-full overflow-hidden rounded-pill bg-scope-soft">
                  <span className="block h-full rounded-pill bg-primary" style={{ width: `${phase.progress}%` }} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <figure
        aria-label={t("chart", { start: format.day(startDate), end: format.day(endDate) })}
        className="relative flex flex-col gap-2 max-sm:hidden"
      >
        {phases.map((phase) => {
          if (phase.start === null || phase.end === null) return null;
          const start = at(phase.start);
          const width = Math.max(2, at(phase.end) - start);
          const isCurrent = phase.id === current?.id;
          return (
            <div key={phase.id} className="grid grid-cols-[5rem_1fr] items-center gap-3">
              <span className="truncate text-xs font-semibold text-fg">
                <bdi>{phase.name}</bdi>
              </span>
              <span className="relative h-3.5 rounded-pill bg-subtle">
                <span
                  className={cn(
                    "absolute inset-y-0 rounded-pill",
                    isCurrent ? "bg-primary" : phase.done ? "bg-project-dot/50" : "bg-scope-soft",
                  )}
                  style={{ insetInlineStart: `${start}%`, width: `${width}%` }}
                />
              </span>
            </div>
          );
        })}
        <div className="grid grid-cols-[5rem_1fr] gap-3 pt-1">
          <span />
          <span className="relative h-4 text-[0.6875rem] font-medium text-fg-secondary">
            {ticks.map((tick) => (
              <span
                key={tick.key}
                className="absolute top-0 -translate-x-1/2 rtl:translate-x-1/2"
                style={{ insetInlineStart: `${tick.at}%` }}
              >
                {tick.label}
              </span>
            ))}
          </span>
        </div>
        {showNow ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-0 end-0 grid grid-cols-[5rem_1fr] gap-3"
          >
            <span />
            <span className="relative">
              <span
                data-slot="now-line"
                className="absolute -top-3 bottom-5 w-0.5 bg-primary"
                style={{ insetInlineStart: `${nowAt}%` }}
              >
                <span className="absolute -top-1.5 start-1/2 size-3 -translate-x-1/2 rounded-full bg-volt ring-2 ring-primary rtl:translate-x-1/2" />
              </span>
            </span>
          </div>
        ) : null}
        <figcaption className="sr-only">
          {t("now")}: {format.day(today)}
        </figcaption>
      </figure>
    </ProductCard>
  );
}
