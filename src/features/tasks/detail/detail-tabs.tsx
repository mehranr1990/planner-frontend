"use client";

import { Check, Link2, Paperclip, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { Task, TaskActivity, TaskLink } from "@/data/domain";
import { useAddTaskNote } from "@/data/queries";
import type { TaskPatch } from "@/data/repositories";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import { addDaysToDay, dayOfInstant, minutesOfInstant } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { detailTabs, type DetailTab } from "../domain/detail";
import { TaskCheck } from "../list/task-parts";
import { useTasksFormat } from "../ui/use-tasks-format";

/*
 * P06 folder tabs: sections of one task (Subtasks · Notes · Activity ·
 * Links). Activity and Links only appear with content.
 */

const fieldClass =
  "w-full rounded-[14px] bg-surface px-3 text-sm text-fg outline-none inset-ring-[1.5px] inset-ring-line placeholder:text-fg-muted focus-visible:inset-ring-primary";

export function DetailTabs({ task, today, onPatch }: { task: Task; today: string; onPatch(patch: TaskPatch): void }) {
  const t = useTranslations("Tasks.detail");
  const format = useTasksFormat();
  const checklist = task.checklist ?? [];
  const doneCount = checklist.filter((item) => item.done).length;

  const panels: Record<DetailTab, Omit<FolderTab, "value">> = {
    subtasks: {
      label: t("tabs.subtasks"),
      count: checklist.length ? `${format.number(doneCount)}/${format.number(checklist.length)}` : undefined,
      content: <SubtasksPanel task={task} onPatch={onPatch} />,
    },
    notes: {
      label: t("tabs.notes"),
      count: task.notes?.length ? format.number(task.notes.length) : undefined,
      content: <NotesPanel task={task} today={today} />,
    },
    activity: { label: t("tabs.activity"), content: <ActivityPanel items={task.activity ?? []} today={today} /> },
    links: {
      label: t("tabs.links"),
      count: task.links?.length ? format.number(task.links.length) : undefined,
      content: <LinksPanel links={task.links ?? []} />,
    },
  };

  return (
    <FolderTabsCard
      label={t("tabsLabel")}
      defaultValue="subtasks"
      surface="subtle"
      tabs={detailTabs(task).map((value) => ({ value, ...panels[value] }))}
    />
  );
}

function SubtasksPanel({ task, onPatch }: { task: Task; onPatch(patch: TaskPatch): void }) {
  const t = useTranslations("Tasks.detail.subtasks");
  const format = useTasksFormat();
  const [draft, setDraft] = useState("");
  const items = task.checklist ?? [];
  const done = items.filter((item) => item.done).length;
  const setItems = (checklist: TaskPatch["checklist"]) => onPatch({ checklist });
  const progress = t("progress", { done: format.number(done), total: format.number(items.length) });

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-fg">{progress}</span>
          <div
            role="progressbar"
            aria-label={t("progressLabel")}
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={done}
            aria-valuetext={progress}
            className="h-1.5 flex-1 overflow-hidden rounded-pill bg-outline/40"
          >
            <div
              className="h-full rounded-pill bg-primary transition-[inline-size] duration-200 motion-reduce:transition-none"
              style={{ inlineSize: `${(done / items.length) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-secondary">{t("empty")}</p>
      )}
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="group flex min-h-11 items-center gap-3 ps-1">
            <TaskCheck
              look={item.done ? "done" : "open"}
              role="checkbox"
              aria-checked={item.done}
              aria-label={item.title}
              onClick={() => setItems(items.map((other) => (other.id === item.id ? { ...other, done: !other.done } : other)))}
            />
            <span dir="auto" className={cn("min-w-0 flex-1 text-sm text-fg", item.done && "text-fg-muted line-through")}>
              {item.title}
            </span>
            <IconButton
              size="sm"
              variant="ghost"
              icon={X}
              label={t("remove", { title: item.title })}
              onClick={() => setItems(items.filter((other) => other.id !== item.id))}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-100"
            />
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const title = draft.trim();
          if (!title) return;
          setItems([...items, { title, done: false }]);
          setDraft("");
        }}
        className="relative"
      >
        <Plus aria-hidden="true" size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-muted" />
        <input
          value={draft}
          dir="auto"
          aria-label={t("add")}
          placeholder={t("addHint")}
          onChange={(event) => setDraft(event.target.value)}
          className={cn(fieldClass, "h-11 ps-9")}
        />
      </form>
    </div>
  );
}

function NotesPanel({ task, today }: { task: Task; today: string }) {
  const t = useTranslations("Tasks.detail.notes");
  const tUndo = useTranslations("Tasks.undo");
  const stamp = useStamp(today);
  const addNote = useAddTaskNote();
  const [draft, setDraft] = useState("");
  const notes = task.notes ?? [];

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 ? <p className="text-sm text-fg-secondary">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {notes.map((note) => (
          <li key={note.id} className="flex flex-col gap-1 rounded-[14px] bg-surface p-3">
            <p dir="auto" className="whitespace-pre-line text-sm text-fg">
              {note.body}
            </p>
            <p className="text-xs text-fg-muted">{stamp(note.createdAt)}</p>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body) return;
          addNote.mutate(
            { id: task.id, body },
            { onSuccess: () => setDraft(""), onError: () => toast({ tone: "danger", title: tUndo("failed") }) },
          );
        }}
        className="flex flex-col items-end gap-2"
      >
        <textarea
          value={draft}
          dir="auto"
          rows={2}
          aria-label={t("add")}
          placeholder={t("add")}
          onChange={(event) => setDraft(event.target.value)}
          className={cn(fieldClass, "field-sizing-content min-h-16 py-2.5")}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()} loading={addNote.isPending}>
          {t("save")}
        </Button>
      </form>
    </div>
  );
}

function ActivityPanel({ items, today }: { items: readonly TaskActivity[]; today: string }) {
  const t = useTranslations("Tasks.detail.activity");
  const format = useTasksFormat();
  const stamp = useStamp(today);
  const text = (item: TaskActivity): ReactNode => {
    switch (item.kind) {
      case "created":
        return t(`created.${item.source}`);
      case "scheduled":
        return t("scheduled", { time: format.clock(item.time) });
      case "subtaskDone":
        return t("subtaskDone", { title: item.title });
      case "priority":
        return t("priority", { priority: format.priority(item.priority) });
    }
  };
  return (
    <ol className="flex flex-col">
      {items.map((item) => (
        <li key={item.id} className="flex min-h-11 items-center gap-3 border-b border-line py-2 last:border-b-0">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-fg-muted" />
          <span className="min-w-0 flex-1 text-sm text-fg">{text(item)}</span>
          <span className="shrink-0 text-xs text-fg-muted">{stamp(item.at)}</span>
        </li>
      ))}
    </ol>
  );
}

function LinksPanel({ links }: { links: readonly TaskLink[] }) {
  const t = useTranslations("Tasks.detail.links");
  const format = useTasksFormat();
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.id} className="flex min-h-11 items-center gap-3 rounded-[14px] bg-surface px-3 py-2 text-sm">
            {"taskId" in link ? (
              <>
                <span className="shrink-0 text-xs font-bold text-fg-muted">{t(link.kind)}</span>
                <bdi dir="auto" className="min-w-0 flex-1 font-semibold text-fg">
                  {link.title}
                </bdi>
                {link.done ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-scope-deep">
                    <Check aria-hidden="true" size={13} /> {t("done")}
                  </span>
                ) : link.date ? (
                  <span className="text-xs text-fg-muted">{format.weekdayShort(link.date)}</span>
                ) : (
                  <span className="text-xs text-fg-muted">{t("open")}</span>
                )}
              </>
            ) : link.kind === "file" ? (
              <>
                <Paperclip aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
                <bdi dir="ltr" className="min-w-0 flex-1 truncate font-semibold text-fg">
                  {link.name}
                </bdi>
                <span className="text-xs text-fg-muted">
                  {t("size", { size: format.number(Math.round(link.sizeBytes / 1024)) })}
                </span>
              </>
            ) : (
              <>
                <Link2 aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
                <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold text-fg underline-offset-2 hover:underline focus-visible:focus-ring">
                  <bdi dir="auto">{link.label}</bdi>
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("hint")}</p>
      <p className="rounded-[14px] border-[1.5px] border-dashed border-outline px-3 py-3 text-center text-xs font-semibold text-fg-muted">
        {t("drop")}
      </p>
    </div>
  );
}

/** "09:12" today, "Yesterday · 18:40", else the short weekday. */
function useStamp(today: string): (instant: string) => string {
  const format = useTasksFormat();
  return (instant) => {
    const day = dayOfInstant(instant);
    const clock = format.clock(minutesOfInstant(instant));
    if (day === today) return clock;
    if (day === addDaysToDay(today, -1)) return `${format.relative("yesterday")} · ${clock}`;
    return format.weekdayShort(day);
  };
}
