"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Direction } from "radix-ui";
import { useMemo, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Segmented } from "@/components/ui/segmented";
import { getPlannerToday } from "@/data/clock";
import type { MilestoneRow, MilestoneStatus, ProjectTask, ProjectWorkflow, ScheduleItem } from "@/data/project-domain";
import {
  useAssigneeOverlaps,
  useMilestoneRows,
  useProjectMembers,
  useProjectPhases,
  useProjectTasks,
  useProjectWorkflow,
  useScheduleGraph,
} from "@/data/project-queries";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatDate } from "@/lib/dates/format";
import { dayToLocalDate } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { BAR_CLASS, draggedSpan, useBarDrag, type BarEdge } from "../schedule/bar-drag";
import { makeScale, packRows, type Zoom } from "../schedule/time-scale";
import { useReschedule } from "../schedule/use-reschedule";
import { useWorkflowStatusLabel, WorkflowStatusChip } from "../workflow-status-chip";

/*
 * PJ-04 · Timeline (/projects/[id]/timeline): a readable time view (no
 * dependency editing; that is Gantt). Lanes by phase (default; done phases
 * collapse to one phase bar) or by assignee, bars coloured by status
 * (blocked = rose outline, min width 84px), milestone diamonds on the axis,
 * the now line with the volt dot (the only volt), zoom Weeks · Months ·
 * Quarter. Assignee lanes show amber "n overlaps for …" chips that highlight
 * the bars. Click a bar → task drawer; drag its ends → new dates through
 * useReschedule (preview when anything depends on it; Members: only this
 * task). Plain HTML/SVG, RTL by coordinates. Phones: grouped list (PJM03).
 */

const MIN_BAR = 84;
const ROW_H = 30;
const LANE_PAD = 8;
const HEAD_W = 120;

type LaneMode = "phase" | "assignee";
type TimelineZoom = Extract<Zoom, "weeks" | "months" | "quarter">;

const DIAMOND: Record<MilestoneStatus, string> = {
  reached: "bg-success-text",
  next: "bg-scope-deep",
  risk: "bg-danger",
  planned: "bg-fg-secondary",
};

interface Bar {
  task: ProjectTask;
  start: string;
  end: string;
}

interface Lane {
  id: string;
  label: string;
  rows: Bar[][];
  /** Done phase: one phase bar instead of tasks. */
  phaseSpan?: { start: string; end: string; name: string };
}

export function TimelineScreen() {
  const t = useTranslations("Timeline");
  const tTasks = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { calendar, locale, digits } = usePreferences();
  const rtl = Direction.useDirection() === "rtl";
  const { project, capabilities, demo } = useProject();
  const [zoom, setZoom] = useState<TimelineZoom>("months");
  const [mode, setMode] = useState<LaneMode>("phase");
  const [highlight, setHighlight] = useState<string | null>(null);
  const graph = useScheduleGraph(project.id);
  const list = useProjectTasks(project.id, { view: "all" }, demoAccessOptions(demo));
  const phases = useProjectPhases(project.id);
  const milestones = useMilestoneRows(project.id);
  const members = useProjectMembers(project.id);
  const workflow = useProjectWorkflow(project.id);
  const overlaps = useAssigneeOverlaps(project.id, mode === "assignee");
  const { request, dialog } = useReschedule(project.id, capabilities.editAnyTask);
  const today = getPlannerToday();

  const bars = useMemo(() => {
    const spans = new Map<string, ScheduleItem>((graph.data?.items ?? []).map((item) => [item.id, item]));
    return (list.data?.tasks ?? []).flatMap((task) => {
      const span = spans.get(task.id);
      return span ? [{ task, start: span.start, end: span.end }] : [];
    });
  }, [graph.data, list.data]);

  const range = useMemo(() => {
    const days = [
      ...(phases.data ?? []).flatMap((phase) => [phase.start, phase.end]),
      ...bars.flatMap((bar) => [bar.start, bar.end]),
      today,
    ].sort();
    return { from: days[0] ?? today, to: days.at(-1) ?? today };
  }, [phases.data, bars, today]);
  const scale = useMemo(() => makeScale(range.from, range.to, zoom, rtl), [range, zoom, rtl]);

  const commit = (id: string, edge: BarEdge, days: number) => {
    const bar = bars.find((candidate) => candidate.task.id === id);
    if (!bar) return;
    void request({ itemId: id, ...draggedSpan(bar.start, bar.end, edge, days) }, bar.task.title);
  };
  const { drag, handleProps } = useBarDrag(scale, commit);

  const header = (
    <ProjectPageHeader
      module="timeline"
      title={t("title")}
      actions={
        <>
          <Segmented<TimelineZoom>
            label={t("zoom.label")}
            value={zoom}
            onValueChange={setZoom}
            options={(["weeks", "months", "quarter"] as const).map((value) => ({ value, label: t(`zoom.${value}`) }))}
            className="max-sm:hidden"
          />
          <Segmented<LaneMode>
            label={t("lanes.label")}
            variant="accent"
            value={mode}
            onValueChange={(value) => {
              setMode(value);
              setHighlight(null);
            }}
            options={(["phase", "assignee"] as const).map((value) => ({ value, label: t(`lanes.${value}`) }))}
            className="max-sm:hidden"
          />
        </>
      }
    />
  );

  // Live: milestone rows (server status) are not served; the timeline then shows no diamonds.
  if (!graph.data || !list.data || !phases.data || (!milestones.data && !milestones.isError) || !workflow.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const wf = workflow.data;
  const lanes: Lane[] =
    mode === "phase"
      ? phases.data.map((phase) => {
          const inPhase = bars.filter((bar) => bar.task.phaseId === phase.id);
          return phase.done
            ? { id: phase.id, label: phase.name, rows: [], phaseSpan: { start: phase.start, end: phase.end, name: phase.name } }
            : { id: phase.id, label: phase.name, rows: packRows(inPhase) };
        })
      : [
          ...(members.data ?? []).map((person) => ({
            id: person.id,
            label: person.name,
            rows: packRows(
              bars.filter((bar) => bar.task.assignees.some((a) => a.state !== "declined" && a.person.id === person.id)),
            ),
          })),
          {
            id: "nobody",
            label: tTasks("group.nobody"),
            rows: packRows(bars.filter((bar) => !bar.task.assignees.some((a) => a.state !== "declined"))),
          },
        ].filter((lane) => lane.rows.length > 0);
  const highlighted = new Set(
    highlight ? (overlaps.data?.find((entry) => entry.person.id === highlight)?.taskIds ?? []) : [],
  );
  const tickLabel = (day: string, kind: "month" | "week" | "day") =>
    formatDate(dayToLocalDate(day), kind === "month" ? "monthYear" : "dayMonth", { calendar, locale, digits });
  const statusOf = (task: ProjectTask) => wf.statuses.find((status) => status.id === task.statusId);
  const nowX = scale.center(today);
  const showNow = today >= range.from && today <= range.to;

  return (
    <>
      {header}
      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}

      <section
        aria-label={t("chart", { project: project.name })}
        className="flex flex-col gap-3 rounded-[28px] bg-surface p-4 max-sm:hidden"
      >
        <div className="overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `${HEAD_W}px ${scale.width}px` }}>
            {/* Axis: month / week ticks and milestone diamonds. */}
            <div />
            <div className="relative h-12 border-b border-hairline" aria-hidden="true">
              {scale.ticks(calendar).map((tick) => (
                <span
                  key={tick.day}
                  className="absolute top-0 text-xs font-semibold whitespace-nowrap text-fg-muted"
                  style={rtl ? { right: scale.width - tick.x } : { left: tick.x }}
                >
                  {tickLabel(tick.day, tick.kind)}
                </span>
              ))}
              {(milestones.data ?? []).map((row) =>
                row.milestone.due ? <Diamond key={row.milestone.id} row={row} x={scale.center(row.milestone.due)} /> : null,
              )}
              {showNow ? (
                <span
                  className="absolute bottom-0 size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-volt ring-2 ring-scope-deep"
                  style={{ left: nowX }}
                />
              ) : null}
            </div>
            {lanes.map((lane) => {
              const height = Math.max(1, lane.rows.length) * ROW_H + LANE_PAD * 2;
              return (
                <div key={lane.id} className="contents">
                  <div
                    className="flex items-start border-b border-hairline pe-2 text-sm font-bold text-fg"
                    style={{ height, paddingTop: LANE_PAD + 4 }}
                  >
                    <bdi className="truncate">{lane.label}</bdi>
                  </div>
                  <ul className="relative border-b border-hairline" style={{ height }}>
                    {showNow ? (
                      <li aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-scope-deep" style={{ left: nowX }} />
                    ) : null}
                    {lane.phaseSpan ? (
                      <li
                        className="absolute flex items-center truncate rounded-pill bg-scope-soft px-3 text-xs font-bold text-scope-deep"
                        style={{ ...box(scale.span(lane.phaseSpan.start, lane.phaseSpan.end, MIN_BAR)), top: LANE_PAD, height: ROW_H - 6 }}
                      >
                        <bdi className="truncate">{lane.phaseSpan.name}</bdi>
                      </li>
                    ) : null}
                    {lane.rows.flatMap((row, rowIndex) =>
                      row.map((bar) => {
                        const live = drag?.id === bar.task.id ? draggedSpan(bar.start, bar.end, drag.edge, drag.days) : bar;
                        const status = statusOf(bar.task);
                        const editable = bar.task.can?.edit === true;
                        return (
                          <li
                            key={bar.task.id}
                            data-bar={bar.task.id}
                            data-highlight={highlighted.has(bar.task.id) || undefined}
                            className={cn(
                              "group/bar absolute flex items-center rounded-pill text-xs font-bold",
                              BAR_CLASS[status?.category ?? "todo"],
                              highlighted.has(bar.task.id) && "ring-2 ring-warning ring-offset-1 ring-offset-surface",
                            )}
                            style={{ ...box(scale.span(live.start, live.end, MIN_BAR)), top: LANE_PAD + rowIndex * ROW_H, height: ROW_H - 6 }}
                          >
                            {editable ? (
                              <span
                                role="presentation"
                                {...handleProps(bar.task.id, "start")}
                                className="absolute inset-y-0 start-0 w-2 cursor-ew-resize rounded-s-pill opacity-0 group-hover/bar:bg-fg/20 group-hover/bar:opacity-100"
                              />
                            ) : null}
                            <Link
                              href={`/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(bar.task.id)}`}
                              className="min-w-0 flex-1 truncate rounded-pill px-3 focus-visible:focus-ring"
                            >
                              <bdi>{bar.task.title}</bdi>
                              <span className="sr-only"> · {statusLabel(status)}</span>
                            </Link>
                            {editable ? (
                              <span
                                role="presentation"
                                {...handleProps(bar.task.id, "end")}
                                className="absolute inset-y-0 end-0 w-2 cursor-ew-resize rounded-e-pill opacity-0 group-hover/bar:bg-fg/20 group-hover/bar:opacity-100"
                              />
                            ) : null}
                          </li>
                        );
                      }),
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
        <Legend workflow={wf} />
        {mode === "assignee" && overlaps.data?.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {overlaps.data.map((entry) => (
              <button
                key={entry.person.id}
                type="button"
                aria-pressed={highlight === entry.person.id}
                onClick={() => setHighlight(highlight === entry.person.id ? null : entry.person.id)}
                className="rounded-pill bg-warning-soft px-3 py-1 text-xs font-bold text-warning-text focus-visible:focus-ring"
              >
                <bdi>{t("overlaps", { n: entry.pairs, count: format.number(entry.pairs), name: entry.person.name })}</bdi>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <PhoneList bars={bars} workflow={wf} />
      {dialog}
    </>
  );
}

function box({ left, width }: { left: number; width: number }) {
  return { left, width };
}

function Diamond({ row, x }: { row: MilestoneRow; x: number }) {
  return (
    <span
      title={row.milestone.title}
      className={cn("absolute bottom-1 size-3 -translate-x-1/2 rotate-45 rounded-[2px]", DIAMOND[row.status])}
      style={{ left: x }}
    />
  );
}

function Legend({ workflow }: { workflow: ProjectWorkflow }) {
  const t = useTranslations("Timeline.legend");
  const statusLabel = useWorkflowStatusLabel();
  const blocked = workflow.statuses.find((status) => status.category === "blocked");
  const active = workflow.statuses.find((status) => status.category === "active");
  return (
    <ul aria-label={t("label")} className="flex flex-wrap items-center gap-4 text-xs font-semibold text-fg-secondary">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rotate-45 rounded-[2px] bg-scope-deep" />
        {t("milestone")}
      </li>
      {blocked ? (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-5 rounded-pill inset-ring-[1.5px] inset-ring-danger" />
          {statusLabel(blocked)}
        </li>
      ) : null}
      {active ? (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-5 rounded-pill bg-scope-deep" />
          {statusLabel(active)}
        </li>
      ) : null}
    </ul>
  );
}

/** Phones (PJM03): read-only list grouped by phase with date ranges, today banner with the volt dot. */
function PhoneList({ bars, workflow }: { bars: readonly Bar[]; workflow: ProjectWorkflow }) {
  const t = useTranslations("Timeline");
  const format = useProjectFormat();
  const { project } = useProject();
  const phases = useProjectPhases(project.id);
  const today = getPlannerToday();
  const current = phases.data?.find((phase) => phase.start !== null && phase.end !== null && today >= phase.start && today <= phase.end);
  return (
    <div className="flex flex-col gap-3 sm:hidden">
      <p className="flex items-center gap-2 rounded-pill bg-scope-soft px-3 py-2 text-xs font-bold text-scope-deep">
        <span aria-hidden className="size-2.5 rounded-full bg-volt ring-2 ring-scope-deep" />
        {current
          ? t("today", { date: format.day(today), phase: current.name })
          : t("todayNoPhase", { date: format.day(today) })}
      </p>
      {(phases.data ?? []).map((phase) => {
        const inPhase = bars.filter((bar) => bar.task.phaseId === phase.id).sort((a, b) => a.start.localeCompare(b.start));
        if (!inPhase.length) return null;
        return (
          <section key={phase.id} aria-label={phase.name} className="flex flex-col gap-1.5">
            <h2 className="flex justify-between px-1 text-xs font-bold text-fg">
              <bdi>{phase.name}</bdi>
              <span className="font-semibold text-fg-secondary">{format.range(phase.start, phase.end)}</span>
            </h2>
            <ul className="flex flex-col gap-1.5">
              {inPhase.map((bar) => (
                <li key={bar.task.id}>
                  <Link
                    href={`/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(bar.task.id)}`}
                    className="flex items-center gap-2 rounded-[16px] bg-surface px-3 py-2.5"
                  >
                    <WorkflowStatusChip status={workflow.statuses.find((status) => status.id === bar.task.statusId)} />
                    <bdi className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{bar.task.title}</bdi>
                    <span className="shrink-0 text-xs text-fg-secondary">
                      {t("range", { from: format.day(bar.start), to: format.day(bar.end) })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
