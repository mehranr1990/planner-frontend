"use client";

import { CalendarDays, Check, Ellipsis, Flag, MoveRight, Trash2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import type { MouseEvent, ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAreas } from "@/data/queries";
import type { Task } from "@/data/domain";
import { cn } from "@/lib/cn";
import { PRIORITIES } from "../domain/filters";
import { useList } from "../list/list-context";
import { TaskCheck } from "../list/task-parts";
import { useTasksState } from "../tasks-context";
import { useTasksFormat } from "../ui/use-tasks-format";

/*
 * The floating bulk bar ("2 selected | Schedule | Move | Priority | Complete |
 * Delete | ×"): a surface pill with a primary outline, never black. Schedule
 * opens the shared Reschedule (anchored popover from lg, bottom sheet below). Desktop
 * floats bottom-centre; phones (PM04) get Schedule · Complete · Delete and a
 * ⋯ menu for Move / Priority, above the bottom nav. Slides up 16px in 180ms.
 */

export function BulkBar() {
  const t = useTranslations("Tasks.bulk");
  const format = useTasksFormat();
  const reduce = useReducedMotion();
  const { selectedIds, clearSelection } = useTasksState();
  const { byId, actions, openReschedule } = useList();
  const { data: areas } = useAreas();

  const tasks = selectedIds.map((id) => byId.get(id)).filter((task): task is Task => Boolean(task));
  if (tasks.length === 0) return null;

  const done = (run: () => void) => () => {
    run();
    clearSelection();
  };

  const moveItems = (areas ?? []).map((area) => (
    <DropdownMenuItem key={area.id} onSelect={done(() => actions.updateMany(tasks, { area }))}>
      {area.name}
    </DropdownMenuItem>
  ));
  const priorityItems = [...PRIORITIES, null].map((priority) => (
    <DropdownMenuItem key={priority ?? "none"} onSelect={done(() => actions.updateMany(tasks, { priority }))}>
      {format.priority(priority)}
    </DropdownMenuItem>
  ));

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(6.75rem+var(--safe-bottom))] z-(--z-shell) flex justify-center lg:bottom-6">
      <motion.div
        role="toolbar"
        aria-label={t("toolbar")}
        initial={reduce ? false : { y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.18 }}
        onKeyDown={(event) => {
          if (event.key === "Escape") clearSelection();
        }}
        className="pointer-events-auto flex min-h-[54px] max-w-full items-center gap-2 rounded-pill bg-surface ps-3.5 pe-2 shadow-elevated ring-[1.5px] ring-primary max-lg:w-full lg:min-h-15 lg:ps-[18px]"
      >
        <TaskCheck look="selected" tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
        <span role="status" className="text-[13px] font-bold whitespace-nowrap text-fg max-lg:flex-1 lg:text-sm">
          {t("selected", { count: format.number(tasks.length) })}
        </span>
        <span aria-hidden="true" className="mx-1.5 hidden h-[26px] w-px bg-hairline lg:block" />
        <div className="flex items-center gap-1.5 lg:rounded-pill lg:bg-canvas lg:p-1">
          <BarButton onClick={(event) => openReschedule(tasks.map((task) => task.id), event.currentTarget)}>
            <CalendarDays aria-hidden="true" size={15} />
            {t("schedule")}
          </BarButton>
          <div className="hidden lg:block">
            <Menu label={t("move")} icon={<MoveRight aria-hidden="true" size={15} className="rtl:-scale-x-100" />}>
              {moveItems}
            </Menu>
          </div>
          <div className="hidden lg:block">
            <Menu label={t("priority")} icon={<Flag aria-hidden="true" size={15} />}>
              {priorityItems}
            </Menu>
          </div>
          <BarButton onClick={done(() => actions.completeMany(tasks))}>
            <Check aria-hidden="true" size={15} />
            {t("complete")}
          </BarButton>
          <BarButton onClick={done(() => actions.remove(tasks))}>
            <Trash2 aria-hidden="true" size={15} />
            {t("delete")}
          </BarButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={Ellipsis} label={t("more")} variant="ghost" size="sm" className="lg:hidden" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("move")}</DropdownMenuLabel>
              {moveItems}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("priority")}</DropdownMenuLabel>
              {priorityItems}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <IconButton icon={X} label={t("clear")} variant="ghost" size="sm" onClick={clearSelection} />
      </motion.div>
    </div>
  );
}

function BarButton({ className, children, onClick }: { className?: string; children: ReactNode; onClick(event: MouseEvent<HTMLButtonElement>): void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      className={cn("gap-1.5 bg-surface px-3 text-[13px] font-bold hover:bg-subtle max-lg:min-h-10", className)}
    >
      {children}
    </Button>
  );
}

function Menu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5 bg-surface px-3 text-[13px] font-bold hover:bg-subtle">
          {icon}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
