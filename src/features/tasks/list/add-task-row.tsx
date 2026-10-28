"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, useId, useState } from "react";
import { toast } from "@/components/ui/toast";
import { useCreateTask } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { quickParse } from "../domain/quick-parse";
import type { TasksTab } from "../domain/types";
import { useTasksState } from "../tasks-context";
import { Kbd } from "./task-parts";

/*
 * "＋ Add task to Today… try “call mom tomorrow 18:00 !high ~15m”" (N focuses
 * it). Enter creates through quick-parse: what it recognises becomes fields,
 * the rest is the title. Today adds today's date, Upcoming tomorrow's, All
 * none, unless the text names a day. Desktop only: phones capture with the +.
 */

function defaultDate(tab: TasksTab, today: string): string | undefined {
  if (tab === "today") return today;
  if (tab === "upcoming") return addDaysToDay(today, 1);
  return undefined;
}

export const AddTaskRow = forwardRef<HTMLInputElement>(function AddTaskRow(_, ref) {
  const t = useTranslations("Tasks.list");
  const tUndo = useTranslations("Tasks.undo");
  const tKeys = useTranslations("Tasks.keyboard");
  const { today, tab } = useTasksState();
  const { planning } = usePlannerSettings();
  const create = useCreateTask();
  const [value, setValue] = useState("");
  const hintId = useId();
  const placeholderTab = tab === "upcoming" ? "upcoming" : tab === "all" ? "all" : "today";

  const submit = () => {
    const parsed = quickParse(value, today);
    if (!parsed.title.trim()) return;
    const date = parsed.date ?? (parsed.time ? today : defaultDate(tab, today));
    create.mutate(
      {
        title: parsed.title.trim(),
        date: date ?? null,
        time: date ? (parsed.time ?? null) : null,
        priority: parsed.priority ?? null,
        durationMinutes: parsed.durationMinutes ?? planning.defaultDurationMinutes,
        energy: planning.defaultEnergy,
      },
      {
        onSuccess: () => toast({ tone: "success", title: tUndo("created") }),
        onError: () => toast({ tone: "danger", title: tUndo("failed") }),
      },
    );
    setValue("");
  };

  return (
    <div className="mt-1.5 flex min-h-12 items-center gap-2.5 rounded-field bg-subtle px-3.5 focus-within:focus-ring max-lg:hidden">
      <Plus aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
      <input
        ref={ref}
        value={value}
        dir="auto"
        data-add-task=""
        aria-label={t("addLabel")}
        aria-describedby={hintId}
        placeholder={t(`addPlaceholder.${placeholderTab}`)}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            setValue("");
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 shrink-0 basis-56 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
      />
      <span id={hintId} className="min-w-0 flex-1 truncate text-sm text-fg-muted">
        {value ? "" : t("addHint")}
      </span>
      <Kbd>{tKeys("new")}</Kbd>
    </div>
  );
});
