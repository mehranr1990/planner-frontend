"use client";

import { useSortable } from "@dnd-kit/sortable";
import { GripVertical, Link2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { KeyboardEventHandler, MouseEventHandler, ReactNode, TouchEventHandler } from "react";
import { Icon } from "@/components/ui/icon";
import { getPlannerToday } from "@/data/clock";
import type { ProjectMilestone, ProjectTask } from "@/data/project-domain";
import { priorityStyle } from "@/features/tasks/ui/priority-style";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { AssigneeAvatar } from "../tasks/project-task-row";

/*
 * One PJ-03 board card: a product card, never notched (Personal board-card
 * grammar on a 20px radius). Title (opens the task drawer), optional context
 * line (milestone / blocked / declined), assignees with acceptance badges,
 * due (red when overdue), estimate, priority. The whole card lifts with the
 * mouse (4px) or a 200ms long-press; the grip is the keyboard handle (Space
 * lifts, arrows move, Space/Enter drops, Esc cancels). Cards settle with a
 * shared-layout spring (220ms), instant under reduced motion.
 */

export interface ProjectBoardCardProps {
  task: ProjectTask;
  projectId: string;
  laneId: string;
  milestones: readonly ProjectMilestone[];
  draggable: boolean;
  /** The card being dragged stays in place, dimmed. */
  lifted?: boolean;
}

function useCardParts(task: ProjectTask, milestones: readonly ProjectMilestone[]) {
  const t = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const overdue = task.completedAt === undefined && task.due !== null && task.due < getPlannerToday();
  const declined = task.assignees.find((assignee) => assignee.state === "declined");
  const milestone = milestones.find((candidate) => candidate.id === task.milestoneId);
  let context: ReactNode = null;
  if (declined)
    context = <span className="text-danger-text">{t("assign.declined", { name: declined.person.name })}</span>;
  else if (task.blockedBy.length > 0)
    context = (
      <span className="inline-flex items-center gap-1 text-danger-text">
        <Icon icon={Link2} size={12} />
        {t("dep.blocked", { n: format.number(task.blockedBy.length) })}
      </span>
    );
  else if (milestone) context = <bdi>{t("row.milestone", { title: milestone.title })}</bdi>;
  return { t, format, overdue, context };
}

function CardBody({ task, milestones, title }: { task: ProjectTask; milestones: readonly ProjectMilestone[]; title: ReactNode }) {
  const { t, format, overdue, context } = useCardParts(task, milestones);
  const priority = priorityStyle(task.priority);
  return (
    <>
      {title}
      {context ? <p className="text-xs font-medium text-fg-secondary">{context}</p> : null}
      <div className="flex min-h-7 flex-wrap items-center gap-2 text-xs font-semibold text-fg-secondary">
        {task.assignees.length > 0 ? (
          <span className="flex items-center [&>*+*]:-ms-1.5">
            {task.assignees.map((assignee) => (
              <AssigneeAvatar key={assignee.person.id} assignee={assignee} />
            ))}
          </span>
        ) : (
          <span className="rounded-pill px-2 py-0.5 text-fg-secondary inset-ring inset-ring-outline">
            {t("row.unassigned")}
          </span>
        )}
        {task.due ? (
          <span className={cn("font-bold", overdue ? "text-danger-text" : "text-fg")}>
            {format.day(task.due)}
            {overdue ? <span className="sr-only"> · {t("row.overdue")}</span> : null}
          </span>
        ) : null}
        {task.estimateHours !== null ? (
          <span className="text-fg-muted">{t("row.est", { h: format.number(task.estimateHours) })}</span>
        ) : null}
        <span className={cn("ms-auto inline-flex items-center gap-1.5 font-bold", priority.label)}>
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", priority.dot)} />
          {t(`priority.${task.priority ?? "none"}`)}
        </span>
      </div>
    </>
  );
}

export function ProjectBoardCard({ task, projectId, laneId, milestones, draggable, lifted = false }: ProjectBoardCardProps) {
  const tBoard = useTranslations("Tasks.board");
  const reduced = useReducedMotion();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useSortable({
    id: task.id,
    data: { laneId, statusId: task.statusId },
    disabled: !draggable,
  });
  const done = task.completedAt !== undefined;
  return (
    <motion.li
      ref={setNodeRef}
      layoutId={reduced ? undefined : `pboard-${task.id}`}
      layout={reduced ? false : "position"}
      transition={{ type: "spring", duration: 0.22, bounce: 0.2 }}
      data-task-card={task.id}
      onMouseDown={draggable ? (listeners?.onMouseDown as MouseEventHandler | undefined) : undefined}
      onTouchStart={draggable ? (listeners?.onTouchStart as TouchEventHandler | undefined) : undefined}
      className={cn(
        "group/card relative flex flex-col gap-1.5 rounded-[20px] bg-surface p-3.5",
        lifted && "opacity-40",
        draggable && "cursor-grab touch-manipulation",
      )}
    >
      <CardBody
        task={task}
        milestones={milestones}
        title={
          <div className="flex items-start gap-2">
            <Link
              href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}`}
              className={cn(
                "min-w-0 flex-1 rounded text-sm font-bold leading-snug text-fg hover:underline focus-visible:focus-ring",
                done && "text-fg-secondary",
              )}
            >
              <bdi>{task.title}</bdi>
            </Link>
            {draggable ? (
              <button
                type="button"
                ref={setActivatorNodeRef}
                {...attributes}
                onKeyDown={listeners?.onKeyDown as KeyboardEventHandler | undefined}
                aria-label={tBoard("move", { title: task.title })}
                className="-me-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-icon-muted opacity-0 focus-visible:opacity-100 focus-visible:focus-ring group-hover/card:opacity-100 max-lg:hidden"
              >
                <GripVertical aria-hidden="true" size={14} />
              </button>
            ) : null}
          </div>
        }
      />
    </motion.li>
  );
}

/** The lifted copy under the pointer: tilted −2°, deep outline, no interaction. */
export function ProjectBoardCardPreview({ task, milestones }: { task: ProjectTask; milestones: readonly ProjectMilestone[] }) {
  return (
    <div className="flex -rotate-2 cursor-grabbing flex-col gap-1.5 rounded-[20px] border-[1.5px] border-scope-deep bg-surface p-3.5 shadow-elevated motion-reduce:rotate-0 rtl:rotate-2 rtl:motion-reduce:rotate-0">
      <CardBody
        task={task}
        milestones={milestones}
        title={
          <span className="text-sm font-bold leading-snug text-fg">
            <bdi>{task.title}</bdi>
          </span>
        }
      />
    </div>
  );
}
