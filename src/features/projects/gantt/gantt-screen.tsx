"use client";

import { Link2, Zap } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { getPlannerToday } from "@/data/clock";
import type { ProjectTask, ProjectWorkflow, ScheduleItem, ScheduleLink } from "@/data/project-domain";
import {
  useCriticalPath,
  useProjectTasks,
  useProjectWorkflow,
  useScheduleActions,
  useScheduleGraph,
} from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { usePreferences } from "@/features/preferences/use-preferences";
import { dayToLocalDate } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { daysBetween, useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { BAR_CLASS, draggedSpan, useBarDrag, type BarEdge } from "../schedule/bar-drag";
import { makeScale, type TimeScale, type Zoom } from "../schedule/time-scale";
import { useReschedule } from "../schedule/use-reschedule";
import { isUnavailable } from "@/features/projects/unavailable";
import { DependenciesTable } from "./dependencies-table";

/*
 * PJ-05 · Gantt (/projects/[id]/gantt): sticky task table (Task · Who ·
 * Start · End · Dur.) beside a plain-SVG/HTML chart that scrolls; zoom
 * Days · Weeks · Months; FS/SS/FF/SF arrows with lag/lead; create a
 * dependency by dragging from the dot on a bar end to another bar; Critical
 * path toggle (mock computes locally). Moving or resizing a bar goes through
 * useReschedule: anything that moves others opens the SchedulePreviewDialog
 * (ghost bars, moved list, milestone impact, cascade vs only, one apply with
 * revisions, conflict state). A loop is refused inline. The Dependencies
 * list is the full keyboard alternative. RTL mirrors every bar, arrow and
 * the now line by coordinates; arrows still go from predecessor to
 * successor. Not on phones: the Dependencies list, read-only.
 */

const ROW_H = 34;
const AXIS_H = 30;
const BAR_H = 18;
const TABLE_W = 400;
type GanttZoom = Extract<Zoom, "days" | "weeks" | "months">;

interface Row {
  item: ScheduleItem;
  task: ProjectTask;
}

export function GanttScreen() {
  const t = useTranslations("Gantt");
  const tZoom = useTranslations("Timeline.zoom");
  const { project, capabilities, demo } = useProject();
  const [zoom, setZoom] = useState<GanttZoom>("weeks");
  const [critical, setCritical] = useState(false);
  const [showDeps, setShowDeps] = useState(false);
  const graph = useScheduleGraph(project.id);
  const list = useProjectTasks(project.id, { view: "all" }, demoAccessOptions(demo));
  const workflow = useProjectWorkflow(project.id);
  const path = useCriticalPath(project.id, critical);
  const pathUnavailable = isUnavailable(path.error);
  const tShell = useTranslations("ContextShell");
  const depsRef = useRef<HTMLDivElement>(null);
  const editDeps = capabilities.editAnyTask;

  const header = (
    <ProjectPageHeader
      module="gantt"
      title={t("title")}
      actions={
        <div className="flex flex-wrap items-center gap-2 max-sm:hidden">
          <Segmented<GanttZoom>
            label={tZoom("label")}
            value={zoom}
            onValueChange={setZoom}
            options={(["days", "weeks", "months"] as const).map((value) => ({ value, label: tZoom(value) }))}
          />
          <Button
            variant="secondary"
            aria-pressed={critical && !pathUnavailable}
            disabled={pathUnavailable}
            title={pathUnavailable ? tShell("unavailable") : undefined}
            onClick={() => setCritical(!critical)}
            className="gap-2 bg-surface"
          >
            <Icon icon={Zap} size={16} />
            {t("critical")}
            {pathUnavailable ? <span className="text-xs font-medium text-fg-muted">· {tShell("unavailable")}</span> : null}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={showDeps}
            onClick={() => {
              setShowDeps(!showDeps);
              if (!showDeps) requestAnimationFrame(() => depsRef.current?.scrollIntoView?.({ block: "start" }));
            }}
            className="gap-2 bg-surface"
          >
            <Icon icon={Link2} size={16} />
            {t("depsToggle")}
          </Button>
        </div>
      }
    />
  );

  if (!graph.data || !list.data || !workflow.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  return (
    <>
      {header}
      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}
      <div className="max-sm:hidden">
        <GanttChart
          tasks={list.data.tasks}
          graph={graph.data}
          zoom={zoom}
          critical={critical && !pathUnavailable ? new Set(path.data ?? []) : null}
          canLink={editDeps}
          canCascade={capabilities.editAnyTask}
          workflow={workflow.data}
        />
      </div>
      {/* Phones: the Dependencies list, read-only (D18). */}
      <div className="sm:hidden">
        <DependenciesTable projectId={project.id} graph={graph.data} editable={false} />
      </div>
      {showDeps ? (
        <div ref={depsRef} className="max-sm:hidden">
          <DependenciesTable projectId={project.id} graph={graph.data} editable={editDeps} />
        </div>
      ) : null}
    </>
  );
}

interface GanttChartProps {
  tasks: readonly ProjectTask[];
  graph: { items: readonly ScheduleItem[]; links: readonly ScheduleLink[] };
  zoom: GanttZoom;
  critical: ReadonlySet<string> | null;
  canLink: boolean;
  canCascade: boolean;
  workflow: ProjectWorkflow;
}

function GanttChart({ tasks, graph, zoom, critical, canLink, canCascade, workflow }: GanttChartProps) {
  const t = useTranslations("Gantt");
  const format = useProjectFormat();
  const { calendar, locale, digits } = usePreferences();
  const rtl = Direction.useDirection() === "rtl";
  const { project } = useProject();
  const actions = useScheduleActions(project.id);
  const { request, dialog } = useReschedule(project.id, canCascade);
  const markerId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null);
  const [cycle, setCycle] = useState<{ predecessor: string; successor: string } | null>(null);
  const today = getPlannerToday();

  const rows: Row[] = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    return graph.items
      .filter((item) => item.kind === "task" && byId.has(item.id))
      .map((item) => ({ item, task: byId.get(item.id)! }))
      .sort((a, b) => a.item.start.localeCompare(b.item.start) || a.item.end.localeCompare(b.item.end));
  }, [graph.items, tasks]);
  const range = useMemo(() => {
    const days = [...rows.flatMap((row) => [row.item.start, row.item.end]), today].sort();
    return { from: days[0] ?? today, to: days.at(-1) ?? today };
  }, [rows, today]);
  const scale = useMemo(() => makeScale(range.from, range.to, zoom, rtl), [range, zoom, rtl]);
  const rowIndex = new Map(rows.map((row, index) => [row.item.id, index]));

  const commit = (id: string, edge: BarEdge, days: number) => {
    const row = rows.find((candidate) => candidate.item.id === id);
    if (!row) return;
    void request({ itemId: id, ...draggedSpan(row.item.start, row.item.end, edge, days) }, row.task.title);
  };
  const { drag, handleProps } = useBarDrag(scale, commit);

  const point = (event: PointerEvent) => {
    const box = chartRef.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  };
  const linkHandle = (from: string) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setCycle(null);
      setLinking({ from, ...point(event) });
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (linking?.from === from) setLinking({ from, ...point(event) });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (linking?.from !== from) return;
      setLinking(null);
      const target = document
        .elementsFromPoint?.(event.clientX, event.clientY)
        .map((element) => element.closest<HTMLElement>("[data-gantt-bar]"))
        .find((element) => element && element.dataset.ganttBar !== from)?.dataset.ganttBar;
      if (!target) return;
      const title = (id: string) => rows.find((row) => row.item.id === id)?.task.title ?? id;
      actions.addLink.mutate(
        { predecessorId: from, successorId: target, type: "FS", lagDays: 0 },
        {
          onError: (error) => {
            if (error instanceof RepositoryError && error.message === "cycle")
              setCycle({ predecessor: title(from), successor: title(target) });
          },
        },
      );
    },
    onPointerCancel: () => setLinking(null),
  });

  const height = rows.length * ROW_H;
  const nowX = scale.center(today);
  const tickLabel = (day: string, kind: "month" | "week" | "day") =>
    formatDate(dayToLocalDate(day), kind === "month" ? "monthYear" : kind === "week" ? "dayMonth" : "day", {
      calendar,
      locale,
      digits,
    });

  return (
    <section aria-label={t("chart", { project: project.name })} className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
      {cycle ? <InlineAlert tone="danger" title={t("cycleTitle")} description={t("cycleDetail", cycle)} /> : null}
      <div className="overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: `${TABLE_W}px ${scale.width}px` }}>
          {/* Sticky task table. */}
          <div className="sticky start-0 z-10 bg-surface">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-fg-muted" style={{ height: AXIS_H }}>
                  <th scope="col" className="px-2 text-start font-semibold">{t("columns.task")}</th>
                  <th scope="col" className="px-1 text-start font-semibold">{t("columns.who")}</th>
                  <th scope="col" className="px-1 text-start font-semibold">{t("columns.start")}</th>
                  <th scope="col" className="px-1 text-start font-semibold">{t("columns.end")}</th>
                  <th scope="col" className="px-1 text-start font-semibold">{t("columns.duration")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, task }) => {
                  const holder = task.assignees.find((assignee) => assignee.state !== "declined");
                  return (
                    <tr key={item.id} className="border-t border-hairline" style={{ height: ROW_H }}>
                      <th scope="row" className="max-w-36 truncate px-2 text-start font-bold text-fg">
                        <Link
                          href={`/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(task.id)}`}
                          className="hover:underline focus-visible:focus-ring"
                        >
                          <bdi>{task.title}</bdi>
                        </Link>
                      </th>
                      <td className="px-1">
                        {holder ? (
                          <Avatar name={holder.person.name} initials={holder.person.initials} size={32} className="size-6 text-[0.5625rem]" />
                        ) : null}
                      </td>
                      <td className="px-1 font-semibold text-fg">{format.day(item.start)}</td>
                      <td className="px-1 font-semibold text-fg">{format.day(item.end)}</td>
                      <td className="px-1 text-fg-muted">
                        {t("duration", { n: format.number(daysBetween(item.start, item.end) + 1) })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Chart (aria-hidden geometry; the table + Dependencies list carry the data). */}
          <div ref={chartRef} className="relative" style={{ height: AXIS_H + height }}>
            <div aria-hidden className="relative" style={{ height: AXIS_H }}>
              {scale.ticks(calendar).map((tick) => (
                <span
                  key={tick.day}
                  className="absolute top-1 text-xs font-semibold whitespace-nowrap text-fg-muted"
                  style={rtl ? { right: scale.width - tick.x } : { left: tick.x }}
                >
                  {tickLabel(tick.day, tick.kind)}
                </span>
              ))}
            </div>
            <svg
              aria-hidden
              width={scale.width}
              height={height}
              className="pointer-events-none absolute start-0 text-icon-muted"
              style={{ top: AXIS_H }}
            >
              <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              {scale.ticks(calendar).map((tick) => (
                <line key={tick.day} x1={tick.x} x2={tick.x} y1={0} y2={height} className="stroke-hairline" />
              ))}
              {graph.links.map((link) => {
                const a = rowIndex.get(link.predecessorId);
                const b = rowIndex.get(link.successorId);
                if (a === undefined || b === undefined) return null;
                const onPath = critical?.has(link.predecessorId) && critical.has(link.successorId);
                return (
                  <path
                    key={link.id}
                    data-arrow={link.id}
                    d={arrowPath(link, rows[a]!.item, rows[b]!.item, a, b, scale)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={onPath ? 2.25 : 1.25}
                    className={onPath ? "text-scope-deep" : undefined}
                    markerEnd={`url(#${markerId})`}
                  />
                );
              })}
              {linking ? (
                <line
                  x1={anchorX(rows[rowIndex.get(linking.from) ?? 0]!.item, "end", scale)}
                  y1={(rowIndex.get(linking.from) ?? 0) * ROW_H + ROW_H / 2}
                  x2={linking.x}
                  y2={linking.y - AXIS_H}
                  className="stroke-scope-deep"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              ) : null}
            </svg>
            {today >= range.from && today <= range.to ? (
              <>
                <div aria-hidden className="absolute bottom-0 w-0.5 -translate-x-1/2 bg-scope-deep" style={{ left: nowX, top: AXIS_H - 6 }} />
                {/* The now dot (the only volt on the screen). */}
                <span
                  aria-hidden
                  className="absolute size-3 -translate-x-1/2 rounded-full bg-volt ring-2 ring-scope-deep"
                  style={{ left: nowX, top: AXIS_H - 12 }}
                />
              </>
            ) : null}
            {rows.map(({ item, task }, index) => {
              const live = drag?.id === item.id ? draggedSpan(item.start, item.end, drag.edge, drag.days) : item;
              const box = scale.span(live.start, live.end, 12);
              const status = workflow.statuses.find((candidate) => candidate.id === task.statusId)?.category ?? "todo";
              const editable = task.can?.edit === true;
              const onPath = critical?.has(item.id);
              return (
                <div
                  key={item.id}
                  data-gantt-bar={item.id}
                  data-critical={onPath || undefined}
                  className={cn(
                    "group/bar absolute rounded-pill",
                    BAR_CLASS[status],
                    onPath && "ring-2 ring-scope-deep ring-offset-1 ring-offset-surface",
                    editable && "cursor-grab",
                  )}
                  style={{ left: box.left, width: box.width, top: AXIS_H + index * ROW_H + (ROW_H - BAR_H) / 2, height: BAR_H }}
                  {...(editable ? handleProps(item.id, "move") : {})}
                >
                  {editable ? (
                    <span
                      role="presentation"
                      {...handleProps(item.id, "end")}
                      className="absolute inset-y-0 end-0 w-2 cursor-ew-resize rounded-e-pill opacity-0 group-hover/bar:bg-fg/20 group-hover/bar:opacity-100"
                    />
                  ) : null}
                  {canLink ? (
                    <span
                      role="presentation"
                      title={t("linkFrom", { title: task.title })}
                      {...linkHandle(item.id)}
                      className="absolute top-1/2 -end-3 size-2.5 -translate-y-1/2 cursor-crosshair rounded-full bg-surface opacity-0 inset-ring-[1.5px] inset-ring-scope-deep group-hover/bar:opacity-100"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-xs font-medium text-fg-secondary">{t("hint")}</p>
      {dialog}
    </section>
  );
}

/** Screen x of a bar's start or end edge (direction-aware). */
function anchorX(item: ScheduleItem, edge: "start" | "end", scale: TimeScale): number {
  if (edge === "start") return scale.x(item.start);
  return scale.rtl ? scale.x(item.end) - scale.ppd : scale.x(item.end) + scale.ppd;
}

/** Elbow arrow from the predecessor anchor to the successor anchor (FS/SS/FF/SF). */
export function arrowPath(link: ScheduleLink, from: ScheduleItem, to: ScheduleItem, a: number, b: number, scale: TimeScale): string {
  const fromEdge = link.type === "SS" || link.type === "SF" ? "start" : "end";
  const toEdge = link.type === "FF" || link.type === "SF" ? "end" : "start";
  const x1 = anchorX(from, fromEdge, scale);
  const x2 = anchorX(to, toEdge, scale);
  const y1 = a * ROW_H + ROW_H / 2;
  const y2 = b * ROW_H + ROW_H / 2;
  const forward = scale.rtl ? -1 : 1;
  const out = x1 + forward * (fromEdge === "end" ? 8 : -8);
  const into = x2 + forward * (toEdge === "start" ? -8 : 8);
  return `M ${x1} ${y1} H ${out} V ${y2} H ${into} L ${x2} ${y2}`;
}
