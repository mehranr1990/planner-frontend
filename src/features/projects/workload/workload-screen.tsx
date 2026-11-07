"use client";

import { UsersRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Avatar } from "@/components/ui/avatar";
import { Segmented } from "@/components/ui/segmented";
import { Progress } from "@/design-system/feedback/progress";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { WorkloadCell, WorkloadGrid, WorkloadPeriod, WorkloadPeriodUnit, WorkloadRow } from "@/data/project-domain";
import { useProjectWorkflow, useWorkloadGrid } from "@/data/project-queries";
import { getPlannerToday } from "@/data/clock";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { useOpenProjectSheet } from "../sheets/project-sheet-params";
import { useMediaQuery } from "../use-media";
import { useWorkflowStatusLabel, WorkflowStatusChip } from "../workflow-status-chip";

/*
 * PJ-11 · Workload (/projects/[id]/workload). Members × weeks as a real
 * table (row = member, column = week) with hours and percent of the weekly
 * project capacity (Members page); blue intensity up to capacity, rose over
 * it, never volt, and the percent is always written. Unassigned row and a
 * legend. A cell opens the member-week SignatureCard whose notch is
 * "Reassign a task" (?sheet=assignment-reassign, Manager+). Only this
 * project's estimates (D13): Personal data is never read. Members see only
 * their own row. Phones (PJM03): per member this week + next week bars.
 * `?cell=<personId>:<index>` keeps the selection.
 *
 * Owner decision (after Batch C): two segmented switches from the board.
 * Weeks / Months (`?period=months`): months follow the user's calendar
 * (Jalali months in Shamsi, Gregorian otherwise) and capacity = weekly
 * capacity × weeks of that month (days / 7), same blue/rose rule.
 * Estimates / Task count (`?measure=count`): open assigned tasks per
 * member-period (pending counted, D13), no percent and no rose (capacity is
 * in hours). Phones keep the PJM03 view (this/next week hours, no switches).
 */

const WEEKS = 6;
const MONTHS = 3;

export type WorkloadMeasure = "hours" | "count";

/** Weekly capacity scaled to one column (a week, or a month = days / 7 weeks). */
export function periodCapacity(capacity: number | null, period: Pick<WorkloadPeriod, "weeks">): number | null {
  return capacity ? capacity * period.weeks : capacity;
}

export type LoadTier = "none" | "low" | "mid" | "high" | "over";

export function loadTier(hours: number, capacity: number | null): LoadTier {
  if (!capacity) return "none";
  const ratio = hours / capacity;
  if (ratio > 1) return "over";
  if (ratio >= 0.9) return "high";
  if (ratio >= 0.5) return "mid";
  return "low";
}

const TIER_CLASS: Record<LoadTier, string> = {
  none: "bg-subtle text-fg",
  low: "bg-subtle text-fg",
  mid: "bg-scope-soft text-scope-deep",
  // PJ11 Dark: 90–100% is a light blue fill with dark (on-accent) text, not a darker tint.
  high: "bg-[color-mix(in_oklab,var(--color-scope-soft),var(--color-scope-deep)_30%)] text-fg dark:bg-[color-mix(in_oklab,var(--color-scope-deep),var(--color-fg)_35%)] dark:text-on-accent",
  over: "bg-danger-soft text-danger-text",
};

export function WorkloadScreen() {
  const t = useTranslations("Workload");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const format = useProjectFormat();
  const { project, capabilities, demo } = useProject();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  // Phones keep the PJM03 view: this week + next week hours, no switches.
  const unit: WorkloadPeriodUnit = !phone && params.get("period") === "months" ? "month" : "week";
  const measure: WorkloadMeasure = !phone && params.get("measure") === "count" ? "count" : "hours";
  const grid = useWorkloadGrid(
    project.id,
    getPlannerToday(),
    { unit, count: unit === "month" ? MONTHS : WEEKS, calendar: format.calendar },
    demoAccessOptions(demo),
  );
  const workflow = useProjectWorkflow(project.id);

  const setParam = (key: "period" | "measure", value: string | null, resetCell: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Column indexes change meaning with the period, so the selection resets.
    if (resetCell) next.delete("cell");
    next.delete("pick");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const header = (
    <ProjectPageHeader
      module="workload"
      title={t("title")}
      actions={
        phone ? undefined : (
          <>
            <Segmented
              label={t("switch.period")}
              value={unit}
              onValueChange={(value) => setParam("period", value === "month" ? "months" : null, true)}
              options={[
                { value: "week", label: t("switch.weeks") },
                { value: "month", label: t("switch.months") },
              ]}
            />
            <Segmented
              label={t("switch.measure")}
              value={measure}
              onValueChange={(value) => setParam("measure", value === "count" ? "count" : null, false)}
              options={[
                { value: "hours", label: t("switch.estimates") },
                { value: "count", label: t("switch.count") },
              ]}
            />
          </>
        )
      }
    />
  );
  // Viewers and guests have no Workload (hidden, forbidden = not found).
  if (grid.isError) return <AccessState kind="not-available" titleAs="h1" />;
  if (!grid.data || !workflow.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const data = grid.data;
  const selected = parseCell(params.get("cell"), data) ?? defaultCell(data, measure);
  const tableName = t("table", { measure, unit: data.unit });
  const periodLabel = (index: number) => {
    const start = data.weeks[index]!;
    if (data.unit === "month") return format.day(start, "monthYear");
    return index === 0 ? t("thisWeek") : format.day(start);
  };
  const select = (personId: string, week: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("cell", `${personId}:${week}`);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <>
      {header}
      {!capabilities.seeAllWorkload ? <p className="text-xs font-medium text-fg-secondary">{t("ownRow")}</p> : null}
      <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        {phone ? (
          <PhoneList grid={data} label={tableName} />
        ) : (
          <section aria-labelledby="workload-table" className="flex min-w-0 flex-col gap-3 rounded-[28px] bg-surface p-4">
            <h2 id="workload-table" className="sr-only">
              {tableName}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-1.5 text-sm">
                <caption className="sr-only">{tableName}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-40 text-start text-xs font-semibold text-fg-secondary">
                      <span className="sr-only">{t("person")}</span>
                    </th>
                    {data.weeks.map((week, index) => (
                      <th key={week} scope="col" className="text-center text-xs font-semibold text-fg-secondary">
                        {periodLabel(index)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.person.id}>
                      <th scope="row" className="text-start font-normal">
                        <RowHeader row={row} />
                      </th>
                      {row.cells.map((cell, index) => (
                        <td key={data.weeks[index]} className="p-0">
                          <CellButton
                            row={row}
                            cell={cell}
                            period={data.periods[index]!}
                            unit={data.unit}
                            measure={measure}
                            selected={selected?.personId === row.person.id && selected.week === index}
                            onSelect={() => select(row.person.id, index)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {data.unassigned.length > 0 ? (
                    <tr>
                      <th scope="row" className="pt-2 text-start text-xs font-semibold text-fg-secondary">
                        {t("unassigned")}
                      </th>
                      {data.unassigned.map((cell, index) => (
                        <td key={data.weeks[index]} className="pt-2 text-center text-xs font-semibold text-fg-secondary">
                          {measure === "count"
                            ? cell.count > 0
                              ? t("tasksCount", { n: cell.count })
                              : t("none")
                            : cell.tasks > 0
                              ? t("unassignedCell", { n: cell.tasks, hours: format.number(cell.hours) })
                              : t("none")}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {measure === "count" ? (
              <p className="text-xs font-medium text-fg-secondary">{t("legend.count")}</p>
            ) : (
              <Legend />
            )}
            <p className="text-end text-xs font-medium text-fg-secondary">
              {measure === "count" ? t("footnoteCount") : t("footnote")}
            </p>
          </section>
        )}
        {selected && !phone ? (
          <MemberPeriodCard
            row={data.rows.find((row) => row.person.id === selected.personId)!}
            period={data.periods[selected.week]!}
            label={data.unit === "month" ? periodLabel(selected.week) : format.day(data.weeks[selected.week]!)}
            unit={data.unit}
            measure={measure}
            cell={data.rows.find((row) => row.person.id === selected.personId)!.cells[selected.week]!}
          />
        ) : null}
      </div>
    </>
  );
}

function parseCell(value: string | null, grid: WorkloadGrid) {
  if (!value) return null;
  const [personId, week] = value.split(":");
  const index = Number(week);
  if (!personId || !Number.isInteger(index) || index < 0 || index >= grid.weeks.length) return null;
  return grid.rows.some((row) => row.person.id === personId) ? { personId, week: index } : null;
}

/** The busiest member-period: by share of capacity (over capacity first), or by task count. */
function defaultCell(grid: WorkloadGrid, measure: WorkloadMeasure) {
  let best: { personId: string; week: number; score: number } | null = null;
  for (const row of grid.rows) {
    row.cells.forEach((cell, week) => {
      const capacity = periodCapacity(row.capacity, grid.periods[week]!);
      const value = measure === "count" ? cell.count : cell.hours;
      const score = measure === "count" ? cell.count : capacity ? cell.hours / capacity : cell.hours / 1000;
      if (value > 0 && (!best || score > best.score)) best = { personId: row.person.id, week, score };
    });
  }
  const first = grid.rows[0];
  return best ?? (first ? { personId: first.person.id, week: 0 } : null);
}

function RowHeader({ row }: { row: WorkloadRow }) {
  const t = useTranslations("Workload");
  const format = useProjectFormat();
  return (
    <span className="flex items-center gap-2.5">
      <Avatar name={row.person.name} initials={row.person.initials} size={32} decorative className="size-8 text-[0.625rem]" />
      <span className="flex min-w-0 flex-col">
        <bdi className="truncate text-sm font-bold text-fg">
          {row.role === "guest" ? t("guest", { name: row.person.name }) : row.person.name}
        </bdi>
        <span className="truncate text-xs font-medium text-fg-secondary">
          {row.capacity !== null ? t("perWeek", { n: format.number(row.capacity) }) : t("noCapacity")}
        </span>
        {row.unestimated > 0 ? (
          <span className="mt-0.5 w-fit rounded-pill bg-warning-soft px-2 text-[0.6875rem] font-semibold text-warning-text">
            {t("unestimated", { n: format.number(row.unestimated) })}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function CellButton({
  row,
  cell,
  period,
  unit,
  measure,
  selected,
  onSelect,
}: {
  row: WorkloadRow;
  cell: WorkloadCell;
  period: WorkloadPeriod;
  unit: WorkloadPeriodUnit;
  measure: WorkloadMeasure;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("Workload");
  const format = useProjectFormat();
  const capacity = periodCapacity(row.capacity, period);
  // Task count mode: capacity is in hours, so no tiers, no percent, no rose.
  const tier = measure === "count" ? "none" : loadTier(cell.hours, capacity);
  const percent = measure === "hours" && capacity ? Math.round((cell.hours / capacity) * 100) : null;
  const periodName = unit === "month" ? format.day(period.start, "monthYear") : t("week", { date: format.day(period.start) });
  const label =
    measure === "count"
      ? t("cellCount", { name: row.person.name, period: periodName, n: cell.count })
      : percent !== null
        ? t("cell", {
            name: row.person.name,
            period: periodName,
            hours: format.number(cell.hours),
            capacity: format.number(Math.round(capacity!)),
            percent: format.percent(percent),
          })
        : t("cellNoCapacity", { name: row.person.name, period: periodName, hours: format.number(cell.hours) });
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      data-tier={tier}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 w-full flex-col items-center justify-center rounded-[14px] tabular focus-visible:focus-ring",
        TIER_CLASS[tier],
        selected && "inset-ring-2 inset-ring-scope-deep",
      )}
    >
      <span className="text-base font-bold">
        {measure === "count" ? format.number(cell.count) : t("hours", { n: format.number(cell.hours) })}
      </span>
      {percent !== null ? <span className="text-[0.6875rem] font-semibold">{format.percent(percent)}</span> : null}
    </button>
  );
}

function Legend() {
  const t = useTranslations("Workload.legend");
  const items: { key: "low" | "mid" | "high" | "over"; tier: LoadTier }[] = [
    { key: "low", tier: "low" },
    { key: "mid", tier: "mid" },
    { key: "high", tier: "high" },
    { key: "over", tier: "over" },
  ];
  return (
    <ul aria-label={t("label")} className="flex flex-wrap items-center gap-3 text-xs font-medium text-fg-secondary">
      {items.map((item) => (
        <li key={item.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("size-3 rounded-[4px]", TIER_CLASS[item.tier])} />
          {t(item.key)}
        </li>
      ))}
    </ul>
  );
}

function MemberPeriodCard({
  row,
  period,
  label,
  unit,
  measure,
  cell,
}: {
  row: WorkloadRow;
  period: WorkloadPeriod;
  label: string;
  unit: WorkloadPeriodUnit;
  measure: WorkloadMeasure;
  cell: WorkloadCell;
}) {
  const t = useTranslations("Workload");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { project, capabilities } = useProject();
  const workflow = useProjectWorkflow(project.id);
  const openSheet = useOpenProjectSheet();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const headingId = useId();
  const reasonId = useId();
  const capacity = periodCapacity(row.capacity, period);
  const shownCapacity = capacity !== null ? Math.round(capacity) : null;
  const over = measure === "hours" && loadTier(cell.hours, capacity) === "over";
  // Estimates list the estimated tasks; Task count lists every open assigned task.
  const tasks = measure === "count" ? cell.tasks : cell.tasks.filter((task) => task.hours !== null);
  const picked = tasks.find((task) => task.taskId === params.get("pick")) ?? tasks[0];
  const hoursText = (hours: number | null) =>
    hours === null ? t("detail.noEstimate") : t("hours", { n: format.number(hours) });
  const pick = (taskId: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("pick", taskId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const body = (
    <>
      <div className="flex flex-col gap-1">
        {over ? <p className="text-xs font-bold tracking-[0.08em] text-danger-text uppercase">{t("over")}</p> : null}
        <h2 id={headingId} className="type-title text-fg">
          <bdi>{t("detail.title", { name: row.person.name, date: label })}</bdi>
        </h2>
        <p className="text-xs font-medium text-fg-secondary">
          {measure === "count"
            ? t("detail.summaryCount", { n: cell.count })
            : shownCapacity !== null
              ? t("detail.summary", { hours: format.number(cell.hours), capacity: format.number(shownCapacity) })
              : t("detail.summaryNoCapacity", { hours: format.number(cell.hours) })}
        </p>
        {measure === "hours" && capacity && shownCapacity !== null ? (
          <Progress
            value={(cell.hours / capacity) * 100}
            label={t("detail.summary", { hours: format.number(cell.hours), capacity: format.number(shownCapacity) })}
            size="sm"
            indicatorClassName={over ? "bg-danger" : undefined}
          />
        ) : null}
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("detail.empty", { measure, unit })}</p>
      ) : (
        <ul aria-label={t("detail.tasks", { unit })} className="flex flex-col gap-1.5">
          {tasks.map((task) => {
            const status = workflow.data?.statuses.find((candidate) => candidate.id === task.statusId);
            const content = (
              <>
                <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{task.title}</bdi>
                {status ? <WorkflowStatusChip status={status} /> : null}
                <span
                  className={cn(
                    "text-end text-xs font-semibold",
                    task.hours === null ? "text-fg-secondary" : "w-10 text-fg",
                  )}
                >
                  {hoursText(task.hours)}
                </span>
              </>
            );
            return (
              <li key={task.taskId}>
                {capabilities.manageAssignments ? (
                  <button
                    type="button"
                    aria-pressed={picked?.taskId === task.taskId}
                    aria-label={`${task.title} · ${statusLabel(status)} · ${hoursText(task.hours)}`}
                    onClick={() => pick(task.taskId)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-row bg-subtle px-3 py-2.5 text-start focus-visible:focus-ring",
                      picked?.taskId === task.taskId && "inset-ring-[1.5px] inset-ring-scope-deep",
                    )}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-row bg-subtle px-3 py-2.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs font-medium text-fg-secondary">
        <bdi>{t("detail.privacy", { name: row.person.name.split(" ")[0] ?? row.person.name })}</bdi>
      </p>
    </>
  );

  // The notch is never empty: without the reassign right this is a product card.
  if (!capabilities.manageAssignments) {
    return (
      <section aria-labelledby={headingId} className="flex h-fit flex-col gap-4 rounded-[28px] bg-surface p-5">
        {body}
      </section>
    );
  }
  return (
    <SignatureCard
      as="section"
      aria-labelledby={headingId}
      className="h-fit"
      action={
        <SignatureCardAction
          icon={UsersRound}
          label={t("reassign")}
          aria-disabled={!picked || undefined}
          aria-describedby={!picked ? reasonId : undefined}
          className={cn(!picked && "opacity-60")}
          onClick={() => picked && openSheet("assignment-reassign", { task: picked.taskId })}
        />
      }
      contentClassName="flex flex-col gap-4"
    >
      {body}
      {!picked ? (
        <p id={reasonId} className="sr-only">
          {t("detail.noTask")}
        </p>
      ) : null}
    </SignatureCard>
  );
}

function PhoneList({ grid, label: listLabel }: { grid: WorkloadGrid; label: string }) {
  const t = useTranslations("Workload");
  const format = useProjectFormat();
  return (
    <ul aria-label={listLabel} className="flex flex-col gap-3">
      {grid.rows.map((row) => (
        <li key={row.person.id} className="flex flex-col gap-2 rounded-[24px] bg-surface p-4">
          <span className="flex items-center gap-2">
            <Avatar name={row.person.name} initials={row.person.initials} size={32} decorative className="size-7 text-[0.625rem]" />
            <bdi className="text-sm font-bold text-fg">{row.person.name}</bdi>
          </span>
          {[0, 1].map((index) => {
            const cell = row.cells[index];
            if (!cell) return null;
            const over = loadTier(cell.hours, row.capacity) === "over";
            const label = index === 0 ? t("thisWeek") : t("nextWeek");
            const value = row.capacity
              ? `${format.number(cell.hours)}/${t("hours", { n: format.number(row.capacity) })}`
              : t("hours", { n: format.number(cell.hours) });
            return (
              <div key={index} className="flex flex-col gap-1">
                <span className="flex justify-between text-xs font-medium text-fg-secondary">
                  <span>{label}</span>
                  <span className={cn("font-bold", over ? "text-danger-text" : "text-fg")}>{value}</span>
                </span>
                <Progress
                  value={row.capacity ? (cell.hours / row.capacity) * 100 : 0}
                  label={`${row.person.name} · ${label}: ${value}`}
                  size="sm"
                  indicatorClassName={over ? "bg-danger" : undefined}
                />
              </div>
            );
          })}
        </li>
      ))}
    </ul>
  );
}
