"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Task } from "@/data/domain";
import { cn } from "@/lib/cn";
import type { TaskGroup } from "../domain/group";
import { useTasksState } from "../tasks-context";
import { useTasksFormat, useWeekendLabel } from "../ui/use-tasks-format";
import { useList } from "./list-context";
import { TaskRow } from "./task-row";

/*
 * A group of the list: header (collapse chevron, name, count, open duration,
 * "· N done", Overdue "Reschedule all", Unscheduled drag hint, capacity on
 * date groups) and its sortable rows. Rows completed live collapse into the
 * "· N done" counter after the hold; the counter toggles them back.
 */

export const GROUP_DROP_PREFIX = "group:";

/** The rows a group shows now (live-completed rows collapse unless shown again). */
export function visibleRows(group: TaskGroup, phase: (id: string) => string, doneShown: boolean): Task[] {
  return doneShown ? group.tasks : group.tasks.filter((task) => phase(task.id) !== "collapsed");
}

export interface TaskGroupViewProps {
  group: TaskGroup;
  basis: "planned" | "completed";
  draggable: boolean;
  onRescheduleOverdue(group: TaskGroup, anchor: HTMLElement): void;
}

export function TaskGroupView({ group, basis, draggable, onRescheduleOverdue }: TaskGroupViewProps) {
  const t = useTranslations("Tasks.list");
  const tA11y = useTranslations("Tasks.a11y");
  const format = useTasksFormat();
  const weekendLabel = useWeekendLabel();
  const { isGroupCollapsed, toggleGroup } = useTasksState();
  const { actions, isDoneShown, toggleDoneShown } = useList();
  const { setNodeRef } = useDroppable({ id: `${GROUP_DROP_PREFIX}${group.id}`, disabled: !draggable });

  const collapsed = isGroupCollapsed(group.id, group.collapsedByDefault);
  const title = format.groupTitle(group);
  const name = [title.title, title.subtitle].filter(Boolean).join(" · ") + (title.weekend ? ` · ${weekendLabel}` : "");
  const doneShown = isDoneShown(group.id);
  const rows = visibleRows(group, actions.lifecycle.phase, doneShown);
  const hiddenDone = group.tasks.length - rows.length;
  const headingId = `task-group-${group.id}`;

  return (
    <section ref={setNodeRef} aria-labelledby={headingId} data-group={group.id} className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 pt-1 pb-1.5 text-xs font-bold text-fg-muted lg:px-3 lg:pt-3.5">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={collapsed ? undefined : `${headingId}-rows`}
          aria-label={t(collapsed ? "expand" : "collapse", { name })}
          onClick={() => toggleGroup(group.id, group.collapsedByDefault)}
          className="hidden size-6 items-center justify-center rounded-full hover:bg-raised focus-visible:focus-ring lg:inline-flex"
        >
          <ChevronDown
            aria-hidden="true"
            size={14}
            strokeWidth={1.8}
            className={cn("transition-transform motion-reduce:transition-none", collapsed && "-rotate-90 rtl:rotate-90")}
          />
        </button>
        <h2 id={headingId} className="text-xs font-bold text-fg-muted lg:text-[13px] lg:text-fg">
          {title.title}
          {title.subtitle ? <span> · {title.subtitle}</span> : null}
          {title.weekend ? <span> · {weekendLabel}</span> : null}
        </h2>
        <span className="tabular" aria-label={tA11y("groupCount", { count: group.count, n: format.number(group.count) })}>
          {format.number(group.count)}
        </span>
        {group.totalMinutes > 0 && group.kind !== "overdue" ? (
          <span className="tabular max-lg:hidden">· {format.durationShort(group.totalMinutes)}</span>
        ) : null}
        {group.doneCount > 0 ? (
          hiddenDone > 0 || doneShown ? (
            <button
              type="button"
              aria-pressed={doneShown}
              aria-label={doneShown ? t("hideDone") : t("showDone", { count: format.number(group.doneCount) })}
              onClick={() => toggleDoneShown(group.id)}
              className="rounded px-0.5 underline-offset-2 hover:underline focus-visible:focus-ring"
            >
              {t("doneCount", { count: format.number(group.doneCount) })}
            </button>
          ) : (
            <span>{t("doneCount", { count: format.number(group.doneCount) })}</span>
          )
        ) : null}
        {group.kind === "overdue" && group.openCount > 0 && basis === "planned" ? (
          <button
            type="button"
            onClick={(event) => onRescheduleOverdue(group, event.currentTarget)}
            className="inline-flex min-h-[22px] items-center rounded-pill bg-danger-soft px-2.5 text-xs font-bold text-danger-text hover:brightness-95 focus-visible:focus-ring"
          >
            {t("rescheduleAll")}
          </button>
        ) : null}
        {group.kind === "unscheduled" && draggable ? <span className="font-semibold max-lg:hidden">{t("dragHint")}</span> : null}
        {group.weekend && group.day ? (
          <span className="ms-auto font-bold text-weekend-text">{format.weekday(group.day)}</span>
        ) : group.capacityMinutes ? (
          <span className="ms-auto font-semibold tabular max-lg:hidden">
            {t("capacity", { used: format.durationShort(group.totalMinutes), capacity: format.durationShort(group.capacityMinutes) })}
          </span>
        ) : null}
      </div>
      {collapsed ? null : (
        <SortableContext items={rows.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <ul id={`${headingId}-rows`} className="flex flex-col gap-3.5 lg:gap-0">
            {rows.map((task) => (
              <TaskRow key={task.id} task={task} basis={basis} draggable={draggable} gripVisible={group.kind === "unscheduled"} />
            ))}
          </ul>
        </SortableContext>
      )}
    </section>
  );
}
