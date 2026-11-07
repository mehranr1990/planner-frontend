"use client";

import { Filter, GitBranch, Kanban, List, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import type { ProjectMilestone, ProjectPerson, ProjectPriority, ProjectWorkflow } from "@/data/project-domain";
import type { ProjectTaskFilters, ProjectTaskView } from "@/data/project-repositories";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useWorkflowStatusLabel } from "../workflow-status-chip";
import { GROUP_OPTIONS, type ProjectTaskGroupBy } from "./project-task-groups";

/*
 * What the Tasks view modes (PJ-02 List · PJ-03 Board · PJ-06 Flow, D3)
 * share: the URL-held state (view pill, search, group, filters) so switching
 * views keeps it, the segmented List / Board / Flow switch in the header,
 * the Filters popover and the active-filter chips.
 */

export const TASK_VIEWS: readonly ProjectTaskView[] = ["all", "mine", "unassigned", "overdue", "completed"];
export const TASK_PRIORITIES: readonly ProjectPriority[] = ["urgent", "high", "medium", "low"];
export const FILTER_KEYS = ["status", "assignee", "priority", "milestone"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type TaskViewMode = "list" | "board" | "flow";

function listParam(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? "").split(",").filter(Boolean);
}

/** URL-held list state (view, search, group, filters) so Board / Flow keep it. */
export function useTasksUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const viewParam = params.get("view");
  const view: ProjectTaskView = (TASK_VIEWS as readonly string[]).includes(viewParam ?? "")
    ? (viewParam as ProjectTaskView)
    : "all";
  const groupParam = params.get("group");
  const group: ProjectTaskGroupBy = (GROUP_OPTIONS as readonly string[]).includes(groupParam ?? "")
    ? (groupParam as ProjectTaskGroupBy)
    : "phase";
  const filters: Record<FilterKey, string[]> = {
    status: listParam(params, "status"),
    assignee: listParam(params, "assignee"),
    priority: listParam(params, "priority"),
    milestone: listParam(params, "milestone"),
  };
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const toggleFilter = (key: FilterKey, value: string) => {
    const current = filters[key];
    const nextValues = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    set({ [key]: nextValues.join(",") || null });
  };
  const taskFilters: ProjectTaskFilters = {
    statusIds: filters.status,
    assigneeIds: filters.assignee,
    priorities: filters.priority as ProjectPriority[],
    milestoneIds: filters.milestone,
  };
  return {
    view,
    group,
    filters,
    taskFilters,
    filterCount: FILTER_KEYS.reduce((sum, key) => sum + filters[key].length, 0),
    search: params.get("q") ?? "",
    add: params.get("add") === "1",
    swimlane: params.get("lanes"),
    query: params.toString(),
    set,
    toggleFilter,
    clearFilters: () => set({ status: null, assignee: null, priority: null, milestone: null, q: null }),
  };
}

export type TasksUrlState = ReturnType<typeof useTasksUrlState>;

/** Header switch between the Tasks view modes; the URL query travels along. Flow is not on phones (D18). */
export function TaskViewSwitch({ projectId, current, query }: { projectId: string; current: TaskViewMode; query: string }) {
  const t = useTranslations("ProjectTasks");
  const router = useRouter();
  const href = (mode: TaskViewMode) =>
    `${projectHref(projectId, mode === "list" ? "tasks" : mode === "board" ? "board" : "flow")}${query ? `?${query}` : ""}`;
  const option = (value: TaskViewMode, icon: typeof List) => ({
    value,
    label: (
      <>
        <Icon icon={icon} size={16} />
        {t(`view.${value}`)}
      </>
    ),
  });
  const other: TaskViewMode = current === "board" ? "list" : "board";
  return (
    <>
      <Segmented
        label={t("view.label")}
        value={current}
        onValueChange={(value) => {
          if (value !== current) router.push(href(value));
        }}
        options={[option("list", List), option("board", Kanban), option("flow", GitBranch)]}
        className="max-sm:hidden"
      />
      {/* Phones (PJM01/PJM03): List ⇄ Board one tap away; Flow is not on phones (D18). */}
      <IconButton
        icon={other === "board" ? Kanban : List}
        label={t(`view.${other}`)}
        className="bg-surface sm:hidden"
        onClick={() => router.push(href(other))}
      />
    </>
  );
}

export interface TaskFiltersPopoverProps {
  url: TasksUrlState;
  workflow: ProjectWorkflow;
  members: readonly ProjectPerson[];
  milestones: readonly ProjectMilestone[];
  /** Guests never filter by people. */
  guest: boolean;
}

export function TaskFiltersPopover({ url, workflow, members, milestones, guest }: TaskFiltersPopoverProps) {
  const t = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2 bg-surface">
          <Icon icon={Filter} size={16} />
          {t("filters.button")}
          {url.filterCount > 0 ? (
            <span className="rounded-pill bg-scope-soft px-1.5 text-xs font-bold text-scope-deep">
              {format.number(url.filterCount)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={t("filters.title")} className="w-80" data-scope="project">
        <div className="flex flex-col gap-3">
          <FilterSection label={t("filters.status")}>
            {workflow.statuses.map((status) => (
              <FilterChip
                key={status.id}
                pressed={url.filters.status.includes(status.id)}
                onClick={() => url.toggleFilter("status", status.id)}
              >
                {statusLabel(status)}
              </FilterChip>
            ))}
          </FilterSection>
          {!guest ? (
            <FilterSection label={t("filters.assignee")}>
              {[...members.map((person) => person.id), "none"].map((id) => (
                <FilterChip
                  key={id}
                  pressed={url.filters.assignee.includes(id)}
                  onClick={() => url.toggleFilter("assignee", id)}
                >
                  {id === "none" ? t("filters.unassigned") : (members.find((person) => person.id === id)?.name ?? id)}
                </FilterChip>
              ))}
            </FilterSection>
          ) : null}
          <FilterSection label={t("filters.priority")}>
            {TASK_PRIORITIES.map((priority) => (
              <FilterChip
                key={priority}
                pressed={url.filters.priority.includes(priority)}
                onClick={() => url.toggleFilter("priority", priority)}
              >
                {t(`priority.${priority}`)}
              </FilterChip>
            ))}
          </FilterSection>
          <FilterSection label={t("filters.milestone")}>
            {milestones.map((milestone) => (
              <FilterChip
                key={milestone.id}
                pressed={url.filters.milestone.includes(milestone.id)}
                onClick={() => url.toggleFilter("milestone", milestone.id)}
              >
                {milestone.title}
              </FilterChip>
            ))}
          </FilterSection>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** "Filtered by" chips under the toolbar, each removable, plus Clear. */
export function ActiveTaskFilters({
  url,
  workflow,
  members,
  milestones,
}: Omit<TaskFiltersPopoverProps, "guest">) {
  const t = useTranslations("ProjectTasks");
  const statusLabel = useWorkflowStatusLabel();
  if (url.filterCount === 0) return null;
  const valueLabel = (key: FilterKey, value: string) => {
    if (key === "status") return statusLabel(workflow.statuses.find((status) => status.id === value)) || value;
    if (key === "assignee")
      return value === "none"
        ? t("filters.unassigned")
        : (members.find((person) => person.id === value)?.name ?? value);
    if (key === "priority") return t(`priority.${value as ProjectPriority}`);
    return milestones.find((milestone) => milestone.id === value)?.title ?? value;
  };
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 text-xs font-semibold text-fg-secondary">
      <span>{t("filters.active")}</span>
      {FILTER_KEYS.flatMap((key) =>
        url.filters[key].map((value) => (
          <span
            key={`${key}-${value}`}
            className="inline-flex items-center gap-1 rounded-pill bg-scope-soft py-0.5 ps-2.5 pe-1 text-scope-deep"
          >
            <bdi>{t("filters.chip", { label: t(`filters.${key}`), value: valueLabel(key, value) })}</bdi>
            <button
              type="button"
              aria-label={t("filters.remove", { value: valueLabel(key, value) })}
              onClick={() => url.toggleFilter(key, value)}
              className="inline-flex size-5 items-center justify-center rounded-full hover:bg-surface"
            >
              <Icon icon={X} size={12} />
            </button>
          </span>
        )),
      )}
      <button type="button" onClick={url.clearFilters} className="font-bold text-fg underline underline-offset-2">
        {t("filters.clear")}
      </button>
    </div>
  );
}

export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <p className="text-xs font-bold text-fg-secondary">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center rounded-pill px-3 text-xs font-semibold transition-colors",
        pressed ? "bg-scope-soft text-scope-deep" : "text-fg-secondary inset-ring inset-ring-outline hover:text-fg",
      )}
    >
      <bdi>{children}</bdi>
    </button>
  );
}
