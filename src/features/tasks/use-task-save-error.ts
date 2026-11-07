"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import type { NewTaskInput, PartialField, TaskPatch } from "@/data/repositories";
import { RepositoryError } from "@/data/repositories";
import { useBulkUpdateTasks, useUpdateTask } from "@/data/queries";

/*
 * One place that words task save failures. "partial": the task is saved but
 * some follow-up writes (duration, labels, subtasks) were not; the user's
 * values are kept in this closure and "Retry" re-sends only those fields.
 * "unsupported": the live API cannot store that field (nothing was written).
 */

const PATCH_KEYS: Record<PartialField, keyof TaskPatch | null> = {
  duration: "durationMinutes",
  labels: "labels",
  checklist: "checklist",
  note: null,
  recurrence: "recurring",
  plan: null,
};

/** The part of an edit that failed, ready to re-send. */
export function retryPatch(failed: readonly PartialField[], edit: TaskPatch | NewTaskInput): TaskPatch {
  const patch: Record<string, unknown> = {};
  for (const field of failed) {
    const key = PATCH_KEYS[field];
    if (key && key in edit) patch[key] = (edit as Record<string, unknown>)[key];
  }
  return patch as TaskPatch;
}

export function useTaskSaveError() {
  const t = useTranslations("Tasks.undo");
  const { mutateAsync: update } = useUpdateTask();
  const { mutateAsync: bulk } = useBulkUpdateTasks();

  return useCallback(
    /** Returns true when it handled the error (the caller then skips its generic failure toast). */
    function report(error: unknown, edit: TaskPatch | NewTaskInput): boolean {
      if (!(error instanceof RepositoryError)) return false;
      if (error.code === "unsupported") {
        toast({ tone: "info", title: t("unsupported") });
        return true;
      }
      if (error.code === "partial" && error.failedIds?.length) {
        // Bulk: the other tasks were updated; Retry re-sends the same change to the rest.
        const ids = error.failedIds;
        toast({
          tone: "danger",
          title: t("bulkPartial", { n: ids.length }),
          action: {
            label: t("partialRetry"),
            altText: t("partialRetry"),
            onClick: () => void bulk({ ids, patch: edit as TaskPatch }).catch((next: unknown) => report(next, edit)),
          },
        });
        return true;
      }
      if (error.code !== "partial" || !error.task || !error.failed?.length) return false;
      const { task, failed } = error;
      const fields = failed.map((field) => t(`partialFields.${field}`)).join("، ");
      const patch = retryPatch(failed, edit);
      toast({
        tone: "danger",
        title: t("partialSaved", { fields }),
        action: Object.keys(patch).length
          ? {
              label: t("partialRetry"),
              altText: t("partialRetry"),
              onClick: () => void update({ id: task.id, patch }).catch((next: unknown) => report(next, patch)),
            }
          : undefined,
      });
      return true;
    },
    [t, update, bulk],
  );
}
