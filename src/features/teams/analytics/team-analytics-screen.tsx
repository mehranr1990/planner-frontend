"use client";

import { Download } from "lucide-react";
import { Direction } from "radix-ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/design-system/feedback/progress";
import type { TeamAnalyticsRange, TeamAnalyticsSummary } from "@/data/team-domain";
import { useTeamAnalytics, useTeamProjects } from "@/data/team-queries";
import { ChartCard, SnapshotExportDialog, toCsv } from "@/features/projects/analytics/analytics-screen";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";

/*
 * TM-12 · Team analytics (/teams/[id]/analytics). Team-level only: no
 * per-person charts, rankings or scores (T10). KPI tiles state numerator,
 * denominator and source. Planned vs done per week = plain SVG grouped bars
 * mirrored by coordinates in RTL (never CSS-flipped), current week lighter
 * indigo, no volt, with "View as table" (PJ-12 ChartCard). Projects you can
 * open (progress) and where the done work came from: only openable projects
 * are named; the rest is one "Other projects" number for Lead/Admin.
 * Export snapshot (Lead/Admin) = CSV of what is shown (PJ-12 export dialog).
 */

const RANGES: readonly TeamAnalyticsRange[] = ["4w", "12w", "quarter"];

function useRangeText() {
  const t = useTranslations("TeamAnalytics");
  const format = useProjectFormat();
  return (range: TeamAnalyticsRange) =>
    range === "quarter" ? t("thisQuarter") : t("range.weeks", { n: format.number(range === "4w" ? 4 : 12) });
}

export function buildTeamSnapshotCsv(data: TeamAnalyticsSummary) {
  return toCsv([
    ["metric", "value", "denominator"],
    ["plan_completion_done", data.plannedDone, data.planned],
    ["carried_over", data.carried, data.planned],
    ["median_cycle_days", data.cycleMedianDays ?? "", data.cycleSample],
    ["capacity_booked_percent", data.capacityBooked ?? "", ""],
    ["data_as_of", data.asOf, ""],
    [],
    ["week_start", "week", "planned", "done", "current"],
    ...data.weeks.map((week) => [week.week, week.weekNumber, week.planned, week.done, week.current ? "yes" : ""]),
    [],
    ["source", "done_tasks"],
    ["team", data.mix.team],
    ...data.mix.projects.map((item) => [item.name, item.count]),
    ...(data.mix.other !== null ? [["other_projects", data.mix.other]] : []),
  ]);
}

export function TeamAnalyticsScreen() {
  const t = useTranslations("TeamAnalytics");
  const format = useProjectFormat();
  const rangeText = useRangeText();
  const { team, capabilities, demo } = useTeam();
  const [range, setRange] = useState<TeamAnalyticsRange>("12w");
  const [exporting, setExporting] = useState(false);
  const summary = useTeamAnalytics(team.id, range, teamDemoAccessOptions(demo));

  const header = (
    <TeamPageHeader
      module="analytics"
      title={t("title")}
      actions={
        <>
          <Segmented<TeamAnalyticsRange>
            label={t("range.label")}
            value={range}
            onValueChange={setRange}
            options={RANGES.map((value) => ({
              value,
              label: value === "quarter" ? t("range.quarter") : t("range.weeks", { n: format.number(value === "4w" ? 4 : 12) }),
            }))}
          />
          {capabilities.exportAnalytics ? (
            <Button variant="secondary" size="lg" className="gap-2 bg-surface" onClick={() => setExporting(true)}>
              <Icon icon={Download} size={18} />
              {t("export")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (summary.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void summary.refetch()} />
      </>
    );
  }
  if (!summary.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }
  const data = summary.data;

  return (
    <>
      {header}
      <Kpis data={data} />
      <PlannedVsDone data={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProjectProgress />
        <WorkMix data={data} rangeLabel={rangeText(data.range)} />
      </div>
      <p className="text-xs font-medium text-fg-secondary">{t("footnote")}</p>
      {exporting ? (
        <SnapshotExportDialog
          scope="team"
          fileName={`${team.id}-snapshot-${data.asOf.slice(0, 10)}.csv`}
          ready
          csvHint={t("csvHint")}
          buildCsv={() => buildTeamSnapshotCsv(data)}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </>
  );
}

function Kpis({ data }: { data: TeamAnalyticsSummary }) {
  const t = useTranslations("TeamAnalytics");
  const format = useProjectFormat();
  const rangeText = useRangeText();
  // Floor, like the other completion numbers (never overstate progress).
  const completion = data.planned ? Math.floor((data.plannedDone / data.planned) * 100) : null;
  const carried = data.planned ? Math.round((data.carried / data.planned) * 100) : null;
  const tile = "flex flex-col gap-1.5 rounded-[24px] bg-surface p-4";
  const value = "text-3xl font-bold text-fg tabular";
  const caption = "text-xs font-medium text-fg-secondary";
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <li className={tile}>
        <span className="text-xs font-semibold text-fg-secondary">{t("planCompletion")}</span>
        <span className={value}>{completion === null ? t("none") : format.percent(completion)}</span>
        <span className={caption}>
          {t("captions.completion", {
            done: format.number(data.plannedDone),
            planned: format.number(data.planned),
            range: rangeText(data.range),
          })}
        </span>
      </li>
      <li className={tile}>
        <span className="text-xs font-semibold text-fg-secondary">{t("carried")}</span>
        <span className={value}>{carried === null ? t("none") : format.percent(carried)}</span>
        <span className={caption}>
          {t("captions.carried", { carried: format.number(data.carried), planned: format.number(data.planned) })}
        </span>
      </li>
      <li className={tile}>
        <span className="text-xs font-semibold text-fg-secondary">{t("cycle")}</span>
        <span className={value}>
          {data.cycleMedianDays === null ? t("none") : t("days", { n: format.number(data.cycleMedianDays) })}
        </span>
        <span className={caption}>{t("captions.cycle", { n: format.number(data.cycleSample) })}</span>
      </li>
      <li className={tile}>
        <span className="text-xs font-semibold text-fg-secondary">{t("capacity")}</span>
        <span className={value}>{data.capacityBooked === null ? t("none") : format.percent(data.capacityBooked)}</span>
        <span className={caption}>{t("captions.capacity")}</span>
      </li>
    </ul>
  );
}

function PlannedVsDone({ data }: { data: TeamAnalyticsSummary }) {
  const t = useTranslations("TeamAnalytics");
  const format = useProjectFormat();
  const rtl = Direction.useDirection() === "rtl";
  const width = 760;
  const height = 220;
  const base = height - 28;
  const n = data.weeks.length;
  const max = Math.max(1, ...data.weeks.map((week) => Math.max(week.planned, week.done)));
  const slot = (width - 16) / Math.max(1, n);
  const bar = Math.min(26, slot * 0.32);
  // Time runs with the reading direction: mirrored by coordinates in RTL.
  const center = (index: number) => {
    const raw = 8 + slot * index + slot / 2;
    return rtl ? width - raw : raw;
  };
  const yOf = (value: number) => base - (value / max) * (base - 16);
  const current = data.weeks.find((week) => week.current);
  const legend = (
    <ul className="flex flex-wrap items-center gap-3 text-xs font-semibold text-fg-secondary">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-[3px] bg-scope-soft" />
        {t("plan.planned")}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-[3px] bg-scope-deep" />
        {t("plan.done")}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-[3px] bg-scope-dot" />
        {t("plan.current")}
      </li>
    </ul>
  );
  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-fg-secondary">
          <th scope="col" className="text-start">
            {t("table.week")}
          </th>
          <th scope="col" className="text-end">
            {t("table.planned")}
          </th>
          <th scope="col" className="text-end">
            {t("table.done")}
          </th>
        </tr>
      </thead>
      <tbody>
        {data.weeks.map((week) => (
          <tr key={week.week} className={week.current ? "font-bold" : undefined}>
            <th scope="row" className="text-start font-medium">
              {t("plan.week", { n: format.number(week.weekNumber) })} · {format.day(week.week)}
            </th>
            <td className="text-end tabular">{format.number(week.planned)}</td>
            <td className="text-end tabular">{format.number(week.done)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartCard title={t("plan.title")} aside={legend} table={table}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("plan.summary", {
          done: format.number(data.plannedDone),
          planned: format.number(data.planned),
          weeks: format.number(n),
          current: format.number(current?.done ?? 0),
          currentPlanned: format.number(current?.planned ?? 0),
        })}
        className="h-auto w-full"
      >
        {data.weeks.map((week, index) => {
          const x = center(index);
          // Planned leads in reading order, done follows.
          const plannedX = rtl ? x + 1 : x - bar - 1;
          const doneX = rtl ? x - bar - 1 : x + 1;
          return (
            <g key={week.week}>
              <rect
                x={plannedX}
                y={yOf(week.planned)}
                width={bar}
                height={Math.max(0, base - yOf(week.planned))}
                rx={5}
                className="fill-scope-soft dark:fill-[color-mix(in_oklab,var(--color-scope-deep),var(--color-surface)_60%)]"
              />
              <rect
                x={doneX}
                y={yOf(week.done)}
                width={bar}
                height={Math.max(0, base - yOf(week.done))}
                rx={5}
                className={week.current ? "fill-scope-dot" : "fill-scope-deep"}
              />
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                className={cn("text-[11px]", week.current ? "fill-scope-deep font-bold" : "fill-fg-secondary")}
              >
                {t("plan.week", { n: format.number(week.weekNumber) })}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartCard>
  );
}

function ProjectProgress() {
  const t = useTranslations("TeamAnalytics");
  const format = useProjectFormat();
  const { team } = useTeam();
  // Team membership never grants project access: only projects the viewer can open.
  const projects = useTeamProjects(team.id);
  const list = projects.data ?? [];
  return (
    <section aria-labelledby="team-projects-progress" className="flex min-w-0 flex-col gap-3 rounded-[28px] bg-surface p-4">
      <h2 id="team-projects-progress" className="type-title text-fg">
        {t("projects.title")}
      </h2>
      {list.length === 0 ? (
        projects.data ? (
          <p className="text-sm text-fg-muted">{t("projects.empty")}</p>
        ) : (
          <Skeleton className="h-20 rounded-row" />
        )
      ) : (
        <ul className="flex flex-col gap-2.5">
          {list.map((project) => (
            <li key={project.id} data-scope="project" className="grid grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)_3rem] items-center gap-3">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-scope-soft px-2.5 py-0.5 text-xs font-semibold text-scope-deep">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
                <bdi className="truncate">{project.name}</bdi>
              </span>
              <Progress value={project.percent} label={project.name} size="sm" />
              <span className="text-end text-xs font-bold text-fg tabular">{format.percent(project.percent)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs font-medium text-fg-secondary">{t("projects.note")}</p>
    </section>
  );
}

function WorkMix({ data, rangeLabel }: { data: TeamAnalyticsSummary; rangeLabel: string }) {
  const t = useTranslations("TeamAnalytics");
  const format = useProjectFormat();
  const rows = [
    { key: "team", name: t("mix.team"), count: data.mix.team, scope: "team" },
    ...data.mix.projects.map((item) => ({ key: item.projectId, name: item.name, count: item.count, scope: "project" })),
    ...(data.mix.other !== null ? [{ key: "other", name: t("mix.other"), count: data.mix.other, scope: "project" }] : []),
  ];
  const max = Math.max(1, ...rows.map((row) => row.count));
  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-fg-secondary">
          <th scope="col" className="text-start">
            {t("table.source")}
          </th>
          <th scope="col" className="text-end">
            {t("table.count")}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row" className="text-start font-medium">
              <bdi>{row.name}</bdi>
            </th>
            <td className="text-end tabular">{format.number(row.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartCard
      title={t("mix.title")}
      aside={<span className="text-xs font-semibold text-fg-secondary">{t("mix.unit", { range: rangeLabel })}</span>}
      table={table}
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.key} data-scope={row.scope} className="grid grid-cols-[minmax(7rem,1fr)_minmax(0,1.4fr)_2.5rem] items-center gap-3">
            <bdi className="truncate text-sm font-semibold text-fg">{row.name}</bdi>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <span className="block h-full rounded-full bg-scope-deep" style={{ inlineSize: `${(row.count / max) * 100}%` }} />
            </span>
            <span className="text-end text-xs font-bold text-fg tabular">{format.number(row.count)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs font-medium text-fg-secondary">{t("mix.note")}</p>
    </ChartCard>
  );
}
