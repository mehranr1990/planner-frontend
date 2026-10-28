"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { NewTaskInput } from "@/data/repositories";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { dayLabel } from "@/features/tasks/create/parsed-chips";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import type { BrainDumpClearMode } from "@/data/repositories";
import { parseLine, type PageStats } from "./domain/brain-dump";

const chip = "inline-flex min-h-7 items-center gap-1.5 rounded-pill bg-subtle px-3 text-xs font-bold text-fg-secondary";

/** P08 Convert popover: anchored to the line, pre-filled by parsing it. */
export function ConvertPopover({
  open,
  text,
  today,
  onOpenChange,
  onCreate,
  children,
}: {
  open: boolean;
  text: string;
  today: string;
  onOpenChange(open: boolean): void;
  onCreate(task: Omit<NewTaskInput, "source">): void;
  /** The line the popover is anchored to. */
  children: ReactNode;
}) {
  const t = useTranslations("BrainDump");
  const format = useTasksFormat();
  const { planning } = usePlannerSettings();
  const parsed = parseLine(text, today);
  const [title, setTitle] = useState(parsed.title);
  const date = parsed.date ?? today;
  const durationMinutes = parsed.durationMinutes ?? planning.defaultDurationMinutes;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() === "") return;
    onCreate({ title: title.trim(), date, time: parsed.time ?? null, durationMinutes, priority: parsed.priority ?? null, scope: "personal" });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent align="start" className="w-[22rem]" aria-labelledby="bd-convert-title">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <h3 id="bd-convert-title" className="type-title text-fg">
            {t("convert.title")}
          </h3>
          <Input aria-label={t("convert.field")} value={title} onChange={(event) => setTitle(event.target.value)} dir="auto" autoFocus />
          <ul className="flex flex-wrap gap-1.5">
            <li className={chip}>
              <span aria-hidden="true" className="size-2 rounded-full bg-personal-dot" />
              {t("convert.scope")}
            </li>
            <li className={chip}>{dayLabel(format, date, today)}</li>
            {parsed.time ? <li className={chip}>{format.clock(parsed.time)}</li> : null}
            <li className={chip}>{format.durationShort(durationMinutes)}</li>
          </ul>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={title.trim() === ""}>
              {t("convert.create")}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
              {t("convert.cancel")}
            </Button>
          </div>
          <p className="text-xs text-fg-muted">{t("convert.hint")}</p>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** P08 Clear page: sorted lines are archived; the user decides about the unsorted ones. */
export function ClearPageDialog({
  open,
  stats,
  onOpenChange,
  onClear,
}: {
  open: boolean;
  stats: PageStats;
  onOpenChange(open: boolean): void;
  onClear(mode: BrainDumpClearMode): void;
}) {
  const t = useTranslations("BrainDump");
  const format = useTasksFormat();
  const count = (n: number) => ({ count: n, countText: format.number(n) });
  const choose = (mode: BrainDumpClearMode) => {
    onOpenChange(false);
    onClear(mode);
  };
  const option = "w-full justify-start rounded-[18px]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("clear.title")}
        description={`${t("clear.sorted", count(stats.sorted))} ${stats.unsorted > 0 ? t("clear.unsorted", count(stats.unsorted)) : ""}`}
        size="sm"
      >
        <div className="flex flex-col gap-2">
          {stats.unsorted > 0 ? (
            <>
              <Button variant="outline" className={option} onClick={() => choose("inbox")}>
                {t("clear.inbox")}
              </Button>
              <Button variant="secondary" className={option} onClick={() => choose("keep")}>
                {t("clear.keep")}
              </Button>
            </>
          ) : null}
          <Button variant="secondary" className={option} onClick={() => choose(stats.unsorted > 0 ? "archive" : "keep")}>
            {stats.unsorted > 0 ? t("clear.archive") : t("clear.title")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
