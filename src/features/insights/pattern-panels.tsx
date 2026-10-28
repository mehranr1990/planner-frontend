"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { PillGroup } from "@/components/ui/pills";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  insightContexts,
  type EstimatesPattern,
  type FocusPattern,
  type HabitsPattern,
  type InsightContext,
  type InsightDayFilter,
  type InsightPatternId,
  type InsightPatternOf,
  type InsightsPeriod,
  type SignalsPattern,
  type TimePattern,
} from "@/data/domain";
import { useInsightPattern } from "@/data/queries";
import { ContextRibbon } from "@/design-system/data-display/context-ribbon";
import { FocusClock } from "@/design-system/data-display/focus-clock";
import { LayeredArea } from "@/design-system/data-display/layered-area";
import { Progress } from "@/design-system/feedback/progress";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { usePlannerSettings, usePlannerSettingsActions } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import type { ClockTime } from "@/features/planner-settings/planner-settings";
import { cn } from "@/lib/cn";
import { contextShares, inWeekOrder, sharePointsChange } from "./domain/insights";
import { useInsightsFormat, type InsightsFormat } from "./use-insights-format";

/*
 * P15 tab panels. Each tab loads, fails and retries on its own (Error per
 * tab), shows progress to its own threshold instead of a chart (Partial
 * data), and every chart answers a written question and ends in an
 * observation sentence. Actions are opt-in: nothing changes until accepted,
 * and each can be undone or turned off.
 */

const CONTEXT_COLOR: Record<InsightContext, string> = {
  personal: "var(--personal-dot)",
  projects: "var(--project-dot)",
  teams: "var(--team-dot)",
  companies: "var(--company-dot)",
  other: "var(--viz-neutral)",
};

const MY_DAY_HREF = "/personal/my-day";
const SETTINGS_HREF = "/personal/settings";

/** Loading / error / collecting / ready for one pattern; ready content cross-fades in (180ms). */
export function PatternState<Id extends InsightPatternId>({
  id,
  today,
  period,
  children,
}: {
  id: Id;
  today: string;
  period: InsightsPeriod;
  children: (pattern: InsightPatternOf<Id>) => ReactNode;
}) {
  const t = useTranslations("Insights.states");
  const format = useInsightsFormat();
  const reduce = useReducedMotion();
  const query = useInsightPattern(id, today, period);

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-3" data-state="loading">
        <Skeleton className="h-5 w-2/3 rounded-pill" />
        <Skeleton className="h-56 rounded-tile" />
        <Skeleton className="h-10 rounded-tile" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <UtilityCard role="alert" className="flex flex-col items-start gap-2" data-state="error">
        <p className="type-title">{t("error.title")}</p>
        <p className="text-sm text-fg-secondary">{t("error.body")}</p>
        <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
          {t("error.retry")}
        </Button>
      </UtilityCard>
    );
  }
  const result = query.data;
  if (result.status === "collecting") {
    return (
      <UtilityCard className="flex flex-col gap-3" data-state="collecting">
        <p className="type-title">{t("collecting.title", { have: format.number(result.have), need: format.number(result.need) })}</p>
        <Progress
          size="sm"
          value={Math.min(100, (result.have / result.need) * 100)}
          label={t("collecting.title", { have: format.number(result.have), need: format.number(result.need) })}
        />
        <p className="text-sm text-fg-secondary">{t(`collecting.${id as InsightPatternId}`, { need: format.number(result.need) })}</p>
      </UtilityCard>
    );
  }
  return (
    <motion.div
      key={`${id}-${period}`}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      data-state="ready"
    >
      {children(result.pattern)}
    </motion.div>
  );
}

function Question({ question, caption }: { question: string; caption?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-bold text-fg">{question}</h3>
      {caption ? <p className="text-xs font-semibold text-fg-muted">{caption}</p> : null}
    </div>
  );
}

function Observation({ children }: { children: ReactNode }) {
  return <p className="type-title max-w-prose leading-snug text-fg">{children}</p>;
}

export function HourRange({ start, end, format, clock = false }: { start: number; end: number; format: InsightsFormat; clock?: boolean }) {
  return (
    <span dir="ltr" className="tabular whitespace-nowrap">
      {clock ? `${format.clock(start * 60)}–${format.clock(end * 60)}` : `${format.hour(start)}–${format.hour(end)}`}
    </span>
  );
}

const pad = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00` as ClockTime;

// ── Focus · Focus Clock ──────────────────────────────────────────────────

export function FocusPanel({ pattern }: { pattern: FocusPattern }) {
  const t = useTranslations("Insights.focus");
  const format = useInsightsFormat();
  const settings = usePlannerSettings();
  const { update } = usePlannerSettingsActions();
  const [filter, setFilter] = useState<InsightDayFilter>("all");
  const stats = pattern.byDays[filter];
  const [start, end] = stats.bestWindow;
  const range = () => <HourRange start={start} end={end} format={format} />;
  const protectedFocus = settings.insights.protectedFocus;
  const isProtected = protectedFocus?.start === pad(start) && protectedFocus.end === pad(end);

  const protect = () => {
    const previous = protectedFocus;
    update({ insights: { protectedFocus: { start: pad(start), end: pad(end) } } });
    toast({
      title: t("protectedToast"),
      tone: "success",
      action: { label: t("undo"), altText: t("undoAlt"), onClick: () => update({ insights: { protectedFocus: previous } }) },
    });
  };

  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-full max-w-[26rem]">
          <FocusClock
            minutesByHour={stats.minutesByHour}
            best={stats.bestWindow}
            label={t("clockLabel")}
            formatHour={format.hour}
            describeHour={(hour, minutes) => t("hour", { hour: format.clock(hour * 60), minutes: format.duration(minutes) })}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center text-center">
              <span className="text-[0.6875rem] font-semibold text-fg-muted">{t("center")}</span>
              <span className="text-lg font-bold tabular text-fg">{format.duration(stats.totalMinutes)}</span>
              <span className="text-[0.625rem] font-semibold text-fg-muted">{t("centerSub")}</span>
            </div>
          </div>
        </div>
        <span className="rounded-pill bg-deep-card px-3 py-1 text-xs font-bold text-on-deep-card">{t.rich("best", { range: () => <HourRange start={start} end={end} format={format} clock /> })}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <Question question={t("question")} />
        <Observation>
          {t.rich("answer", { range: () => <HourRange start={start} end={end} format={format} clock />, share: format.percent(stats.bestShare) })}
        </Observation>
        <PillGroup<InsightDayFilter>
          label={t("filterLabel")}
          value={filter}
          onValueChange={setFilter}
          options={(["all", "work", "weekend"] as const).map((value) => ({ value, label: t(value) }))}
        />
        <dl aria-label={t("stats")} className="flex flex-col gap-1.5 text-xs">
          {[
            [t("sessions"), t("sessionsValue", { done: format.number(stats.sessionsCompleted), started: format.number(stats.sessionsStarted) })],
            [t("average"), format.duration(stats.averageSessionMinutes)],
            [t("interrupted"), <HourRange key="i" start={stats.interruptedHour} end={stats.interruptedHour + 1} format={format} clock />],
          ].map(([term, value], index) => (
            <div key={index} className="flex items-center justify-between gap-3 rounded-row bg-subtle px-3 py-2.5">
              <dt className="font-bold text-fg">{term}</dt>
              <dd className="font-semibold text-fg-secondary">{value}</dd>
            </div>
          ))}
        </dl>
        {isProtected ? (
          <div className="flex flex-wrap items-center gap-2" data-action="protected">
            <p className="text-sm font-semibold text-scope-deep">{t.rich("protected", { range })}</p>
            <Button size="sm" variant="outline" onClick={() => update({ insights: { protectedFocus: null } })}>
              {t("turnOff")}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={MY_DAY_HREF}>{t("openMyDay")}</Link>
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="self-start" onClick={protect}>
            {t.rich("protect", { range })}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Time · Context Ribbon ────────────────────────────────────────────────

export function TimePanel({ pattern, today, compact }: { pattern: TimePattern; today: string; compact: boolean }) {
  const t = useTranslations("Insights");
  const format = useInsightsFormat();
  const { direction } = usePreferences();
  const settings = usePlannerSettings();
  const changeText = useChangeText();
  const [emphasis, setEmphasis] = useState<InsightContext | null>(null);
  const days = inWeekOrder(pattern.days, settings.week.weekStartsOn);
  const shares = contextShares(pattern);
  const change = sharePointsChange(shares.personal, pattern.previousShare.personal);

  return (
    <div className="flex flex-col gap-4">
      <Question question={t("time.question")} caption={t("time.caption")} />
      <ContextRibbon
        label={t("time.caption")}
        direction={direction}
        compact={compact}
        emphasis={emphasis}
        columns={days.map((day) => format.weekdayShort(day.weekday, today))}
        formatValue={format.duration}
        series={insightContexts.map((id) => ({ id, label: t(`time.${id}`), color: CONTEXT_COLOR[id], values: days.map((day) => day.minutes[id]) }))}
      />
      <div role="group" aria-label={t("time.legend")} className="flex flex-wrap gap-2">
        {insightContexts.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={emphasis === id}
            onClick={() => setEmphasis((current) => (current === id ? null : id))}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-pill px-3 text-xs font-semibold text-fg-secondary inset-ring inset-ring-outline transition-colors hover:text-fg focus-visible:focus-ring",
              emphasis === id && "bg-subtle text-fg inset-ring-2",
            )}
          >
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: CONTEXT_COLOR[id] }} />
            {t(`time.${id}`)} <span className="tabular font-bold">{format.percent(shares[id])}</span>
          </button>
        ))}
      </div>
      <MetricGroup aria-label={t("time.question")} columns={3}>
        <MetricTile label={t("time.personal")} value={format.percent(shares.personal)} hint={changeText(change)} />
        <MetricTile label={t("time.projects")} value={format.percent(shares.projects)} hint={<bdi>{pattern.topProject}</bdi>} />
        <MetricTile label={t("time.teamsCompanies")} value={format.percent(shares.teams + shares.companies)} />
      </MetricGroup>
      <Observation>{t("observations.time.text", { share: format.percent(shares.personal), change: changeText(change) })}</Observation>
    </div>
  );
}

/** Percentage-point change text: "+3 pts" / "−2 pts" / "no change". */
export function useChangeText(): (points: number) => string {
  const t = useTranslations("Insights.change");
  const format = useInsightsFormat();
  return (points) => (points === 0 ? t("same") : t(points > 0 ? "up" : "down", { points: format.number(Math.abs(points)) }));
}

// ── Signals · Layered Area ───────────────────────────────────────────────

type Signal = "mood" | "energy" | "focus";
const SIGNAL_COLOR: Record<Signal, string> = { mood: "var(--viz-mood)", energy: "var(--viz-energy)", focus: "var(--viz-focus)" };

export function SignalsPanel({ pattern, compact }: { pattern: SignalsPattern; compact: boolean }) {
  const t = useTranslations("Insights.signals");
  const format = useInsightsFormat();
  const { direction } = usePreferences();
  const [emphasis, setEmphasis] = useState<Signal>("mood");
  const n = pattern.days.length;
  const ticks = n > 1 ? [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1] : [0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Question question={t("question")} caption={t("caption")} />
        <PillGroup<Signal>
          label={t("metric")}
          value={emphasis}
          onValueChange={setEmphasis}
          options={(["mood", "energy", "focus"] as const).map((value) => ({
            value,
            label: (
              <>
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: SIGNAL_COLOR[value] }} />
                {t(value)}
              </>
            ),
          }))}
        />
      </div>
      <LayeredArea
        label={t("chartLabel")}
        direction={direction}
        compact={compact}
        emphasis={emphasis}
        pointLabels={pattern.days.map((day) => format.dayMonth(day.day))}
        axisTicks={[...new Set(ticks)]}
        formatValue={(value) => format.decimal(value)}
        series={(["mood", "energy", "focus"] as const).map((id) => ({
          id,
          label: t(id),
          color: SIGNAL_COLOR[id],
          values: pattern.days.map((day) => day[id]),
        }))}
      />
      <Observation>{t("observation", { with: format.decimal(pattern.moodWithFocus), without: format.decimal(pattern.moodWithoutFocus) })}</Observation>
    </div>
  );
}

// ── Estimates · simple bars ──────────────────────────────────────────────

export function EstimatesPanel({ pattern }: { pattern: EstimatesPattern }) {
  const t = useTranslations("Insights.estimates");
  const format = useInsightsFormat();
  const settings = usePlannerSettings();
  const { update } = usePlannerSettingsActions();
  const max = Math.max(2, ...pattern.categories.map((row) => row.ratio));
  const top = pattern.categories[0];
  const suggestion = pattern.suggestion;
  const buffers = settings.insights.estimateBuffers;
  const on = suggestion ? (buffers[suggestion.category] ?? 0) > 0 : false;

  const setBuffer = (percent: number) => {
    if (!suggestion) return;
    update({ insights: { estimateBuffers: { ...buffers, [suggestion.category]: percent } } });
  };

  return (
    <div className="flex flex-col gap-4">
      <Question question={t("question")} caption={t("caption")} />
      <ul className="flex flex-col gap-3">
        {pattern.categories.map((row) => (
          <li
            key={row.id}
            aria-label={t("row", { category: t(row.id), ratio: format.decimal(row.ratio, 2) })}
            className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm"
          >
            <span aria-hidden="true" className="truncate font-semibold text-fg">
              {t(row.id)}
            </span>
            <span aria-hidden="true" className="relative h-4 rounded-pill bg-subtle">
              <span
                data-slot="estimate"
                className="absolute inset-y-0 start-0 rounded-pill border-[1.5px] border-dashed border-fg-muted"
                style={{ width: `${(1 / max) * 100}%` }}
              />
              <span
                data-slot="actual"
                className={cn("absolute inset-y-1 start-0 rounded-pill", row.ratio > 1 ? "bg-scope-deep" : "bg-scope-dot")}
                style={{ width: `${(row.ratio / max) * 100}%` }}
              />
            </span>
            <span aria-hidden="true" className="text-end font-bold tabular text-fg">
              {t("ratio", { ratio: format.decimal(row.ratio, 2) })}
            </span>
          </li>
        ))}
      </ul>
      {top ? <Observation>{t("observation", { category: t(top.id), ratio: format.decimal(top.ratio) })}</Observation> : null}
      {suggestion ? (
        on ? (
          <div className="flex flex-wrap items-center gap-2" data-action="estimate-on">
            <p className="text-sm font-semibold text-scope-deep">
              {t("on", { category: t(suggestion.category), percent: format.percent(suggestion.bufferPercent / 100) })}
            </p>
            <Button size="sm" variant="outline" onClick={() => setBuffer(0)}>
              {t("turnOff")}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={SETTINGS_HREF}>{t("settings")}</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBuffer(suggestion.bufferPercent);
                toast({ title: t("onToast"), tone: "success" });
              }}
            >
              {t("suggest", { category: t(suggestion.category), percent: format.percent(suggestion.bufferPercent / 100) })}
            </Button>
            <p className="text-xs text-fg-muted">{t("suggestHint")}</p>
          </div>
        )
      ) : null}
    </div>
  );
}

// ── Habits ↔ mood · paired bars ──────────────────────────────────────────

export function HabitsPanel({ pattern }: { pattern: HabitsPattern }) {
  const t = useTranslations("Insights.habits");
  const format = useInsightsFormat();

  return (
    <div className="flex flex-col gap-4">
      <Question question={t("question")} caption={t("caption")} />
      <div aria-hidden="true" className="flex gap-4 text-xs font-semibold text-fg-secondary">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-scope-deep" />
          {t("done")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-fg-muted" />
          {t("notDone")}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {pattern.rows.map((row) => (
          <li
            key={row.habitId}
            aria-label={t("row", { habit: row.title, done: format.decimal(row.doneMood), notDone: format.decimal(row.notDoneMood) })}
            className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] items-center gap-3 text-sm"
          >
            <span aria-hidden="true" dir="auto" className="truncate font-semibold text-fg">
              {row.title}
            </span>
            <span aria-hidden="true" className="flex flex-col gap-1">
              {[
                [row.doneMood, "bg-scope-deep"],
                [row.notDoneMood, "bg-fg-muted/50"],
              ].map(([value, color], index) => (
                <span key={index} className="flex items-center gap-2">
                  <span className="h-2.5 flex-1 rounded-pill bg-subtle">
                    <span className={cn("block h-full rounded-pill", color)} style={{ width: `${(Number(value) / 10) * 100}%` }} />
                  </span>
                  <span className="w-8 text-end text-xs font-bold tabular text-fg">{format.decimal(Number(value))}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("note")}</p>
    </div>
  );
}
