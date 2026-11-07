"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type Ref } from "react";
import { Icon } from "@/components/ui/icon";
import type { ProjectPerson, ProjectPhase } from "@/data/project-domain";
import { getPlannerToday } from "@/data/clock";
import type { NewProjectTaskInput } from "@/data/project-repositories";
import { priorityStyle } from "@/features/tasks/ui/priority-style";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { projectQuickParse } from "./project-quick-parse";

/*
 * PJ-02 quick add: "Add task to Build… try “Fix login @kian !high due 25 Oct
 * ~3h”". Parses @person, !priority, due, ~estimate as you type (chips under
 * the field), creates in the phase it was typed in; the assignee gets a
 * pending assignment. Enter adds and keeps the field open for the next one.
 */
export function ProjectTaskAdd({
  phase,
  members,
  busy,
  onCreate,
  inputRef,
}: {
  phase: ProjectPhase;
  members: readonly ProjectPerson[];
  busy: boolean;
  onCreate: (input: NewProjectTaskInput) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const t = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const [text, setText] = useState("");
  const id = useId();
  const parsed = projectQuickParse(text, getPlannerToday(), members);
  const chips: { key: string; label: string; className?: string }[] = [];
  if (parsed.assignee) chips.push({ key: "who", label: t("add.assignee", { name: parsed.assignee.name }) });
  if (parsed.priority)
    chips.push({ key: "pri", label: t(`priority.${parsed.priority}`), className: priorityStyle(parsed.priority).chip });
  if (parsed.due) chips.push({ key: "due", label: t("add.due", { date: format.day(parsed.due) }) });
  if (parsed.estimateHours)
    chips.push({ key: "est", label: t("add.estimate", { h: format.number(parsed.estimateHours) }) });

  return (
    <form
      className="flex flex-col gap-1.5 rounded-row bg-subtle px-3 py-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!parsed.title || busy) return;
        onCreate({
          title: parsed.title,
          phaseId: phase.id,
          ...(parsed.assignee ? { assigneeId: parsed.assignee.id } : {}),
          ...(parsed.priority ? { priority: parsed.priority } : {}),
          ...(parsed.due ? { due: parsed.due } : {}),
          ...(parsed.estimateHours ? { estimateHours: parsed.estimateHours } : {}),
        });
        setText("");
      }}
    >
      <div className="flex items-center gap-2">
        <Icon icon={Plus} size={18} className="shrink-0 text-fg-secondary" />
        <label htmlFor={id} className="sr-only">
          {t("add.label")}
        </label>
        <input
          ref={inputRef}
          id={id}
          dir="auto"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("add.placeholder", { phase: phase.name })}
          className="min-h-9 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      {chips.length > 0 ? (
        <ul aria-live="polite" className="flex flex-wrap gap-1.5 ps-7">
          {chips.map((chip) => (
            <li
              key={chip.key}
              className={cn("rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold text-fg", chip.className)}
            >
              <bdi>{chip.label}</bdi>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
