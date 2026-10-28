"use client";

import { CheckCheck, ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, NoResultsState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { filterChips } from "../domain/filters";
import type { TasksQueryResult } from "../use-tasks-query";
import { useTasksState } from "../tasks-context";
import { useTodayProgress } from "../use-today-progress";
import { useFilterChipText } from "../ui/use-filter-chip-text";
import { useTasksFormat } from "../ui/use-tasks-format";

/*
 * The list's states (P03 States tab): loading, error, no tasks at all,
 * filter with no result, Today all done, Today empty, an empty other view.
 * `pickTasksState` decides; the views render inside the list area.
 */

export type TasksStateKind = "loading" | "error" | "empty" | "no-match" | "all-done" | "today-clear" | "view-empty" | null;

export function pickTasksState(
  data: Pick<TasksQueryResult, "isPending" | "isError" | "tasks" | "totalCounts" | "isFiltered">,
  tab: string,
): TasksStateKind {
  if (data.isPending) return "loading";
  if (data.isError) return "error";
  if (data.totalCounts && data.totalCounts.all === 0 && data.totalCounts.completed === 0 && !data.isFiltered) return "empty";
  if (data.tasks.length === 0) {
    if (data.isFiltered) return "no-match";
    return tab === "today" ? "today-clear" : "view-empty";
  }
  if (tab === "today" && !data.isFiltered && data.tasks.every((task) => task.status === "done")) return "all-done";
  return null;
}

export function TasksLoading() {
  const t = useTranslations("Tasks.states");
  return (
    <div role="status" aria-label={t("loading")} className="flex flex-col gap-3.5 lg:gap-1 lg:rounded-card lg:bg-surface lg:p-3">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-row lg:h-13 lg:rounded-field" />
      ))}
    </div>
  );
}

export interface TasksStateViewProps {
  kind: Exclude<TasksStateKind, "loading" | null>;
  data: TasksQueryResult;
  onAddFirst(): void;
}

export function TasksStateView({ kind, data, onAddFirst }: TasksStateViewProps) {
  const t = useTranslations("Tasks.states");
  const tTabs = useTranslations("Tasks.toolbar.tabs");
  const format = useTasksFormat();
  const text = useFilterChipText();
  const progress = useTodayProgress();
  const { tab, setTab, filters, clearFilters, setQ, q } = useTasksState();
  const card = "rounded-card bg-surface p-7";

  switch (kind) {
    case "error":
      return (
        <ErrorState
          className={card}
          title={t("errorTitle")}
          description={t("errorBody")}
          onRetry={data.refetch}
          retryLabel={t("retry")}
        />
      );
    case "empty":
      return (
        <EmptyState
          className={card}
          icon={ListChecks}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          primaryAction={
            <Button size="sm" onClick={onAddFirst}>
              {t("addFirst")}
            </Button>
          }
          secondaryAction={
            <Button size="sm" variant="secondary" disabled aria-describedby="tasks-import-soon">
              {t("import")}
              <span id="tasks-import-soon" className="text-xs text-fg-muted">
                · {t("soon")}
              </span>
            </Button>
          }
        />
      );
    case "no-match": {
      const parts = [...filterChips(filters).map((chip) => text.chip(chip)), ...(q.trim() ? [`“${q.trim()}”`] : [])];
      const upcoming = data.counts?.upcoming ?? 0;
      const description = [
        t("noMatchBody", { tab: tTabs(tab), filters: parts.join(" + ") }),
        tab !== "upcoming" && upcoming > 0 ? t("noMatchUpcoming", { count: upcoming, n: format.number(upcoming) }) : null,
      ]
        .filter(Boolean)
        .join(" ");
      return (
        <NoResultsState
          className={card}
          title={t("noMatchTitle")}
          description={description}
          primaryAction={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                clearFilters();
                setQ("");
              }}
            >
              {t("clearFilters")}
            </Button>
          }
          secondaryAction={
            tab !== "upcoming" && upcoming > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setTab("upcoming")}>
                {t("showUpcoming")}
              </Button>
            ) : undefined
          }
        />
      );
    }
    case "all-done": {
      const count = progress?.done ?? data.tasks.length;
      return (
        <EmptyState
          className={card}
          icon={CheckCheck}
          title={t("allDoneTitle")}
          description={t("allDoneBody", {
            count,
            n: format.number(count),
            duration: format.durationShort(progress?.completedMinutes ?? 0),
          })}
          primaryAction={
            <Button size="sm" onClick={() => setTab("upcoming")}>
              {t("planTomorrow")}
            </Button>
          }
          secondaryAction={
            <Button size="sm" variant="secondary" onClick={() => setTab("completed")}>
              {t("seeCompleted")}
            </Button>
          }
        />
      );
    }
    case "today-clear":
      return (
        <EmptyState
          className={card}
          icon={CheckCheck}
          title={t("todayClearTitle")}
          description={t("todayClearBody")}
          primaryAction={
            <Button size="sm" onClick={() => setTab("upcoming")}>
              {t("showUpcoming")}
            </Button>
          }
          secondaryAction={
            <Button size="sm" variant="secondary" onClick={onAddFirst}>
              {t("addFirst")}
            </Button>
          }
        />
      );
    default:
      return <EmptyState className={card} icon={ListChecks} title={t("viewEmptyTitle")} description={t("viewEmptyBody")} />;
  }
}
