"use client";

import { Download, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { useState, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { EmptyState } from "@/components/feedback/state-views";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { Progress } from "@/design-system/feedback/progress";
import type { AnalyticsRange, AnalyticsSummary, ProjectTask, ProjectWorkflow } from "@/data/project-domain";
import { useAnalytics, useProjectTasks, useProjectWorkflow } from "@/data/project-queries";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { useMediaQuery } from "../use-media";
import { useWorkflowStatusLabel, WorkflowStatusChip } from "../workflow-status-chip";

/*
 * PJ-12 · Analytics (/projects/[id]/analytics). KPI tiles whose captions
 * state numerator, denominator and source (task counts); burn-up and
 * throughput as plain SVG (blue family, current week highlighted, no volt),
 * each with "View as table" and an aria-label summary; by-status and
 * by-assignee bars (Members get only their own row from the server, Viewers
 * none). Range segmented 4 / 12 weeks / All; weeks start Saturday in fa,
 * Monday in en (DECISIONS proposed default, as SPEC states). Export snapshot
 * (Manager+) = client-side CSV in the mock. "Data as of" line. No score, no
 * AI. Charts mirror in RTL by coordinates (x = width − x), never CSS flip.
 * Phones: KPIs 2×2 + burn-up; the rest behind "More charts".
 */

export function AnalyticsScreen() {
  const t = useTranslations("Analytics");
  const format = useProjectFormat();
  const { project, capabilities, demo } = useProject();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const [range, setRange] = useState<AnalyticsRange>("12w");
  const [exporting, setExporting] = useState(false);
  const [more, setMore] = useState(false);
  const weekStartsOn = format.locale === "fa" ? 6 : 1;
  const summary = useAnalytics(project.id, range, weekStartsOn, demoAccessOptions(demo));
  const workflow = useProjectWorkflow(project.id);

  const header = (
    <ProjectPageHeader
      module="analytics"
      title={t("title")}
      actions={
        <>
          <Segmented
            label={t("range.label")}
            value={range}
            onValueChange={setRange}
            options={[
              { value: "4w", label: t("range.weeks", { n: format.number(4) }) },
              { value: "12w", label: t("range.weeks", { n: format.number(12) }) },
              { value: "all", label: t("range.all") },
            ]}
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

  if (summary.isError) return <AccessState kind="not-available" titleAs="h1" />;
  if (!summary.data || !workflow.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const data = summary.data;
  const enough = data.enoughData && demo !== "empty";
  const showRest = !phone || more;

  return (
    <>
      {header}
      <Kpis data={data} />
      {enough ? (
        <>
          <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <BurnUp data={data} />
            {showRest ? <Throughput data={data} /> : null}
          </div>
          {showRest ? (
            <div className={cn("grid gap-4", data.byAssignee.length > 0 && "lg:grid-cols-2")}>
              <ByStatus data={data} workflow={workflow.data} />
              {data.byAssignee.length > 0 ? <ByAssignee data={data} own={!capabilities.exportAnalytics} /> : null}
            </div>
          ) : null}
          {phone ? (
            <Button variant="secondary" className="self-center" aria-expanded={more} onClick={() => setMore((open) => !open)}>
              {more ? t("fewerCharts") : t("moreCharts")}
            </Button>
          ) : null}
        </>
      ) : (
        <EmptyState variant="card" icon={Lightbulb} title={t("notEnough")} description={t("notEnoughBody")} titleAs="h2" />
      )}
      <p className="text-xs font-medium text-fg-secondary">
        {t("asOf", {
          time: `${format.day(data.asOf.slice(0, 10))} · ${convertDigits(data.asOf.slice(11, 16), format.digits)}`,
        })}{" "}
        · {t("asOfNote")}
      </p>
      {exporting ? <ExportDialog data={data} workflow={workflow.data} onClose={() => setExporting(false)} /> : null}
    </>
  );
}

function Kpis({ data }: { data: AnalyticsSummary }) {
  const t = useTranslations("Analytics");
  const format = useProjectFormat();
  const { kpis } = data;
  // Floor, like the project summary percent (never overstate progress).
  const completion = kpis.total ? Math.floor((kpis.done / kpis.total) * 100) : 0;
  const onTime = kpis.doneWithDue ? Math.round((kpis.onTime / kpis.doneWithDue) * 100) : null;
  const tile = "flex flex-col gap-1.5 rounded-[24px] bg-surface p-4";
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <li className={tile}>
        <span className="text-xs font-semibold text-fg-secondary">{t("completion")}</span>
        <span className="text-3xl font-bold text-fg tabular">{format.percent(completion)}</span>
        <Progress value={completion} label={t("completion")} size="sm" />
        <span className="text-xs font-medium text-fg-secondary">
          {t("captions.completion", { done: format.number(kpis.done), total: format.number(kpis.total) })}
        </span>
      </li>
      <li className={tile}>
        <span className="text-xs font-semibold text-fg-secondary">{t("onTime")}</span>
        <span className="text-3xl font-bold text-fg tabular">{onTime === null ? t("none") : format.percent(onTime)}</span>
        <span className="text-xs font-medium text-fg-secondary">
          {t("captions.onTime", { onTime: format.number(kpis.onTime), withDue: format.number(kpis.doneWithDue) })}
        </span>
      </li>
      <li className={tile}>
        <span className="text-xs font-semibold text-fg-secondary">{t("cycle")}</span>
        <span className="text-3xl font-bold text-fg tabular">
          {kpis.cycleMedianDays === null ? t("none") : t("days", { n: format.number(kpis.cycleMedianDays) })}
        </span>
        <span className="text-xs font-medium text-fg-secondary">
          {t("captions.cycle", { n: format.number(kpis.cycleSample) })}
        </span>
      </li>
      <li className={tile}>
        <span className="text-xs font-semibold text-fg-secondary">{t("overdue")}</span>
        <span className={cn("text-3xl font-bold tabular", kpis.overdue > 0 ? "text-danger-text" : "text-fg")}>
          {format.number(kpis.overdue)}
        </span>
        <span className="text-xs font-medium text-fg-secondary">
          {t("captions.overdue", { blocked: format.number(kpis.overdueBlocked) })}
        </span>
      </li>
    </ul>
  );
}

function ChartCard({
  title,
  aside,
  table,
  children,
}: {
  title: string;
  aside?: ReactNode;
  table: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("Analytics.table");
  const [asTable, setAsTable] = useState(false);
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-[28px] bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="type-title text-fg">{title}</h2>
        <div className="flex items-center gap-3">
          {aside}
          <button
            type="button"
            aria-pressed={asTable}
            onClick={() => setAsTable((value) => !value)}
            className="text-xs font-bold text-fg underline underline-offset-2 focus-visible:focus-ring"
          >
            {asTable ? t("hide") : t("show")}
          </button>
        </div>
      </div>
      {asTable ? table : children}
    </section>
  );
}

const W = 600;
const H = 220;
const PAD = { top: 16, bottom: 28, side: 32 };

function BurnUp({ data }: { data: AnalyticsSummary }) {
  const t = useTranslations("Analytics");
  const format = useProjectFormat();
  const rtl = Direction.useDirection() === "rtl";
  const n = data.weeks.length;
  const max = Math.max(1, ...data.scope, ...data.doneCumulative);
  const top = Math.ceil(max / 5) * 5;
  const x = (index: number) => {
    const raw = PAD.side + (n === 1 ? (W - 2 * PAD.side) / 2 : (index * (W - 2 * PAD.side)) / (n - 1));
    return rtl ? W - raw : raw;
  };
  const y = (value: number) => H - PAD.bottom - (value / top) * (H - PAD.top - PAD.bottom);
  const path = (values: readonly number[], until = values.length) =>
    values
      .slice(0, until)
      .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
      .join(" ");
  const last = n - 1;
  const doneNow = data.doneCumulative[last] ?? 0;
  const scopeNow = data.scope[last] ?? 0;
  const ticks = [0, top / 3, (2 * top) / 3, top].map((value) => Math.round(value));
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const anchorEnd = rtl ? "start" : "end";

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-fg-secondary">
          <th scope="col" className="text-start">{t("table.week")}</th>
          <th scope="col" className="text-end">{t("table.scope")}</th>
          <th scope="col" className="text-end">{t("table.done")}</th>
        </tr>
      </thead>
      <tbody>
        {data.weeks.map((week, index) => (
          <tr key={week} className={index === last ? "font-bold" : undefined}>
            <th scope="row" className="text-start font-medium">{format.day(week)}</th>
            <td className="text-end tabular">{format.number(data.scope[index] ?? 0)}</td>
            <td className="text-end tabular">{format.number(data.doneCumulative[index] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title={t("burnup.title")}
      table={table}
      aside={
        <span className="flex items-center gap-3 text-xs font-semibold text-fg-secondary max-sm:hidden">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-0.5 w-4 bg-fg-muted" />
            {t("burnup.scope")}
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-0.5 w-4 bg-scope-deep" />
            {t("burnup.done")}
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-scope-deep" />
            {t("burnup.soFar")}
          </span>
        </span>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t("burnup.summary", { done: format.number(doneNow), scope: format.number(scopeNow) })}
        className="h-auto w-full"
      >
        {ticks.map((value) => (
          <g key={value}>
            <line x1={PAD.side} x2={W - PAD.side} y1={y(value)} y2={y(value)} className="stroke-hairline" strokeWidth={1} />
            <text
              x={rtl ? W - 4 : 4}
              y={y(value) + 4}
              textAnchor={rtl ? "end" : "start"}
              className="fill-fg-secondary text-[11px]"
            >
              {format.number(value)}
            </text>
          </g>
        ))}
        {data.weeks.map((week, index) =>
          index % labelEvery === 0 || index === last ? (
            <text
              key={week}
              x={x(index)}
              y={H - 8}
              textAnchor="middle"
              className={cn("text-[11px]", index === last ? "fill-scope-deep font-bold" : "fill-fg-secondary")}
            >
              {format.day(week)}
            </text>
          ) : null,
        )}
        <path d={path(data.scope)} fill="none" className="stroke-fg-muted" strokeWidth={2} />
        <path d={path(data.doneCumulative, Math.max(1, n - 1))} fill="none" className="stroke-scope-deep" strokeWidth={2.5} />
        {n > 1 ? (
          <path
            d={`M ${x(n - 2)} ${y(data.doneCumulative[n - 2] ?? 0)} L ${x(last)} ${y(doneNow)}`}
            fill="none"
            className="stroke-scope-deep"
            strokeWidth={2.5}
            strokeDasharray="6 5"
          />
        ) : null}
        <circle cx={x(last)} cy={y(doneNow)} r={4.5} className="fill-scope-deep" />
        <text x={x(last)} y={y(scopeNow) - 6} textAnchor={anchorEnd} className="fill-fg text-[11px] font-bold">
          {t("burnup.scopeLabel", { n: format.number(scopeNow) })}
        </text>
        <text x={x(last)} y={y(doneNow) - 10} textAnchor={anchorEnd} className="fill-scope-deep text-[11px] font-bold">
          {t("burnup.doneLabel", { n: format.number(doneNow) })}
        </text>
      </svg>
    </ChartCard>
  );
}

function Throughput({ data }: { data: AnalyticsSummary }) {
  const t = useTranslations("Analytics");
  const format = useProjectFormat();
  const rtl = Direction.useDirection() === "rtl";
  const n = data.throughput.length;
  const max = Math.max(1, ...data.throughput);
  const width = 360;
  const height = 220;
  const slot = (width - 16) / n;
  const bar = Math.min(40, slot * 0.7);
  const xCenter = (index: number) => {
    const raw = 8 + slot * index + slot / 2;
    return rtl ? width - raw : raw;
  };
  const yOf = (value: number) => height - 28 - (value / max) * (height - 56);
  const last = n - 1;
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const total = data.throughput.reduce((sum, value) => sum + value, 0);
  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-fg-secondary">
          <th scope="col" className="text-start">{t("table.week")}</th>
          <th scope="col" className="text-end">{t("table.done")}</th>
        </tr>
      </thead>
      <tbody>
        {data.weeks.map((week, index) => (
          <tr key={week} className={index === last ? "font-bold" : undefined}>
            <th scope="row" className="text-start font-medium">{format.day(week)}</th>
            <td className="text-end tabular">{format.number(data.throughput[index] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartCard
      title={t("throughput.title")}
      table={table}
      aside={<span className="text-xs font-semibold text-fg-secondary">{t("throughput.unit")}</span>}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("throughput.summary", {
          total: format.number(total),
          weeks: format.number(n),
          current: format.number(data.throughput[last] ?? 0),
        })}
        className="h-auto w-full"
      >
        {data.throughput.map((value, index) => (
          <g key={data.weeks[index]}>
            <rect
              x={xCenter(index) - bar / 2}
              y={yOf(value)}
              width={bar}
              height={Math.max(0, height - 28 - yOf(value))}
              rx={6}
              // PJ12 Dark: past weeks are a lifted light blue (the soft tint is too close to the surface).
              className={
                index === last
                  ? "fill-scope-deep"
                  : "fill-scope-soft dark:fill-[color-mix(in_oklab,var(--color-scope-deep),var(--color-fg)_30%)]"
              }
            />
            {value > 0 ? (
              <text x={xCenter(index)} y={yOf(value) - 6} textAnchor="middle" className="fill-fg text-[11px] font-bold">
                {format.number(value)}
              </text>
            ) : null}
            {index % labelEvery === 0 || index === last ? (
              <text
                x={xCenter(index)}
                y={height - 8}
                textAnchor="middle"
                className={cn("text-[10px]", index === last ? "fill-scope-deep font-bold" : "fill-fg-secondary")}
              >
                {format.day(data.weeks[index]!)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </ChartCard>
  );
}

const STATUS_BAR: Record<string, string> = {
  todo: "bg-fg-muted",
  active: "bg-scope-deep",
  review: "bg-team-deep",
  blocked: "bg-danger",
  done: "bg-personal-deep",
};

function ByStatus({ data, workflow }: { data: AnalyticsSummary; workflow: ProjectWorkflow }) {
  const t = useTranslations("Analytics");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const total = data.kpis.total || 1;
  const rows = data.byStatus.map((entry) => ({ ...entry, status: workflow.statuses.find((status) => status.id === entry.statusId) }));
  const table = (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.statusId}>
            <th scope="row" className="text-start font-medium">{statusLabel(row.status)}</th>
            <td className="text-end tabular">{format.number(row.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartCard title={t("status.title")} table={table}>
      <ul aria-label={t("status.summary")} className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.statusId} className="grid grid-cols-[7rem_minmax(0,1fr)_2.5rem] items-center gap-3">
            <WorkflowStatusChip status={row.status} />
            <span className="h-1.5 overflow-hidden rounded-pill bg-hairline">
              <span
                className={cn("block h-full rounded-pill", STATUS_BAR[row.status?.category ?? "todo"])}
                style={{ inlineSize: `${(row.count / total) * 100}%` }}
              />
            </span>
            <span className="text-end text-sm font-bold text-fg tabular">{format.number(row.count)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs font-medium text-fg-secondary">
        {t("status.caption", { version: format.number(workflow.version), total: format.number(data.kpis.total) })}
      </p>
    </ChartCard>
  );
}

function ByAssignee({ data, own }: { data: AnalyticsSummary; own: boolean }) {
  const t = useTranslations("Analytics");
  const format = useProjectFormat();
  const max = Math.max(1, ...data.byAssignee.map((entry) => entry.done));
  const table = (
    <table className="w-full text-sm">
      <tbody>
        {data.byAssignee.map((entry) => (
          <tr key={entry.person.id}>
            <th scope="row" className="text-start font-medium">
              <bdi>{entry.person.name}</bdi>
            </th>
            <td className="text-end tabular">{format.number(entry.done)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartCard title={t("assignee.title")} table={table}>
      <ul aria-label={t("assignee.summary")} className="flex flex-col gap-2.5">
        {data.byAssignee.map((entry) => (
          <li key={entry.person.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={entry.person.name} initials={entry.person.initials} size={32} decorative className="size-6 text-[0.5625rem]" />
              <bdi className="truncate text-sm font-semibold text-fg">{entry.person.name}</bdi>
            </span>
            <span className="h-1.5 overflow-hidden rounded-pill bg-scope-soft">
              <span className="block h-full rounded-pill bg-scope-deep" style={{ inlineSize: `${(entry.done / max) * 100}%` }} />
            </span>
            <span className="text-end text-sm font-bold text-fg tabular">{format.number(entry.done)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs font-medium text-fg-secondary">
        {t("assignee.caption")} {own ? t("assignee.own") : null}
      </p>
    </ChartCard>
  );
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The snapshot CSV (mock: built locally; the server will generate it later). */
export function buildSnapshotCsv(data: AnalyticsSummary, tasks: readonly ProjectTask[], statusName: (id: string) => string) {
  const lines: (string | number)[][] = [
    ["metric", "value", "denominator"],
    ["completion_done", data.kpis.done, data.kpis.total],
    ["on_time_done", data.kpis.onTime, data.kpis.doneWithDue],
    ["median_cycle_days", data.kpis.cycleMedianDays ?? "", data.kpis.cycleSample],
    ["overdue_open", data.kpis.overdue, ""],
    ["data_as_of", data.asOf, ""],
    [],
    ["week_start", "scope", "done_cumulative", "done_in_week"],
    ...data.weeks.map((week, index) => [week, data.scope[index] ?? 0, data.doneCumulative[index] ?? 0, data.throughput[index] ?? 0]),
    [],
    ["task_id", "title", "status", "assignees", "due", "estimate_hours"],
    ...tasks.map((task) => [
      task.id,
      task.title,
      statusName(task.statusId),
      task.assignees.map((assignee) => assignee.person.name).join("; "),
      task.due ?? "",
      task.estimateHours ?? "",
    ]),
  ];
  return lines.map((line) => line.map(csvCell).join(",")).join("\n");
}

function ExportDialog({ data, workflow, onClose }: { data: AnalyticsSummary; workflow: ProjectWorkflow; onClose: () => void }) {
  const t = useTranslations("Analytics.exportDialog");
  const statusLabel = useWorkflowStatusLabel();
  const { project } = useProject();
  const tasks = useProjectTasks(project.id, {});
  const download = () => {
    const csv = buildSnapshotCsv(data, tasks.data?.tasks ?? [], (id) =>
      statusLabel(workflow.statuses.find((status) => status.id === id)),
    );
    if (typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.key}-snapshot-${data.asOf.slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    toast({ title: t("done") });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t("title")} size="sm" data-scope="project">
        <div role="radiogroup" aria-label={t("title")} className="flex flex-col gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked="true"
            className="flex items-center justify-between rounded-[14px] bg-surface px-3 py-2.5 text-start inset-ring-[1.5px] inset-ring-scope-deep focus-visible:focus-ring"
          >
            <span className="text-sm font-bold text-fg">{t("csv")}</span>
            <span className="text-xs font-medium text-fg-secondary">{t("csvHint")}</span>
          </button>
          {/* PDF needs the server export (not built): shown, not selectable. */}
          <button
            type="button"
            role="radio"
            aria-checked="false"
            aria-disabled
            className="flex items-center justify-between rounded-[14px] bg-subtle px-3 py-2.5 text-start opacity-60"
          >
            <span className="text-sm font-bold text-fg">{t("pdf")}</span>
            <span className="text-xs font-medium text-fg-secondary">{t("pdfHint")}</span>
          </button>
        </div>
        <p className="text-xs font-medium text-fg-secondary">{t("note")}</p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={download} disabled={!tasks.data}>
            {t("action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
