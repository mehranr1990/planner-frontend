"use client";

import { useTranslations } from "next-intl";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Task } from "@/data/domain";
import { useList } from "../list/list-context";
import { useScheduleOptions } from "../list/use-task-actions";
import { useTasksState } from "../tasks-context";

/*
 * The phone Reschedule sheet (P18 sheet language): opened by a swipe toward
 * inline-start or the bulk bar's Schedule. One tap moves the tasks and shows
 * the Undo toast.
 */

export function RescheduleSheet({ ids, onClose }: { ids: readonly string[] | null; onClose(): void }) {
  const t = useTranslations("Tasks.bulk");
  const { byId, actions } = useList();
  const { clearSelection } = useTasksState();
  const options = useScheduleOptions();
  const tasks = (ids ?? []).map((id) => byId.get(id)).filter((task): task is Task => Boolean(task));

  return (
    <Sheet open={ids !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" title={t("reschedule")}>
        <ul className="flex flex-col gap-1 pb-2">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  actions.updateMany(tasks, { date: option.date });
                  clearSelection();
                  onClose();
                }}
                className="flex min-h-12 w-full items-center rounded-row px-3 text-start text-[15px] font-semibold text-fg hover:bg-subtle focus-visible:focus-ring"
              >
                {t(`when.${option.id}`)}
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
