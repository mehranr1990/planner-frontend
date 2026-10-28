"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/state-views";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Task } from "@/data/domain";
import { useTasks } from "@/data/queries";
import { SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { cn } from "@/lib/cn";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { EnergyBars } from "../ui/energy-bars";
import { useIsDesktop } from "@/components/ui/use-is-desktop";

/*
 * Entry points into Focus (P09). This file starts focus and nothing else: it
 * names a task in the URL and the Focus route does the rest. No timer lives
 * here.
 *
 * With a task to hand (the running block's), "Start focus" goes straight to
 * it. Without one it asks which: a popover on desktop, a bottom sheet below
 * lg, listing the day's open tasks (contract: "With no current block it asks
 * which task").
 */

export const FOCUS_HREF = "/personal/focus";

/** The Focus route, naming the task when there is one. */
export function focusHref(taskId?: string | null): string {
  return taskId ? `${FOCUS_HREF}?task=${encodeURIComponent(taskId)}` : FOCUS_HREF;
}

interface TaskPickerProps {
  /** The day whose open tasks are offered. */
  day: string;
  /** Called with a destination after a choice, so the surface can close itself. */
  onChoose: (href: string) => void;
}

/** Open tasks of the day (the "today" view also carries open overdue ones). */
function TaskPicker({ day, onChoose }: TaskPickerProps) {
  const t = useTranslations("MyDay.focus.picker");
  const format = useMyDayFormat();
  const query = useTasks({ view: "today", day });
  const tasks = (query.data ?? []).filter((task: Task) => task.status === "open");

  return (
    <div className="flex flex-col gap-2">
      {query.isPending ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton shape="row" className="h-12 w-full" />
          <Skeleton shape="row" className="h-12 w-full" />
          <Skeleton shape="row" className="h-12 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorState title={t("error")} description={null} onRetry={() => void query.refetch()} live={false} />
      ) : tasks.length === 0 ? (
        <div role="status" className="rounded-field bg-subtle p-4">
          <p className="text-sm font-bold">{t("emptyTitle")}</p>
          <p className="text-[0.8125rem] text-fg-secondary">{t("emptyDescription")}</p>
        </div>
      ) : (
        <ul aria-label={t("listLabel")} className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onChoose(focusHref(task.id))}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-field bg-subtle px-3.5 text-start",
                  "hover:bg-raised active:bg-raised",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  <bdi dir="auto">{task.title}</bdi>
                </span>
                <EnergyBars level={task.energy} />
                {task.durationMinutes !== null ? (
                  <span className="shrink-0 text-xs font-bold text-fg-muted tabular">
                    {format.duration(task.durationMinutes)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onChoose(focusHref())}
        className="min-h-11 rounded-pill px-3 text-start text-[0.8125rem] font-bold text-scope-deep hover:underline"
      >
        {t("withoutTask")}
      </button>
    </div>
  );
}

export interface FocusStartActionProps {
  /**
   * Where to go straight away (the running block's task). Omit it and the
   * button asks which task instead.
   */
  href?: string;
  /** The day whose tasks the picker lists; the planner's today for these cards. */
  day: string;
  /** Glyph classes: a filled play on the volt card. */
  iconClassName?: string;
}

/**
 * The play button for a signature card's notch. One element, so it can be
 * passed as `action`: the picker's root renders no wrapper of its own.
 */
export function FocusStartAction({ href, day, iconClassName = "fill-current" }: FocusStartActionProps) {
  const t = useTranslations("MyDay.focus");
  const router = useRouter();
  const desktop = useIsDesktop(false);
  const [open, setOpen] = useState(false);

  const button = (
    <SignatureCardAction
      icon={Play}
      iconClassName={iconClassName}
      label={t("start")}
      onClick={href ? () => router.push(href) : undefined}
    />
  );
  if (href) return button;

  const choose = (destination: string) => {
    setOpen(false);
    router.push(destination);
  };

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{button}</PopoverTrigger>
        <PopoverContent align="end" className="w-80" aria-label={t("picker.title")}>
          <p className="px-1 pb-2 text-sm font-bold">{t("picker.title")}</p>
          <TaskPicker day={day} onChoose={choose} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{button}</SheetTrigger>
      <SheetContent side="bottom" title={t("picker.title")} description={t("picker.description")}>
        <TaskPicker day={day} onChoose={choose} />
      </SheetContent>
    </Sheet>
  );
}
