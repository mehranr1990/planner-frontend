"use client";

import { CalendarCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type RefObject } from "react";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { PillGroup } from "@/components/ui/pills";
import { Skeleton } from "@/components/ui/skeleton";
import type { UnscheduledRange } from "@/data/repositories";
import { useMyDay } from "../my-day-context";
import { UnscheduledRow } from "./unscheduled-row";
import { useAutoFitShortcut } from "./use-auto-fit";
import type { UnscheduledModel } from "./use-unscheduled";

/*
 * The parts the desktop card and the mobile tray share: the Today / Overdue /
 * This week pills and the list with its loading, empty and error states.
 * Selection lives here because it is what the S shortcut acts on.
 */

export function UnscheduledFilters({ overdueCount }: { overdueCount: number | null }) {
  const t = useTranslations("MyDay.unscheduled");
  const { filter, setFilter } = useMyDay();
  return (
    <PillGroup<UnscheduledRange>
      label={t("filterLabel")}
      value={filter}
      onValueChange={setFilter}
      className="self-start"
      options={[
        { value: "today", label: t("filters.today") },
        { value: "overdue", label: t("filters.overdue"), count: overdueCount && overdueCount > 0 ? overdueCount : undefined },
        { value: "week", label: t("filters.week") },
      ]}
    />
  );
}

export function UnscheduledBody({
  model,
  dragEnabled,
  containerRef,
}: {
  model: UnscheduledModel;
  dragEnabled: boolean;
  /** The element that contains the rows; the S shortcut only reacts to keys pressed inside it. */
  containerRef: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("MyDay.unscheduled");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tasks = model.status === "ready" ? model.tasks : [];
  // A task that left the list (scheduled, or another pill) is no longer selected.
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  useAutoFitShortcut(selected, containerRef);

  if (model.status === "pending") {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        <span className="sr-only">{t("loading")}</span>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} shape="row" className="h-13 w-full rounded-field" />
        ))}
      </div>
    );
  }
  if (model.status === "error") {
    return <ErrorState title={t("error")} description={null} onRetry={model.retry} />;
  }
  if (tasks.length === 0) {
    return <EmptyState icon={CalendarCheck} title={t("emptyTitle")} description={t("emptyDescription")} size="compact" variant="tinted" />;
  }
  return (
    <ul aria-label={t("listLabel")} className="flex flex-col gap-2">
      {tasks.map((task) => (
        <UnscheduledRow
          key={task.id}
          task={task}
          selected={task.id === selected?.id}
          onSelect={setSelectedId}
          dragEnabled={dragEnabled}
        />
      ))}
    </ul>
  );
}
