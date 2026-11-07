"use client";

import { Clock, Link2, ListChecks, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { ProjectMilestone, ProjectTask, ProjectWorkflow, TaskAssignee } from "@/data/project-domain";
import { getPlannerToday } from "@/data/clock";
import { TaskCheck } from "@/features/tasks/list/task-parts";
import { priorityStyle } from "@/features/tasks/ui/priority-style";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useWorkflowStatusLabel, WorkflowStatusChip } from "../workflow-status-chip";

/*
 * One PJ-02 row (never notched): selection square (bulk roles only) · title
 * with the dependency marker, subtasks, comments, milestone and the
 * assignment line (pending / declined + reason + "needs reassignment") ·
 * workflow status (a menu of the allowed transitions when the user may move
 * it) · assignees with the acceptance badge (clock = pending, ✕ = declined)
 * · due (red when overdue) · estimate · priority (dot + word). Phones stack
 * the secondary columns under the title (PJM01).
 */

export const PROJECT_ROW_GRID = "lg:grid-cols-[22px_minmax(0,1fr)_116px_96px_64px_44px_92px]";

export interface ProjectTaskRowProps {
  task: ProjectTask;
  projectId: string;
  workflow: ProjectWorkflow;
  milestones: readonly ProjectMilestone[];
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  canChangeStatus: boolean;
  onStatus: (statusId: string) => void;
  /** Conflict notice under the row (SH-02), with its actions. */
  conflict?: ReactNode;
}

function AssigneeAvatar({ assignee }: { assignee: TaskAssignee }) {
  const t = useTranslations("ProjectTasks.row");
  const name =
    assignee.state === "pending"
      ? t("pending", { name: assignee.person.name })
      : assignee.state === "declined"
        ? t("declinedBadge", { name: assignee.person.name })
        : assignee.person.name;
  return (
    <span role="img" aria-label={name} className="relative inline-flex">
      <Avatar
        name={assignee.person.name}
        initials={assignee.person.initials}
        size={32}
        decorative
        className="size-7 text-[0.625rem]"
      />
      {assignee.state !== "accepted" ? (
        <span
          aria-hidden="true"
          data-badge={assignee.state}
          className={cn(
            "absolute -end-1 -bottom-1 inline-flex size-3.5 items-center justify-center rounded-full ring-2 ring-surface",
            assignee.state === "pending" ? "bg-warning text-on-accent" : "bg-danger text-on-accent",
          )}
        >
          <Icon icon={assignee.state === "pending" ? Clock : X} size={9} />
        </span>
      ) : null}
    </span>
  );
}

export function ProjectTaskRow({
  task,
  projectId,
  workflow,
  milestones,
  selectable,
  selected,
  onToggleSelected,
  canChangeStatus,
  onStatus,
  conflict,
}: ProjectTaskRowProps) {
  const t = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const status = workflow.statuses.find((candidate) => candidate.id === task.statusId);
  const done = status?.category === "done";
  const overdue = !done && task.due !== null && task.due < getPlannerToday();
  const priority = priorityStyle(task.priority);
  const milestone = milestones.find((candidate) => candidate.id === task.milestoneId);
  const moves = (workflow.transitions[task.statusId] ?? [])
    .map((id) => workflow.statuses.find((candidate) => candidate.id === id))
    .filter((candidate) => candidate !== undefined);
  const movable = canChangeStatus && task.can?.status !== false;
  const titleId = `ptask-title-${task.id}`;

  // The explanatory line: assignment state first, then dependency/subtasks/comments, then milestone.
  const pendingMe = task.assignees.find((assignee) => assignee.person.id === "me" && assignee.state === "pending");
  const pendingOther = task.assignees.find((assignee) => assignee.person.id !== "me" && assignee.state === "pending");
  const declined = task.assignees.find((assignee) => assignee.state === "declined");
  const visibleAssignees = task.assignees;

  const meta: ReactNode[] = [];
  if (task.blockedBy.length > 0) {
    meta.push(
      <span key="dep" data-slot="dependency" className="inline-flex items-center gap-1 text-danger-text">
        <Icon icon={Link2} size={12} />
        {t("dep.blocked", { n: format.number(task.blockedBy.length) })}
      </span>,
    );
  }
  if (task.subtasks.total > 0) {
    meta.push(
      <span key="sub" className="inline-flex items-center gap-1">
        <Icon icon={ListChecks} size={12} />
        {t("row.subtasks", { done: format.number(task.subtasks.done), total: format.number(task.subtasks.total) })}
      </span>,
    );
  }
  if (task.commentCount > 0) {
    meta.push(
      <span key="comments" className="inline-flex items-center gap-1">
        <Icon icon={MessageSquare} size={12} className="lg:hidden" />
        {t("row.comments", { n: format.number(task.commentCount) })}
      </span>,
    );
  }
  if (milestone) meta.push(<bdi key="ms">{t("row.milestone", { title: milestone.title })}</bdi>);

  let assignmentLine: ReactNode = null;
  if (pendingMe) assignmentLine = <span className="text-warning-text">{t("row.pendingMe")}</span>;
  else if (pendingOther)
    assignmentLine = (
      <span className="text-warning-text">{t("assign.pending", { name: pendingOther.person.name })}</span>
    );
  else if (declined) {
    assignmentLine = (
      <span className="text-danger-text">
        {declined.note
          ? t("assign.declinedNote", { name: declined.person.name, note: declined.note })
          : t("assign.declined", { name: declined.person.name })}
      </span>
    );
  }

  const statusControl = movable ? (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("row.changeStatus", { title: task.title })} className="rounded-pill">
          <WorkflowStatusChip status={status} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-scope="project">
        <DropdownMenuLabel>{statusLabel(status)}</DropdownMenuLabel>
        {moves.length === 0 ? <DropdownMenuItem disabled>{t("row.noMoves")}</DropdownMenuItem> : null}
        {moves.map((move) => (
          <DropdownMenuItem key={move.id} onSelect={() => onStatus(move.id)}>
            <bdi>{statusLabel(move)}</bdi>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <WorkflowStatusChip status={status} />
  );

  return (
    <li data-task-row={task.id} data-selected={selected || undefined} className="flex flex-col">
      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-row px-3 py-2.5 lg:min-h-14 lg:px-2",
          PROJECT_ROW_GRID,
          selected ? "bg-scope-soft/50 ring-[1.5px] ring-primary" : "hover:bg-subtle",
          "max-lg:bg-surface",
        )}
      >
        {selectable ? (
          <TaskCheck
            className="max-lg:row-span-2"
            look={selected ? "selected" : "unselected"}
            aria-pressed={selected}
            aria-label={t("row.select", { title: task.title })}
            onClick={onToggleSelected}
          />
        ) : (
          <span
            aria-hidden="true"
            className={cn("size-[22px] rounded-full border-[1.8px] border-icon-muted", done && "border-0 bg-primary")}
          />
        )}

        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            id={titleId}
            href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}`}
            className={cn(
              "truncate text-sm font-semibold text-fg hover:underline",
              done && "text-fg-muted line-through",
            )}
          >
            <bdi>{task.title}</bdi>
          </Link>
          {meta.length > 0 || assignmentLine ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs font-medium text-fg-secondary">
              {assignmentLine ??
                meta.flatMap((piece, index) =>
                  index > 0
                    ? [
                        <span key={`sep-${index}`} aria-hidden="true">
                          ·
                        </span>,
                        piece,
                      ]
                    : [piece],
                )}
            </span>
          ) : null}
        </div>

        {/* Phones (PJM01): status + due on a second line under the title. */}
        <div className="flex items-center gap-2 max-lg:col-start-2 max-lg:row-start-2">
          {statusControl}
          {task.due ? (
            <span className={cn("text-xs font-medium lg:hidden", overdue ? "text-danger-text" : "text-fg-secondary")}>
              {format.day(task.due)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-end max-lg:col-start-3 max-lg:row-span-2 max-lg:row-start-1 lg:justify-start">
          {visibleAssignees.length > 0 ? (
            <span className="flex items-center -space-x-1.5 rtl:space-x-reverse">
              {visibleAssignees.map((assignee) => (
                <AssigneeAvatar key={assignee.person.id} assignee={assignee} />
              ))}
            </span>
          ) : (
            <span className="rounded-pill px-2 py-0.5 text-xs font-semibold text-fg-secondary inset-ring inset-ring-outline">
              {t("row.unassigned")}
            </span>
          )}
        </div>

        <span className={cn("text-xs font-semibold max-lg:hidden", overdue ? "text-danger-text" : "text-fg")}>
          {task.due ? format.day(task.due) : "—"}
          {overdue ? <span className="sr-only"> · {t("row.overdue")}</span> : null}
        </span>
        <span className="text-xs font-medium text-fg-secondary max-lg:hidden">
          {task.estimateHours !== null ? t("row.est", { h: format.number(task.estimateHours) }) : "—"}
        </span>
        <span className={cn("flex items-center gap-1.5 text-xs font-semibold max-lg:hidden", priority.label)}>
          <span aria-hidden="true" className={cn("size-2 rounded-full", priority.dot)} />
          {t(`priority.${task.priority}`)}
        </span>
      </div>
      {conflict}
    </li>
  );
}
