"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import type { ScheduleChange } from "@/data/project-domain";
import { useScheduleActions } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { SchedulePreviewDialog } from "./schedule-preview-dialog";

/*
 * One way to change dates from any project view (PJ-07 Calendar, PJ-04
 * Timeline, PJ-05 Gantt, PJ-08): ask the schedule for a preview; nothing
 * depends on the item → apply that one move; otherwise open the
 * SchedulePreviewDialog (never a silent cascade). `canCascade` = Manager+;
 * a Member's own task with dependents gets "Move only this task" only.
 */

export function useReschedule(projectId: string, canCascade: boolean): {
  request: (change: ScheduleChange, title: string) => Promise<void>;
  /** Moves an item by whole days, keeping its duration. */
  shiftBy: (itemId: string, days: number, title: string) => Promise<void>;
  dialog: ReactNode;
} {
  const tTasks = useTranslations("ProjectTasks");
  const tAccess = useTranslations("Access.states.conflict");
  const actions = useScheduleActions(projectId);
  const [pending, setPending] = useState<{ change: ScheduleChange; title: string } | null>(null);

  const request = async (change: ScheduleChange, title: string) => {
    try {
      const preview = await actions.preview(change, "cascade");
      if (preview.moves.length > 0 && preview.moves[0]!.from.end === change.end && preview.moves[0]!.from.start === change.start)
        return;
      if (preview.hasDependents) setPending({ change, title });
      else await actions.apply.mutateAsync(preview.moves.slice(0, 1));
    } catch (error) {
      toast({
        tone: "danger",
        title: error instanceof RepositoryError && error.code === "conflict" ? tAccess("title") : tTasks("error"),
      });
    }
  };

  const shiftBy = async (itemId: string, days: number, title: string) => {
    if (days === 0) return;
    const item = (await actions.graph()).items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    await request({ itemId, start: addDaysToDay(item.start, days), end: addDaysToDay(item.end, days) }, title);
  };

  const dialog = pending ? (
    <SchedulePreviewDialog
      projectId={projectId}
      change={pending.change}
      title={pending.title}
      canCascade={canCascade}
      onClose={() => setPending(null)}
    />
  ) : null;
  return { request, shiftBy, dialog };
}
