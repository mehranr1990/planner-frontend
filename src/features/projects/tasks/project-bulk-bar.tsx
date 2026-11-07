"use client";

import { CalendarDays, Check, MoveRight, Trash2, UserPlus, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectPerson, ProjectPhase, ProjectTask, ProjectWorkflow, TaskCan } from "@/data/project-domain";
import { getPlannerToday } from "@/data/clock";
import type { ProjectTaskPatch } from "@/data/project-repositories";
import { TaskCheck } from "@/features/tasks/list/task-parts";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { useProjectFormat } from "../format";
import { useWorkflowStatusLabel } from "../workflow-status-chip";

/*
 * PJ-02 bulk bar (same look as Personal's BulkBar: a surface pill with a
 * primary outline, never black): "2 selected | Assign | Status | Move to
 * phase | Due date | Delete | ×". Capability-aware: an action the role cannot
 * apply to EVERY selected task is disabled with "You can change n of m
 * selected" — never a silent partial apply.
 */

export interface ProjectBulkBarProps {
  tasks: readonly ProjectTask[];
  workflow: ProjectWorkflow;
  phases: readonly ProjectPhase[];
  members: readonly ProjectPerson[];
  onApply: (patch: ProjectTaskPatch) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function ProjectBulkBar({ tasks, workflow, phases, members, onApply, onDelete, onClear }: ProjectBulkBarProps) {
  const t = useTranslations("ProjectTasks.bulk");
  const format = useProjectFormat();
  const reduce = useReducedMotion();
  const statusLabel = useWorkflowStatusLabel();
  if (tasks.length === 0) return null;

  const total = tasks.length;
  const allowed = (key: keyof TaskCan) => tasks.filter((task) => task.can?.[key]).length;
  const today = getPlannerToday();

  const action = (key: keyof TaskCan, label: string, icon: ReactNode, items: ReactNode) => (
    <BulkMenu
      label={label}
      icon={icon}
      allowed={allowed(key)}
      total={total}
      partialText={t("partial", { n: format.number(allowed(key)), total: format.number(total) })}
    >
      {items}
    </BulkMenu>
  );

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(6.75rem+var(--safe-bottom))] z-(--z-shell) flex justify-center lg:bottom-6">
      <motion.div
        role="toolbar"
        aria-label={t("toolbar")}
        initial={reduce ? false : { y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.18 }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClear();
        }}
        className="pointer-events-auto flex min-h-[54px] max-w-full items-center gap-2 overflow-x-auto rounded-pill bg-surface ps-3.5 pe-2 shadow-elevated ring-[1.5px] ring-primary max-lg:w-full lg:min-h-15 lg:ps-[18px]"
      >
        <TaskCheck look="selected" tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
        <span role="status" className="text-[13px] font-bold whitespace-nowrap text-fg lg:text-sm">
          {t("selected", { count: format.number(total) })}
        </span>
        <span aria-hidden="true" className="mx-1.5 hidden h-[26px] w-px bg-hairline lg:block" />
        <div className="flex items-center gap-1.5 lg:rounded-pill lg:bg-canvas lg:p-1">
          {action(
            "assign",
            t("assign"),
            <UserPlus aria-hidden="true" size={15} />,
            members.map((person) => (
              <DropdownMenuItem key={person.id} onSelect={() => onApply({ assigneeIds: [person.id] })}>
                <bdi>{person.name}</bdi>
              </DropdownMenuItem>
            )),
          )}
          {action(
            "status",
            t("status"),
            <Check aria-hidden="true" size={15} />,
            workflow.statuses.map((status) => (
              <DropdownMenuItem key={status.id} onSelect={() => onApply({ statusId: status.id })}>
                <bdi>{statusLabel(status)}</bdi>
              </DropdownMenuItem>
            )),
          )}
          {action(
            "edit",
            t("phase"),
            <MoveRight aria-hidden="true" size={15} className="rtl:-scale-x-100" />,
            phases.map((phase) => (
              <DropdownMenuItem key={phase.id} onSelect={() => onApply({ phaseId: phase.id })}>
                <bdi>{phase.name}</bdi>
              </DropdownMenuItem>
            )),
          )}
          {action(
            "edit",
            t("due"),
            <CalendarDays aria-hidden="true" size={15} />,
            <>
              <DropdownMenuItem onSelect={() => onApply({ due: today })}>{t("today")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onApply({ due: addDaysToDay(today, 1) })}>
                {t("tomorrow")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onApply({ due: addDaysToDay(today, 7) })}>
                {t("nextWeek")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onApply({ due: null })}>{t("noDate")}</DropdownMenuItem>
            </>,
          )}
          <BulkButton
            allowed={allowed("delete")}
            total={total}
            partialText={t("partial", { n: format.number(allowed("delete")), total: format.number(total) })}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" size={15} />
            {t("delete")}
          </BulkButton>
        </div>
        <IconButton icon={X} label={t("clear")} variant="ghost" size="sm" onClick={onClear} />
      </motion.div>
    </div>
  );
}

const buttonClass = "gap-1.5 bg-surface px-3 text-[13px] font-bold whitespace-nowrap hover:bg-subtle max-lg:min-h-10";

/** Disabled with the one-line reason unless the action applies to every selected task. */
function BulkMenu({
  label,
  icon,
  allowed,
  total,
  partialText,
  children,
}: {
  label: string;
  icon: ReactNode;
  allowed: number;
  total: number;
  partialText: string;
  children: ReactNode;
}) {
  const reasonId = useId();
  if (allowed < total) {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          aria-disabled="true"
          aria-describedby={reasonId}
          title={partialText}
          className={`${buttonClass} cursor-not-allowed text-fg-muted`}
        >
          {icon}
          {label}
        </Button>
        <span id={reasonId} hidden>
          {partialText}
        </span>
      </>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className={buttonClass}>
          {icon}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top" data-scope="project">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkButton({
  allowed,
  total,
  partialText,
  onClick,
  children,
}: {
  allowed: number;
  total: number;
  partialText: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const reasonId = useId();
  const blocked = allowed < total;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? reasonId : undefined}
        title={blocked ? partialText : undefined}
        onClick={() => {
          if (!blocked) onClick();
        }}
        className={`${buttonClass} ${blocked ? "cursor-not-allowed text-fg-muted" : ""}`}
      >
        {children}
      </Button>
      {blocked ? (
        <span id={reasonId} hidden>
          {partialText}
        </span>
      ) : null}
    </>
  );
}
