"use client";

import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Flag, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { ComingSoonBadge } from "@/components/navigation/coming-soon-badge";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import type { BusySlot, ProjectCalendarItem, ProjectWorkflow } from "@/data/project-domain";
import { useMyBusy, useProjectCalendar, useProjectWorkflow } from "@/data/project-queries";
import { CalendarProvider, useCalendar } from "@/features/calendar/calendar-context";
import type { CalendarView } from "@/features/calendar/domain/calendar-params";
import { moveInGrid } from "@/features/calendar/domain/month-cells";
import { monthGridOf, rangeDays } from "@/features/calendar/domain/navigation";
import { useCalendarFormat } from "@/features/calendar/use-calendar-format";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { PreferencesOverride, usePreferences } from "@/features/preferences/use-preferences";
import type { CalendarSystem } from "@/lib/dates/format";
import { localDateToDay } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { daysBetween } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { useReschedule } from "../schedule/use-reschedule";
import { useMediaQuery } from "../use-media";
import { useWorkflowStatusLabel } from "../workflow-status-chip";
import { CalendarMeetings } from "@/features/messages/meetings/calendar-meetings";

/*
 * PJ-07 · Project calendar (/projects/[id]/calendar). Reuses the Personal
 * Calendar's URL state (CalendarProvider: ?date / ?view / ?cal), its month
 * grid, keyboard grid moves and formatting, with the project as one blue
 * scope layer: task due dates, milestones and project events (source chips
 * filter them). "My personal busy" is off by default and overlays only the
 * current user's own busy blocks as untitled hatched slots. Dragging a task
 * chip to another day changes its due date when the role can edit it; a
 * task with dependents opens the SchedulePreviewDialog (Members: "Move only
 * this task" only). Views Week · Month · Agenda, Shamsi / Gregorian; phones
 * default to Agenda. No other projects, no other people's calendars.
 */

type Source = "tasks" | "milestones" | "events";
const SOURCES: readonly Source[] = ["tasks", "milestones", "events"];
const VIEWS = ["week", "month", "agenda"] as const;
type ProjectView = (typeof VIEWS)[number];

const sourceOf = (item: ProjectCalendarItem): Source =>
  item.kind === "task" ? "tasks" : item.kind === "milestone" ? "milestones" : "events";

export function ProjectCalendarScreen() {
  return (
    <CalendarProvider>
      <CalendarSystemOverride>
        <ProjectCalendarLayout />
      </CalendarSystemOverride>
    </CalendarProvider>
  );
}

/** The calendar system from the URL (?cal) for the whole screen (shared with TM-03). */
export function CalendarSystemOverride({ children }: { children: ReactNode }) {
  const { calendar } = useCalendar();
  const patch = useMemo(() => ({ calendar }), [calendar]);
  return <PreferencesOverride patch={patch}>{children}</PreferencesOverride>;
}

function ProjectCalendarLayout() {
  const t = useTranslations("ProjectCalendar");
  const tCal = useTranslations("Calendar");
  const format = useCalendarFormat();
  const { project, capabilities, demo } = useProject();
  const params = useSearchParams();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const cal = useCalendar();
  const { week } = usePlannerSettings();
  const defaulted = useRef(false);
  const [shown, setShown] = useState<ReadonlySet<Source>>(new Set(SOURCES));
  const [busyOn, setBusyOn] = useState(false);
  const workflow = useProjectWorkflow(project.id);
  const { shiftBy, dialog } = useReschedule(project.id, capabilities.editAnyTask);

  // Project default: Month on desktop, Agenda on phones (PJM03), unless the URL names a view.
  useEffect(() => {
    if (defaulted.current) return;
    defaulted.current = true;
    if (!params.get("view")) cal.setView(phone ? "agenda" : "month");
  }, [params, phone, cal]);

  const view: ProjectView = cal.view === "day" ? "week" : cal.view;
  const days = useMemo(() => rangeDays(view, cal.anchor, cal.calendar, week), [view, cal.anchor, cal.calendar, week]);
  const from = days[0]!;
  const to = days.at(-1)!;
  const items = useProjectCalendar(project.id, from, to, demoAccessOptions(demo));
  const busy = useMyBusy(from, to, busyOn);

  const counts = useMemo(() => {
    const result: Record<Source, number> = { tasks: 0, milestones: 0, events: 0 };
    for (const item of items.data ?? []) result[sourceOf(item)] += 1;
    return result;
  }, [items.data]);
  const byDay = useMemo(() => {
    const map = new Map<string, ProjectCalendarItem[]>();
    for (const item of items.data ?? []) {
      if (!shown.has(sourceOf(item))) continue;
      map.set(item.day, [...(map.get(item.day) ?? []), item]);
    }
    return map;
  }, [items.data, shown]);
  const busyByDay = useMemo(() => {
    const map = new Map<string, BusySlot[]>();
    if (busyOn) for (const slot of busy.data ?? []) map.set(slot.day, [...(map.get(slot.day) ?? []), slot]);
    return map;
  }, [busy.data, busyOn]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const item = (items.data ?? []).find((candidate) => candidate.id === active.id);
    const day = (over?.data.current as { day?: string } | undefined)?.day;
    if (!item || item.kind !== "task" || !day || day === item.day) return;
    // The task keeps its duration: the schedule moves start and end together.
    void shiftBy(item.task.id, daysBetween(item.day, day), item.title);
  };

  const header = (
    <ProjectPageHeader
      module="calendar"
      title={t("title")}
      actions={
        <>
          <Segmented<ProjectView>
            label={tCal("toolbar.view")}
            value={view}
            onValueChange={(next) => cal.setView(next as CalendarView)}
            options={VIEWS.map((value) => ({ value, label: tCal(`toolbar.${value}`) }))}
          />
          <Segmented<CalendarSystem>
            label={tCal("toolbar.system")}
            variant="neutral"
            value={cal.calendar}
            onValueChange={cal.setCalendar}
            options={[
              { value: "jalali", label: tCal("toolbar.shamsi") },
              { value: "gregorian", label: tCal("toolbar.gregorian") },
            ]}
          />
        </>
      }
    />
  );

  if (!items.data || !workflow.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const title =
    view === "month" ? format.date(cal.anchor, "monthYear") : format.range(from, to);

  return (
    <>
      {header}
      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)] lg:items-start">
          <section aria-labelledby="pcal-title" className="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <IconButton icon={ChevronLeft} mirror label={tCal("toolbar.previous")} variant="ghost" onClick={() => cal.shift(-1)} />
                <h2 id="pcal-title" className="text-[1.1875rem] font-semibold [&:lang(fa)]:font-bold">
                  {title}
                </h2>
                <IconButton icon={ChevronRight} mirror label={tCal("toolbar.next")} variant="ghost" onClick={() => cal.shift(1)} />
                <Button variant="ghost" size="sm" onClick={cal.goToToday} aria-pressed={cal.anchor === cal.today}>
                  {tCal("toolbar.today")}
                </Button>
              </div>
              <div role="group" aria-label={t("layers.label")} className="flex flex-wrap items-center gap-1.5">
                {SOURCES.map((source) => (
                  <ToggleChip
                    key={source}
                    scope="project"
                    size="md"
                    selected={shown.has(source)}
                    onSelectedChange={() => {
                      const next = new Set(shown);
                      if (next.has(source)) next.delete(source);
                      else next.add(source);
                      setShown(next);
                    }}
                  >
                    {t(`layers.${source}`)} <span className="tabular font-bold opacity-70">{format.number(counts[source])}</span>
                  </ToggleChip>
                ))}
                <ToggleChip size="md" selected={busyOn} onSelectedChange={() => setBusyOn(!busyOn)}>
                  {t(busyOn ? "layers.busyOn" : "layers.busyOff")}
                </ToggleChip>
              </div>
            </div>
            {view === "month" ? (
              <MonthGrid byDay={byDay} busyByDay={busyByDay} workflow={workflow.data} projectId={project.id} />
            ) : view === "week" ? (
              <WeekGrid days={days} byDay={byDay} busyByDay={busyByDay} workflow={workflow.data} projectId={project.id} />
            ) : (
              <Agenda days={days} byDay={byDay} busyByDay={busyByDay} workflow={workflow.data} projectId={project.id} />
            )}
          </section>
          <DayPanel byDay={byDay} workflow={workflow.data} projectId={project.id} canCreate={capabilities.createMilestone} />
        </div>
      </DndContext>
      {dialog}
      <CalendarMeetings source={{ kind: "project", workspaceId: project.id, name: project.name }} days={days} />
    </>
  );
}

interface GridProps {
  byDay: ReadonlyMap<string, readonly ProjectCalendarItem[]>;
  busyByDay: ReadonlyMap<string, readonly BusySlot[]>;
  workflow: ProjectWorkflow;
  projectId: string;
}

function MonthGrid({ byDay, busyByDay, workflow, projectId }: GridProps) {
  const tMonth = useTranslations("Calendar.month");
  const format = useCalendarFormat();
  const { direction } = usePreferences();
  const { anchor, calendar, today, setAnchor, shift } = useCalendar();
  const { week } = usePlannerSettings();
  const grid = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const cells = useMemo(() => monthGridOf(anchor, calendar, week), [anchor, calendar, week]);
  const flat = cells.flat().map((cell) => ({ ...cell, day: localDateToDay(cell.date) }));
  const pendingFocus = useRef(false);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-day="${anchor}"]`)?.focus();
  }, [anchor]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      pendingFocus.current = true;
      shift(event.key === "PageUp" ? -1 : 1);
      return;
    }
    const index = flat.findIndex((cell) => cell.day === anchor);
    const next = moveInGrid(index, event.key, flat.length, direction === "rtl");
    if (next === null || next === index) return;
    event.preventDefault();
    pendingFocus.current = true;
    setAnchor(flat[next]!.day);
  };

  return (
    <div ref={grid} role="grid" aria-describedby={hintId} onKeyDown={onKeyDown} className="flex flex-col gap-1.5">
      <p id={hintId} className="sr-only">
        {tMonth("hint")}
      </p>
      <div role="row" className="grid grid-cols-7 gap-1.5">
        {cells[0]!.map((cell) => (
          <div
            key={cell.date.toISOString()}
            role="columnheader"
            className={cn("px-2 text-xs font-semibold", cell.isWeekend ? "text-weekend-text" : "text-fg-muted")}
          >
            {format.date(localDateToDay(cell.date), "weekdayShort")}
          </div>
        ))}
      </div>
      {cells.map((row) => (
        <div key={row[0]!.date.toISOString()} role="row" className="grid grid-cols-7 gap-1.5">
          {row.map((cell) => {
            const day = localDateToDay(cell.date);
            if (!cell.inMonth)
              return <div key={day} role="gridcell" aria-disabled className="min-h-14 rounded-[16px] bg-raised/40 sm:min-h-24" />;
            const items = byDay.get(day) ?? [];
            return (
              <DayCell
                key={day}
                day={day}
                selected={day === anchor}
                today={day === today}
                weekend={cell.isWeekend}
                onSelect={() => setAnchor(day)}
                label={tMonth("cellLabel", {
                  date: format.kicker(day),
                  count: tMonth("events", { count: items.length, formatted: format.number(items.length) }),
                })}
              >
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-sm font-bold tabular",
                    day === today ? "bg-scope-deep text-on-accent" : cell.isWeekend && "text-weekend-text",
                  )}
                >
                  {format.date(day, "day")}
                </span>
                <div className="flex min-w-0 flex-col gap-1 max-sm:hidden">
                  {(busyByDay.get(day) ?? []).map((slot) => (
                    <BusyChip key={`${slot.start}-${slot.end}`} slot={slot} />
                  ))}
                  {items.map((item) => (
                    <ItemChip key={item.id} item={item} workflow={workflow} projectId={projectId} />
                  ))}
                </div>
                {items.length ? (
                  <div aria-hidden className="flex gap-0.5 sm:hidden">
                    {items.slice(0, 3).map((item) => (
                      <span key={item.id} className="size-1.5 rounded-full bg-scope-dot" />
                    ))}
                  </div>
                ) : null}
              </DayCell>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DayCell({
  day,
  selected,
  today,
  weekend,
  onSelect,
  label,
  children,
  className,
}: {
  day: string;
  selected: boolean;
  today: boolean;
  weekend: boolean;
  onSelect: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { day } });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      data-day={day}
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-current={today ? "date" : undefined}
      aria-label={label}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex min-h-14 min-w-0 cursor-pointer flex-col gap-1 rounded-[16px] p-1.5 inset-ring inset-ring-hairline sm:min-h-24 sm:p-2",
        weekend ? "bg-scope-soft/30" : "bg-surface hover:bg-raised",
        selected && "inset-ring-2 inset-ring-scope-deep",
        isOver && "bg-scope-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Untitled own-busy slot (shared with TM-03). */
export function BusyChip({ slot }: { slot: BusySlot }) {
  const t = useTranslations("ProjectCalendar");
  return (
    <span
      data-busy
      className="flex min-h-5 items-center rounded-md bg-[repeating-linear-gradient(135deg,var(--color-hairline)_0_6px,transparent_6px_12px)] px-1.5 text-[11px] font-semibold text-fg-muted inset-ring inset-ring-outline"
    >
      <span className="sr-only">{t("busy")} </span>
      <bdi dir="ltr">
        {slot.start}–{slot.end}
      </bdi>
    </span>
  );
}

function ItemChip({ item, workflow, projectId }: { item: ProjectCalendarItem; workflow: ProjectWorkflow; projectId: string }) {
  const t = useTranslations("ProjectCalendar");
  const { today } = useCalendar();
  const draggable = item.kind === "task" && item.task.can?.edit === true;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !draggable,
  });
  const status = item.kind === "task" ? workflow.statuses.find((candidate) => candidate.id === item.task.statusId) : undefined;
  const overdue = item.kind === "task" && item.day < today;
  const base = "flex min-h-5 min-w-0 items-center gap-1 truncate rounded-md px-1.5 text-[11px] font-semibold";
  if (item.kind === "milestone")
    return (
      <span className={cn(base, "bg-scope-soft text-scope-deep")}>
        <Icon icon={Flag} size={11} />
        <bdi className="truncate">{item.title}</bdi>
      </span>
    );
  if (item.kind === "event")
    return (
      <span className={cn(base, "bg-surface text-scope-deep inset-ring inset-ring-scope-deep/40")}>
        <bdi className="truncate">{item.title}</bdi>
        <bdi dir="ltr" className="shrink-0">
          {item.time}
        </bdi>
      </span>
    );
  return (
    <span
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      aria-label={draggable ? t("move", { title: item.title }) : undefined}
      data-task-chip={item.task.id}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        base,
        "bg-surface inset-ring inset-ring-outline",
        overdue || status?.category === "blocked" ? "text-danger-text inset-ring-danger/50" : "text-scope-deep",
        draggable && "cursor-grab touch-manipulation focus-visible:focus-ring",
        isDragging && "relative z-20 shadow-elevated",
      )}
    >
      <Link
        href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(item.task.id)}`}
        onClick={(event) => event.stopPropagation()}
        className="truncate hover:underline"
        tabIndex={draggable ? -1 : undefined}
      >
        <bdi>{overdue ? t("overdue", { title: item.title }) : item.title}</bdi>
      </Link>
    </span>
  );
}

function WeekGrid({ days, byDay, busyByDay, workflow, projectId }: GridProps & { days: readonly string[] }) {
  const format = useCalendarFormat();
  const tMonth = useTranslations("Calendar.month");
  const { anchor, today, setAnchor } = useCalendar();
  return (
    <div role="grid" className="grid grid-cols-1 gap-1.5 sm:grid-cols-7">
      <div role="row" className="contents">
        {days.map((day) => {
          const items = byDay.get(day) ?? [];
          const weekend = new Date(`${day}T00:00:00Z`).getUTCDay() === 5;
          return (
            <DayCell
              key={day}
              day={day}
              selected={day === anchor}
              today={day === today}
              weekend={weekend}
              onSelect={() => setAnchor(day)}
              label={tMonth("cellLabel", {
                date: format.kicker(day),
                count: tMonth("events", { count: items.length, formatted: format.number(items.length) }),
              })}
              className="sm:min-h-64"
            >
              <span className={cn("text-xs font-semibold", weekend ? "text-weekend-text" : "text-fg-muted")}>
                {format.date(day, "weekdayShort")} {format.date(day, "day")}
              </span>
              {(busyByDay.get(day) ?? []).map((slot) => (
                <BusyChip key={`${slot.start}-${slot.end}`} slot={slot} />
              ))}
              {items.map((item) => (
                <ItemChip key={item.id} item={item} workflow={workflow} projectId={projectId} />
              ))}
            </DayCell>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ days, byDay, busyByDay, workflow, projectId }: GridProps & { days: readonly string[] }) {
  const format = useCalendarFormat();
  const tMonth = useTranslations("Calendar.month");
  const filled = days.filter((day) => (byDay.get(day)?.length ?? 0) + (busyByDay.get(day)?.length ?? 0) > 0);
  if (!filled.length) return <p className="text-sm font-semibold text-fg-muted">{tMonth("dayEmpty")}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {filled.map((day) => (
        <li key={day} className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold text-fg">{format.kicker(day)}</h3>
          <ul className="flex flex-col gap-1.5">
            {(busyByDay.get(day) ?? []).map((slot) => (
              <li key={`${slot.start}-${slot.end}`}>
                <BusyChip slot={slot} />
              </li>
            ))}
            {(byDay.get(day) ?? []).map((item) => (
              <li key={item.id}>
                <ItemRow item={item} workflow={workflow} projectId={projectId} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function ItemRow({ item, workflow, projectId }: { item: ProjectCalendarItem; workflow: ProjectWorkflow; projectId: string }) {
  const t = useTranslations("ProjectCalendar");
  const statusLabel = useWorkflowStatusLabel();
  const format = useCalendarFormat();
  const { today } = useCalendar();
  let when: string;
  let meta: string;
  let title = item.title;
  let accent = "bg-scope-deep";
  if (item.kind === "event") {
    when = item.time;
    meta = t("event", { n: format.number(item.invited) });
  } else if (item.kind === "milestone") {
    when = format.date(item.day, "dayMonth");
    meta = t("milestone");
  } else {
    when = format.date(item.day, "dayMonth");
    const status = workflow.statuses.find((candidate) => candidate.id === item.task.statusId);
    const holder = item.task.assignees.find((assignee) => assignee.state !== "declined");
    meta = holder
      ? t("task", { name: holder.person.name, status: statusLabel(status) })
      : t("taskUnassigned", { status: statusLabel(status) });
    if (item.day < today) {
      title = t("overdue", { title: item.title });
      accent = "bg-danger";
    }
  }
  const body = (
    <>
      <span className="w-12 shrink-0 text-xs font-bold text-fg">
        <bdi dir={item.kind === "event" ? "ltr" : "auto"}>{when}</bdi>
      </span>
      <span aria-hidden className={cn("w-1 self-stretch rounded-pill", accent)} />
      <span className="flex min-w-0 flex-col">
        <bdi className="truncate text-sm font-bold text-fg">{title}</bdi>
        <bdi className="truncate text-xs font-medium text-fg-secondary">{meta}</bdi>
      </span>
    </>
  );
  const className = "flex items-center gap-3 rounded-[16px] bg-subtle px-3 py-2.5";
  return item.kind === "task" ? (
    <Link href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(item.task.id)}`} className={cn(className, "hover:bg-raised")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function DayPanel({
  byDay,
  workflow,
  projectId,
  canCreate,
}: {
  byDay: ReadonlyMap<string, readonly ProjectCalendarItem[]>;
  workflow: ProjectWorkflow;
  projectId: string;
  canCreate: boolean;
}) {
  const t = useTranslations("ProjectCalendar");
  const tMonth = useTranslations("Calendar.month");
  const format = useCalendarFormat();
  const { anchor, today } = useCalendar();
  const items = byDay.get(anchor) ?? [];
  const label = format.date(anchor, "dayMonth");
  return (
    <section aria-labelledby="pcal-day" className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
      <h2 id="pcal-day" className="text-[1.1875rem] font-semibold [&:lang(fa)]:font-bold">
        {anchor === today ? t("today", { date: label }) : label}
      </h2>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} workflow={workflow} projectId={projectId} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-fg-muted">{tMonth("dayEmpty")}</p>
      )}
      <p className="text-xs font-medium text-fg-secondary">{t("privacy")}</p>
      {canCreate ? (
        <Button aria-disabled className="gap-2 self-start opacity-70">
          <Icon icon={Plus} size={16} />
          {t("newEvent")}
          <ComingSoonBadge />
        </Button>
      ) : null}
    </section>
  );
}
