"use client";

import { Clock, Globe, Info, Lightbulb, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import { insightPatternIds, type InsightPatternId, type InsightsPeriod, type InsightsSummary } from "@/data/domain";
import { useInsightPattern, useInsightsSummary } from "@/data/queries";
import { Progress } from "@/design-system/feedback/progress";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { contextShares, insightsHref, parseInsightsPeriod, parseInsightsTab, sharePointsChange } from "./domain/insights";
import {
  EstimatesPanel,
  FocusPanel,
  HabitsPanel,
  HourRange,
  PatternState,
  SignalsPanel,
  TimePanel,
  useChangeText,
} from "./pattern-panels";
import { useInsightsFormat } from "./use-insights-format";

/*
 * P15 · Insights (/personal/insights?tab=focus|time|signals|estimates|habits
 * &period=4w|3m|year). Hierarchy: headline insight (the page's one signature
 * card) → observation family (three product cards, no notches) → one
 * FolderTabsCard with one visualization per tab. Patterns only from enough
 * data; actions are opt-in. Plain statistics, no AI.
 * Hiding Habits (Settings) removes its tab and observation card.
 */

const HINTED: Partial<Record<InsightPatternId, "focusHint" | "timeHint" | "signalsHint">> = {
  focus: "focusHint",
  time: "timeHint",
  signals: "signalsHint",
};

export function InsightsScreen() {
  const t = useTranslations("Insights");
  const router = useRouter();
  const params = useSearchParams();
  const desktop = useIsDesktop();
  const { day: today } = usePlannerNow();
  const settings = usePlannerSettings();
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabState, setTab] = useState(() => parseInsightsTab(params.get("tab")));
  const [period, setPeriod] = useState(() => parseInsightsPeriod(params.get("period")));
  const summary = useInsightsSummary(today, period);

  const tabs = insightPatternIds.filter((id) => id !== "habits" || settings.modules.habits);
  const tab = tabs.includes(tabState) ? tabState : "focus";

  const go = (next: { tab?: InsightPatternId; period?: InsightsPeriod }) => {
    const nextTab = next.tab ?? tab;
    const nextPeriod = next.period ?? period;
    setTab(nextTab);
    setPeriod(nextPeriod);
    router.replace(insightsHref(nextTab, nextPeriod), { scroll: false });
  };
  const openTab = (id: InsightPatternId) => {
    go({ tab: id });
    const panel = tabsRef.current;
    panel?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    // Move focus to the opened tab so keyboard users land on it.
    requestAnimationFrame(() => panel?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
  };

  const data = summary.data;

  return (
    <div className="flex flex-col gap-5" data-screen="insights" data-period={period}>
      <PageHeader
        title={t("title")}
        subtitle={t("kicker", { period })}
        subtitlePlacement="above"
        actions={
          <Segmented<InsightsPeriod>
            label={t("period.label")}
            value={period}
            onValueChange={(next) => go({ period: next })}
            options={(["4w", "3m", "year"] as const).map((value) => ({ value, label: t(`period.${value}`) }))}
          />
        }
      />
      {summary.isPending ? (
        <div aria-busy="true" aria-label={t("states.loading")} className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]">
            <Skeleton className="h-52 rounded-card" />
            <Skeleton className="h-52 rounded-card" />
            <Skeleton className="h-52 rounded-card" />
            <Skeleton className="h-52 rounded-card" />
          </div>
          <Skeleton className="h-96 rounded-card" />
        </div>
      ) : summary.isError || !data ? (
        <UtilityCard role="alert" className="flex flex-col items-start gap-2">
          <p className="type-title">{t("states.error.title")}</p>
          <p className="text-sm text-fg-secondary">{t("states.error.body")}</p>
          <Button size="sm" variant="secondary" onClick={() => void summary.refetch()}>
            {t("states.error.retry")}
          </Button>
        </UtilityCard>
      ) : data.activeDays === 0 ? (
        <NoData />
      ) : (
        <>
          {data.activeDays < data.requiredDays ? <Partial summary={data} /> : null}
          <div
            className={
              data.headline
                ? "grid gap-4 md:grid-cols-3 lg:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]"
                : "grid gap-4 md:grid-cols-3"
            }
          >
            {data.headline ? <Headline summary={data} onWhy={() => openTab("focus")} /> : null}
            <ObservationCard id="time" today={today} period={period} icon={<Globe aria-hidden size={14} />} onOpen={openTab} />
            <ObservationCard id="estimates" today={today} period={period} icon={<Clock aria-hidden size={14} />} onOpen={openTab} />
            {settings.modules.habits ? (
              <ObservationCard id="habits" today={today} period={period} icon={<Repeat aria-hidden size={14} />} onOpen={openTab} />
              ) : null}
          </div>
          <div ref={tabsRef} className="scroll-mt-24">
            <FolderTabsCard
              label={t("tabs.label")}
              value={tab}
              onValueChange={(next) => go({ tab: next as InsightPatternId })}
              tabs={tabs.map((id) => ({
                value: id,
                label: HINTED[id] ? (
                  <>
                    {t(`tabs.${id}`)} <span className="text-[0.6875rem] font-semibold text-fg-muted">{t(`tabs.${HINTED[id]}`)}</span>
                  </>
                ) : (
                  t(`tabs.${id}`)
                ),
                content: <TabPanel id={id} today={today} period={period} compact={!desktop} />,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TabPanel({ id, today, period, compact }: { id: InsightPatternId; today: string; period: InsightsPeriod; compact: boolean }) {
  switch (id) {
    case "focus":
      return <PatternState id="focus" today={today} period={period}>{(pattern) => <FocusPanel pattern={pattern} />}</PatternState>;
    case "time":
      return (
        <PatternState id="time" today={today} period={period}>
          {(pattern) => <TimePanel pattern={pattern} today={today} compact={compact} />}
        </PatternState>
      );
    case "signals":
      return <PatternState id="signals" today={today} period={period}>{(pattern) => <SignalsPanel pattern={pattern} compact={compact} />}</PatternState>;
    case "estimates":
      return <PatternState id="estimates" today={today} period={period}>{(pattern) => <EstimatesPanel pattern={pattern} />}</PatternState>;
    case "habits":
      return <PatternState id="habits" today={today} period={period}>{(pattern) => <HabitsPanel pattern={pattern} />}</PatternState>;
  }
}

function Headline({ summary, onWhy }: { summary: InsightsSummary; onWhy: () => void }) {
  const t = useTranslations("Insights.headline");
  const format = useInsightsFormat();
  const headline = summary.headline!;
  const [start, end] = headline.focusWindow;

  return (
    <SignatureCard
      as="section"
      tone="deep"
      aria-labelledby="insights-headline"
      className="md:col-span-3 lg:col-span-1"
      action={<SignatureCardAction icon={Info} variant="neutral" label={t("why")} onClick={onWhy} />}
      contentClassName="flex h-full flex-col gap-4"
    >
      <p className="text-[0.6875rem] font-bold tracking-wide text-on-deep-card-muted uppercase">{t("eyebrow", { period: summary.period })}</p>
      <h2 id="insights-headline" className="text-[1.5rem] leading-snug font-medium lg:text-[1.75rem]">
        {t.rich("text", {
          range: () => <HourRange start={start} end={end} format={format} clock />,
          habit: () => <bdi>{headline.habitTitle}</bdi>,
        })}
      </h2>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary" className="bg-surface text-fg hover:bg-subtle">
          <Link href="/personal/my-day">{t("plan")}</Link>
        </Button>
      </div>
    </SignatureCard>
  );
}

/** One observation (Time, Estimates, Habits): reads its tab's pattern and opens that tab. */
function ObservationCard({
  id,
  today,
  period,
  icon,
  onOpen,
}: {
  id: "time" | "estimates" | "habits";
  today: string;
  period: InsightsPeriod;
  icon: ReactNode;
  onOpen: (id: InsightPatternId) => void;
}) {
  const t = useTranslations("Insights");
  const format = useInsightsFormat();
  const changeText = useChangeText();
  const query = useInsightPattern(id, today, period);
  const titleId = useId();
  const result = query.data;

  let text: ReactNode = null;
  if (query.isPending) text = <Skeleton className="h-16 rounded-tile" />;
  else if (query.isError || !result) text = t("states.error.title");
  else if (result.status === "collecting") text = t("states.collecting.title", { have: format.number(result.have), need: format.number(result.need) });
  else if (result.pattern.id === "time") {
    const shares = contextShares(result.pattern);
    const change = sharePointsChange(shares.personal, result.pattern.previousShare.personal);
    text = t("observations.time.text", { share: format.percent(shares.personal), change: changeText(change) });
  } else if (result.pattern.id === "estimates") {
    const top = result.pattern.categories[0];
    text = top ? t("observations.estimates.text", { category: t(`estimates.${top.id}`), ratio: format.decimal(top.ratio) }) : null;
  } else if (result.pattern.id === "habits") {
    const top = result.pattern.rows[0];
    const delta = top ? top.doneMood - top.notDoneMood : 0;
    text = top && delta > 0 ? t.rich("observations.habits.text", { habit: () => <bdi>{top.title}</bdi>, delta: format.decimal(delta) }) : null;
  }

  return (
    <ProductCard as="article" aria-labelledby={titleId} className="flex min-h-44 flex-col gap-2" data-observation={id}>
      <p id={titleId} className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-wide text-scope-deep uppercase">
        {icon}
        {t(`observations.${id}.eyebrow`)}
      </p>
      <div className="type-title leading-snug text-fg">{text}</div>
      <button
        type="button"
        onClick={() => onOpen(id)}
        className="mt-auto self-start rounded-pill text-xs font-semibold text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:focus-ring"
      >
        {t(`observations.${id}.link`)}
      </button>
    </ProductCard>
  );
}

function NoData() {
  const t = useTranslations("Insights.states.noData");
  const [open, setOpen] = useState(false);
  const sourcesId = useId();
  return (
    <UtilityCard className="flex flex-col items-center gap-3 py-10 text-center" data-state="no-data">
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-surface text-fg">
        <Lightbulb size={20} />
      </span>
      <h2 className="type-title">{t("title")}</h2>
      <p className="max-w-md text-sm text-fg-secondary">{t("body")}</p>
      <Button size="sm" variant="secondary" aria-expanded={open} aria-controls={sourcesId} onClick={() => setOpen((value) => !value)}>
        {t("what")}
      </Button>
      <p id={sourcesId} hidden={!open} className="max-w-md text-xs font-semibold text-fg-muted">
        {t("sources")}
      </p>
    </UtilityCard>
  );
}

function Partial({ summary }: { summary: InsightsSummary }) {
  const t = useTranslations("Insights.states.partial");
  const format = useInsightsFormat();
  const title = t("title", { have: format.number(summary.activeDays), need: format.number(summary.requiredDays) });
  return (
    <UtilityCard className="flex flex-col gap-3" data-state="partial">
      <h2 className="type-title">{title}</h2>
      <Progress size="sm" value={(summary.activeDays / summary.requiredDays) * 100} label={title} />
      <p className="text-sm text-fg-secondary">{t("body")}</p>
    </UtilityCard>
  );
}
