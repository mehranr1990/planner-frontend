"use client";

import { useTranslations } from "next-intl";
import type { WorkflowCategory, WorkflowStatus } from "@/data/project-domain";
import { cn } from "@/lib/cn";

/*
 * Workflow status chip (PJ-02 "WorkflowStatusChip"). Status names are
 * project data, shown as entered; the shipped default statuses carry a key
 * and show their translation. Colour follows the status category and the
 * label is always visible (never colour alone).
 */

const CATEGORY_CLASS: Record<WorkflowCategory, string> = {
  todo: "bg-raised text-fg",
  active: "bg-info-soft text-info-text",
  review: "bg-team-soft text-team-deep",
  blocked: "bg-danger-soft text-danger-text",
  done: "bg-success-soft text-success-text",
};

export function useWorkflowStatusLabel() {
  const t = useTranslations("ContextShell.workflow");
  return (status: WorkflowStatus | undefined) => (status ? (status.key ? t(status.key) : status.name) : "");
}

export function WorkflowStatusChip({ status, className }: { status: WorkflowStatus | undefined; className?: string }) {
  const label = useWorkflowStatusLabel();
  if (!status) return null;
  return (
    <span
      data-category={status.category}
      className={cn(
        "inline-flex min-h-6 shrink-0 items-center rounded-pill px-2.5 text-xs font-semibold whitespace-nowrap",
        CATEGORY_CLASS[status.category],
        className,
      )}
    >
      <bdi>{label(status)}</bdi>
    </span>
  );
}
