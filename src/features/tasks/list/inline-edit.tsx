"use client";

import { Calendar, Clock, Flag, Repeat } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EnergyBars } from "@/components/ui/energy-bars";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAreas } from "@/data/queries";
import type { Task } from "@/data/domain";
import type { TaskPatch } from "@/data/repositories";
import { cn } from "@/lib/cn";
import { ENERGIES, PRIORITIES } from "../domain/filters";
import { taskWhen } from "../domain/when";
import { useTasksState } from "../tasks-context";
import { useTasksFormat } from "../ui/use-tasks-format";
import { useList } from "./list-context";
import { Kbd, TaskCheck } from "./task-parts";
import { useScheduleOptions } from "./use-task-actions";

/*
 * The expanded row (board "Inline edit"): the title in an input (Enter saves,
 * Esc cancels) and a row of chips that each change one field at once. Tab
 * walks title → chips; Esc anywhere in the row closes it.
 */

export const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

const chipClass =
  "inline-flex min-h-7 items-center gap-1.5 rounded-pill bg-canvas px-3 text-xs font-bold text-fg-secondary hover:text-fg focus-visible:focus-ring";

export function InlineEditRow({ task, onClose }: { task: Task; onClose(): void }) {
  const t = useTranslations("Tasks.edit");
  const tWhen = useTranslations("Tasks.bulk.when");
  const format = useTasksFormat();
  const { today } = useTasksState();
  const { actions } = useList();
  const { data: areas } = useAreas();
  const schedule = useScheduleOptions();
  const [title, setTitle] = useState(task.title);
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const apply = (patch: TaskPatch) => actions.update(task, patch, { silent: true });
  const save = () => {
    const next = title.trim();
    if (next && next !== task.title) apply({ title: next });
    onClose();
  };

  const dateText = task.date
    ? [format.when(taskWhen({ ...task, time: null, status: "open" }, { day: today })).text, task.time ? format.clock(task.time) : null]
        .filter(Boolean)
        .join(" · ")
    : t("noDate");

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onClose();
        }
      }}
      className="flex flex-col gap-2.5 rounded-field bg-(--row-selected) p-3 inset-ring-[1.5px] inset-ring-primary"
    >
      <div className="flex items-center gap-3">
        <TaskCheck look="unselected" tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
        <input
          ref={inputRef}
          value={title}
          aria-label={t("title")}
          dir="auto"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              save();
            }
          }}
          className="h-10 min-w-0 flex-1 rounded-[12px] bg-surface px-3 text-sm font-semibold text-fg outline-none inset-ring-[1.5px] inset-ring-primary"
        />
        <Kbd className="bg-canvas">{t("enter")}</Kbd>
        <Kbd className="bg-canvas">{t("esc")}</Kbd>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 ps-[34px]">
        <Menu trigger={<><Calendar aria-hidden="true" size={14} /> {dateText}</>} label={t("date")}>
          {schedule.map((option) => (
            <DropdownMenuItem key={option.id} onSelect={() => apply({ date: option.date })}>
              {tWhen(option.id)}
            </DropdownMenuItem>
          ))}
        </Menu>
        <Menu
          trigger={<><Clock aria-hidden="true" size={14} /> {task.durationMinutes ? format.durationShort(task.durationMinutes) : "—"}</>}
          label={t("duration")}
        >
          {DURATIONS.map((minutes) => (
            <DropdownMenuItem key={minutes} onSelect={() => apply({ durationMinutes: minutes })}>
              {format.durationShort(minutes)}
            </DropdownMenuItem>
          ))}
        </Menu>
        <Menu
          trigger={<><EnergyBars level={task.energy ?? "medium"} decorative /> {task.energy ? format.energy(task.energy) : t("energy")}</>}
          label={t("energy")}
        >
          {ENERGIES.map((energy) => (
            <DropdownMenuItem key={energy} onSelect={() => apply({ energy })}>
              {format.energy(energy)}
            </DropdownMenuItem>
          ))}
        </Menu>
        <Menu trigger={<><Flag aria-hidden="true" size={14} /> {format.priority(task.priority)}</>} label={t("priority")}>
          {[...PRIORITIES, null].map((priority) => (
            <DropdownMenuItem key={priority ?? "none"} onSelect={() => apply({ priority })}>
              {format.priority(priority)}
            </DropdownMenuItem>
          ))}
        </Menu>
        <button
          type="button"
          aria-pressed={Boolean(task.recurring)}
          aria-label={`${t("repeatLabel")}: ${task.recurring ? t("repeatOn") : t("repeatOff")}`}
          onClick={() => apply({ recurring: !task.recurring })}
          className={chipClass}
        >
          <Repeat aria-hidden="true" size={14} /> {task.recurring ? t("repeatOn") : t("repeatOff")}
        </button>
        <Menu
          outline
          trigger={<>{task.area ? t("area", { name: task.area.name }) : t("noArea")}</>}
          label={t("noArea")}
        >
          {(areas ?? []).map((area) => (
            <DropdownMenuItem key={area.id} onSelect={() => apply({ area })}>
              {area.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => apply({ area: null })}>{t("noArea")}</DropdownMenuItem>
        </Menu>
        <Popover>
          <PopoverTrigger className={cn(chipClass, "bg-transparent inset-ring inset-ring-outline")}>{t("addLabel")}</PopoverTrigger>
          <PopoverContent className="w-56 p-2">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const next = label.trim();
                if (next && !(task.labels ?? []).includes(next)) apply({ labels: [...(task.labels ?? []), next] });
                setLabel("");
              }}
            >
              <input
                value={label}
                dir="auto"
                aria-label={t("newLabel")}
                placeholder={t("newLabel")}
                onChange={(event) => setLabel(event.target.value)}
                className="h-10 w-full rounded-[12px] bg-subtle px-3 text-sm text-fg outline-none focus-visible:focus-ring"
              />
            </form>
          </PopoverContent>
        </Popover>
        <span className="ms-auto text-xs font-semibold text-fg-muted">{t("hint")}</span>
      </div>
    </div>
  );
}

function Menu({ trigger, label, outline, children }: { trigger: ReactNode; label: string; outline?: boolean; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={undefined}
        title={label}
        className={cn(chipClass, outline && "bg-transparent inset-ring inset-ring-outline")}
      >
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
