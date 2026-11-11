"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { teamTaskStatuses, type TeamTask, type TeamTaskStatus } from "@/data/team-domain";
import { getPlannerToday } from "@/data/clock";
import { useProjectFormat } from "@/features/projects/format";
import { AssigneeAvatar } from "@/features/projects/tasks/project-task-row";
import { TaskCheck } from "@/features/tasks/list/task-parts";
import { priorityStyle } from "@/features/tasks/ui/priority-style";
import { cn } from "@/lib/cn";
import { SourceChip, teamTaskHref } from "../source-chip";

/*
 * TM-02 row (never notched): Personal's check circle (Mark done for team
 * tasks the viewer may edit) · title + assignment line · Source · Status (a
 * menu of the fixed team statuses when allowed; project tasks are read-only
 * here and open PJ-15 in their project) · Who (PJ-02 assignee avatars with
 * the pending / declined badge) · Due (red when overdue) · Est. · Priority.
 * Phones stack status + due under the title (TMM01).
 */

export const TEAM_ROW_GRID = "lg:grid-cols-[22px_minmax(0,1fr)_150px_104px_56px_64px_44px_80px]";

/** "In review" uses teal in Team so it never looks like the indigo scope colour (README #1). */
const STATUS_CLASS: Record<TeamTaskStatus, string> = {
  todo: "bg-raised text-fg",
  "in-progress": "bg-info-soft text-info-text",
  review: "bg-personal-soft text-personal-deep",
  blocked: "bg-danger-soft text-danger-text",
  done: "bg-success-soft text-success-text",
};

export function TeamStatusChip({ status, className }: { status: TeamTaskStatus; className?: string }) {
  const t = useTranslations("TeamWork.status");
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex min-h-6 shrink-0 items-center rounded-pill px-2.5 text-xs font-semibold whitespace-nowrap",
        STATUS_CLASS[status],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}

/** The status chip, as a menu of the fixed team statuses when the viewer may move the task. */
export function TeamStatusControl({
  task,
  onStatus,
}: {
  task: TeamTask;
  onStatus: (status: TeamTaskStatus) => void;
}) {
  const t = useTranslations("TeamWork");
  if (!task.can.status) return <TeamStatusChip status={task.status} />;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("row.changeStatus", { title: task.title })} className="rounded-pill">
          <TeamStatusChip status={task.status} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-scope="team">
        <DropdownMenuLabel>{t("row.status")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={task.status} onValueChange={(value) => onStatus(value as TeamTaskStatus)}>
          {teamTaskStatuses.map((status) => (
            <DropdownMenuRadioItem key={status} value={status}>
              {t(`status.${status}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The assignment line under a title: waiting for you / for someone / declined. */
export function useAssignmentLine() {
  const t = useTranslations("TeamWork.row");
  return (task: TeamTask): { text: string; tone: "warning" | "danger" | "muted" } | null => {
    const pendingMe = task.assignees.find((assignee) => assignee.person.id === "me" && assignee.state === "pending");
    if (pendingMe) return { text: t("pendingMe"), tone: "warning" };
    const pending = task.assignees.find((assignee) => assignee.state === "pending");
    if (pending) return { text: t("pending", { name: pending.person.name }), tone: "warning" };
    const declined = task.assignees.find((assignee) => assignee.state === "declined");
    if (declined) return { text: t("declined"), tone: "danger" };
    if (task.assignees.length === 0 && task.status !== "done") return { text: t("unassigned"), tone: "muted" };
    return null;
  };
}

export function TeamTaskRow({
  teamId,
  task,
  onStatus,
  after,
}: {
  teamId: string;
  task: TeamTask;
  onStatus: (status: TeamTaskStatus) => void;
  after?: ReactNode;
}) {
  const t = useTranslations("TeamWork");
  const format = useProjectFormat();
  const assignment = useAssignmentLine()(task);
  const done = task.status === "done";
  const overdue = !done && task.due !== null && task.due < getPlannerToday();
  const priority = priorityStyle(task.priority);

  return (
    <li data-task-row={task.id} className="flex flex-col">
      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-row px-3 py-2.5 hover:bg-subtle max-lg:bg-surface lg:min-h-14 lg:px-2",
          TEAM_ROW_GRID,
        )}
      >
        {task.can.status ? (
          <TaskCheck
            className="max-lg:row-span-2"
            look={done ? "done" : "open"}
            aria-pressed={done}
            aria-label={done ? t("row.reopen", { title: task.title }) : t("row.complete", { title: task.title })}
            onClick={() => onStatus(done ? "todo" : "done")}
          />
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              "size-[22px] rounded-full border-[1.8px] border-icon-muted max-lg:row-span-2",
              done && "border-0 bg-primary",
            )}
          />
        )}

        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={teamTaskHref(teamId, task)}
            className={cn("truncate text-sm font-semibold text-fg hover:underline", done && "text-fg-muted line-through")}
          >
            <bdi>{task.title}</bdi>
          </Link>
          {assignment ? (
            <span
              className={cn(
                "truncate text-xs font-medium",
                assignment.tone === "warning"
                  ? "text-warning-text"
                  : assignment.tone === "danger"
                    ? "text-danger-text"
                    : "text-fg-secondary",
              )}
            >
              {assignment.text}
            </span>
          ) : null}
        </div>

        <div className="max-lg:hidden">
          <SourceChip source={task.source} />
        </div>

        <div className="flex items-center gap-2 max-lg:col-start-2 max-lg:row-start-2">
          <TeamStatusControl task={task} onStatus={onStatus} />
          {task.due ? (
            <span className={cn("text-xs font-medium lg:hidden", overdue ? "text-danger-text" : "text-fg-secondary")}>
              {format.day(task.due)}
            </span>
          ) : null}
          <SourceChip source={task.source} className="lg:hidden" />
        </div>

        <div className="flex items-center justify-end max-lg:col-start-3 max-lg:row-span-2 max-lg:row-start-1 lg:justify-start">
          {task.assignees.length > 0 ? (
            <span className="flex items-center [&>*+*]:-ms-1.5">
              {task.assignees.map((assignee) => (
                <AssigneeAvatar key={assignee.person.id} assignee={assignee} />
              ))}
            </span>
          ) : (
            <span className="rounded-pill px-2 py-0.5 text-xs font-semibold text-fg-secondary inset-ring inset-ring-outline">
              —
              <span className="sr-only">{t("row.unassigned")}</span>
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
      {after}
    </li>
  );
}
