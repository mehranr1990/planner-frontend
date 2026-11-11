"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type Ref } from "react";
import { Icon } from "@/components/ui/icon";
import type { TeamPerson } from "@/data/team-domain";
import type { NewTeamTaskInput } from "@/data/team-repositories";
import { getPlannerToday } from "@/data/clock";
import { useProjectFormat } from "@/features/projects/format";
import { projectQuickParse } from "@/features/projects/tasks/project-quick-parse";
import { priorityStyle } from "@/features/tasks/ui/priority-style";
import { cn } from "@/lib/cn";

/*
 * TM-02 quick add: "Add a team task… @person !priority due ~estimate". The
 * PJ-02 parser (Personal's !priority / ~estimate + @person / due) reads the
 * tokens as you type (chips under the field); the new task joins this week's
 * plan; someone else gets a pending assignment. Enter adds and keeps the
 * field open. Hidden for Viewers.
 */
export function TeamTaskAdd({
  members,
  busy,
  onCreate,
  inputRef,
  defaultAssignee,
}: {
  members: readonly TeamPerson[];
  busy: boolean;
  onCreate: (input: NewTeamTaskInput) => void;
  inputRef?: Ref<HTMLInputElement>;
  /** TM-08 "Assign a task" (?assignee=): used when the text names nobody. */
  defaultAssignee?: TeamPerson;
}) {
  const t = useTranslations("TeamWork");
  const format = useProjectFormat();
  const [text, setText] = useState("");
  const id = useId();
  const quick = projectQuickParse(text, getPlannerToday(), members);
  const parsed = quick.assignee || !defaultAssignee ? quick : { ...quick, assignee: defaultAssignee };
  const chips: { key: string; label: string; className?: string }[] = [];
  if (parsed.assignee) chips.push({ key: "who", label: t("add.assignee", { name: parsed.assignee.name }) });
  if (parsed.priority)
    chips.push({ key: "pri", label: t(`priority.${parsed.priority}`), className: priorityStyle(parsed.priority).chip });
  if (parsed.due) chips.push({ key: "due", label: t("add.due", { date: format.day(parsed.due) }) });
  if (parsed.estimateHours) chips.push({ key: "est", label: t("add.estimate", { h: format.number(parsed.estimateHours) }) });

  return (
    <form
      className="flex flex-col gap-1.5 rounded-row bg-subtle px-3 py-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!parsed.title || busy) return;
        onCreate({
          title: parsed.title,
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
          placeholder={t("add.placeholder")}
          className="min-h-9 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      {chips.length > 0 ? (
        <ul aria-live="polite" className="flex flex-wrap gap-1.5 ps-7">
          {chips.map((chip) => (
            <li key={chip.key} className={cn("rounded-pill bg-surface px-2.5 py-0.5 text-xs font-semibold text-fg", chip.className)}>
              <bdi>{chip.label}</bdi>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
