"use client";

import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Filter,
  GitBranch,
  Kanban,
  List,
  Plus,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { EmptyState, NoResultsState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import type { ProjectPriority, ProjectTask } from "@/data/project-domain";
import {
  useProjectMembers,
  useProjectMilestones,
  useProjectPhases,
  useProjectTaskActions,
  useProjectTasks,
  useProjectWorkflow,
} from "@/data/project-queries";
import type { ProjectTaskFilters, ProjectTaskPatch, ProjectTaskView } from "@/data/project-repositories";
import { RepositoryError } from "@/data/repositories";
import { getPlannerToday } from "@/data/clock";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { useWorkflowStatusLabel } from "../workflow-status-chip";
import { ProjectBulkBar } from "./project-bulk-bar";
import { ProjectTaskAdd } from "./project-task-add";
import { GROUP_OPTIONS, groupProjectTasks, type ProjectTaskGroupBy } from "./project-task-groups";
import { PROJECT_ROW_GRID, ProjectTaskRow } from "./project-task-row";

/*
 * PJ-02 · Project tasks, List view (/projects/[id]/tasks). Same grammar as
 * Personal P03 (rows, grouping, filters, BulkBar) with project additions:
 * workflow Status, Assignee with acceptance, Phase grouping, dependency
 * marker. View pills All · My tasks · Unassigned · Overdue · Completed
 * (server counts). Segmented List / Board / Flow are view modes (Board and
 * Flow arrive in Batch B); filters live in the URL so they persist between
 * views. Revision mismatch on save → the SH-02 conflict notice on the row
 * (Compare / Reload). Viewer: read-only rows (no selection, no add). Guest:
 * only granted tasks, no grouping by people.
 */

const VIEWS: readonly ProjectTaskView[] = ["all", "mine", "unassigned", "overdue", "completed"];
const PRIORITIES: readonly ProjectPriority[] = ["urgent", "high", "medium", "low"];
const FILTER_KEYS = ["status", "assignee", "priority", "milestone"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function listParam(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? "").split(",").filter(Boolean);
}

/** URL-held list state (view, search, group, filters) so Board / Flow keep it. */
function useTasksUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const viewParam = params.get("view");
  const view: ProjectTaskView = (VIEWS as readonly string[]).includes(viewParam ?? "")
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
  return {
    view,
    group,
    filters,
    search: params.get("q") ?? "",
    add: params.get("add") === "1",
    query: params.toString(),
    set,
  };
}

export function ProjectTasksScreen() {
  const t = useTranslations("ProjectTasks");
  const router = useRouter();
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { project, capabilities, demo } = useProject();
  const url = useTasksUrlState();
  const [searchText, setSearchText] = useState(url.search);
  const preview = demoAccessOptions(demo);
  const taskFilters: ProjectTaskFilters = {
    statusIds: url.filters.status,
    assigneeIds: url.filters.assignee,
    priorities: url.filters.priority as ProjectPriority[],
    milestoneIds: url.filters.milestone,
  };
  const list = useProjectTasks(project.id, { view: url.view, filters: taskFilters, search: url.search }, preview);
  const workflow = useProjectWorkflow(project.id);
  const phases = useProjectPhases(project.id);
  const milestones = useProjectMilestones(project.id);
  const members = useProjectMembers(project.id);
  const actions = useProjectTaskActions(project.id);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [conflict, setConflict] = useState<{ task: ProjectTask; patch: ProjectTaskPatch; theirs: ProjectTask } | null>(
    null,
  );
  const [comparing, setComparing] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);
  const guest = project.role === "guest";
  const selectable = capabilities.bulkEdit;
  const canAdd = capabilities.createTask;

  // Debounced search into the URL.
  useEffect(() => {
    if (searchText === url.search) return;
    const timer = window.setTimeout(() => url.set({ q: searchText || null }), 250);
    return () => window.clearTimeout(timer);
  }, [searchText, url]);

  // "New task" from the overview arrives with ?add=1.
  useEffect(() => {
    if (url.add) addRef.current?.focus();
  }, [url.add, list.data]);

  const tasks = useMemo(() => list.data?.tasks ?? [], [list.data]);
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const selectedTasks = selected.map((id) => byId.get(id)).filter((task) => task !== undefined);

  const groupBy: ProjectTaskGroupBy = guest && url.group === "assignee" ? "phase" : url.group;
  const groups = useMemo(
    () =>
      workflow.data && phases.data && milestones.data
        ? groupProjectTasks(tasks, groupBy, {
            workflow: workflow.data,
            phases: phases.data,
            milestones: milestones.data,
          })
        : [],
    [tasks, groupBy, workflow.data, phases.data, milestones.data],
  );

  const today = getPlannerToday();
  const currentPhase =
    phases.data?.find((phase) => !phase.done && today >= phase.start && today <= phase.end) ??
    phases.data?.find((phase) => !phase.done);

  const viewHref = (segment: "tasks" | "board" | "flow") =>
    `${projectHref(project.id, segment === "tasks" ? "tasks" : segment)}${url.query ? `?${url.query}` : ""}`;

  const saveStatus = (task: ProjectTask, statusId: string) => {
    const patch = { statusId };
    actions.update.mutate(
      { taskId: task.id, patch, revision: task.revision },
      {
        onError: async (error) => {
          if (error instanceof RepositoryError && error.code === "conflict") {
            setConflict({ task, patch, theirs: await actions.fetchTask(task.id) });
          } else toast({ title: t("error"), tone: "danger" });
        },
      },
    );
  };

  const applyBulk = (patch: ProjectTaskPatch) => {
    const ids = selectedTasks.map((task) => task.id);
    const before = selectedTasks.map((task) => ({ task, patch: undoPatch(task, patch) }));
    actions.bulkUpdate.mutate(
      { taskIds: ids, patch },
      {
        onSuccess: ({ updated }) => {
          setSelected([]);
          toast({
            title: t("bulk.updated", { n: format.number(updated.length) }),
            action: {
              label: t("bulk.undo"),
              altText: t("bulk.undoAlt"),
              onClick: () => {
                for (const { task, patch: back } of before)
                  actions.bulkUpdate.mutate({ taskIds: [task.id], patch: back });
              },
            },
          });
        },
      },
    );
  };

  const filterCount = FILTER_KEYS.reduce((sum, key) => sum + url.filters[key].length, 0);
  const memberName = (id: string) =>
    id === "none" ? t("filters.unassigned") : (members.data?.find((person) => person.id === id)?.name ?? id);
  const filterValueLabel = (key: FilterKey, value: string) => {
    if (key === "status") return statusLabel(workflow.data?.statuses.find((status) => status.id === value)) || value;
    if (key === "assignee") return memberName(value);
    if (key === "priority") return t(`priority.${value as ProjectPriority}`);
    return milestones.data?.find((milestone) => milestone.id === value)?.title ?? value;
  };
  const toggleFilter = (key: FilterKey, value: string) => {
    const current = url.filters[key];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    url.set({ [key]: next.join(",") || null });
  };
  const clearFilters = () => url.set({ status: null, assignee: null, priority: null, milestone: null, q: null });

  const header = (
    <ProjectPageHeader
      module="tasks"
      title={t("title")}
      actions={
        <>
          <Segmented
            label={t("view.label")}
            value="list"
            onValueChange={(value) => {
              if (value !== "list") router.push(viewHref(value === "board" ? "board" : "flow"));
            }}
            options={[
              {
                value: "list",
                label: (
                  <>
                    <Icon icon={List} size={16} />
                    {t("view.list")}
                  </>
                ),
              },
              {
                value: "board",
                label: (
                  <>
                    <Icon icon={Kanban} size={16} />
                    {t("view.board")}
                  </>
                ),
              },
              // Flow is not on phones (D18).
              {
                value: "flow",
                label: (
                  <>
                    <Icon icon={GitBranch} size={16} />
                    {t("view.flow")}
                  </>
                ),
              },
            ]}
            className="max-sm:hidden"
          />
          {canAdd ? (
            <Button size="lg" onClick={() => addRef.current?.focus()}>
              <Icon icon={Plus} size={18} />
              {t("newTask")}
            </Button>
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <IconButton icon={Ellipsis} label={t("more.label")} className="bg-surface" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" data-scope="project">
              {capabilities.importCsv ? <DropdownMenuItem comingSoon>{t("more.import")}</DropdownMenuItem> : null}
              <DropdownMenuItem
                onSelect={() =>
                  exportCsv(tasks, project.name, (task) =>
                    statusLabel(workflow.data?.statuses.find((status) => status.id === task.statusId)),
                  )
                }
              >
                {t("more.export")}
              </DropdownMenuItem>
              <DropdownMenuItem comingSoon>{t("more.templates")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );

  if (!list.data || !workflow.data || !phases.data || !milestones.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const counts = list.data.counts;
  const showEmptyFirstUse =
    demo === "empty" || (counts.all === 0 && filterCount === 0 && !url.search && url.view === "all");
  const showFiltered = demo === "filtered" || (!showEmptyFirstUse && tasks.length === 0);

  return (
    <>
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <PillGroup
          label={t("tab.label")}
          value={url.view}
          onValueChange={(view) => url.set({ view: view === "all" ? null : view })}
          options={VIEWS.map((view) => ({
            value: view,
            label: t(`tab.${view}`),
            // Completed carries no count (P03 grammar).
            ...(view === "completed" ? {} : { count: counts[view] }),
          }))}
        />
        <SearchField
          value={searchText}
          onValueChange={setSearchText}
          placeholder={t("search")}
          aria-label={t("search")}
          className="min-w-44 flex-1 max-sm:order-last max-sm:basis-full"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-2 bg-surface">
              <Icon icon={Filter} size={16} />
              {t("filters.button")}
              {filterCount > 0 ? (
                <span className="rounded-pill bg-scope-soft px-1.5 text-xs font-bold text-scope-deep">
                  {format.number(filterCount)}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" aria-label={t("filters.title")} className="w-80" data-scope="project">
            <div className="flex flex-col gap-3">
              <FilterSection label={t("filters.status")}>
                {workflow.data.statuses.map((status) => (
                  <FilterChip
                    key={status.id}
                    pressed={url.filters.status.includes(status.id)}
                    onClick={() => toggleFilter("status", status.id)}
                  >
                    {statusLabel(status)}
                  </FilterChip>
                ))}
              </FilterSection>
              {!guest ? (
                <FilterSection label={t("filters.assignee")}>
                  {[...(members.data ?? []).map((person) => person.id), "none"].map((id) => (
                    <FilterChip
                      key={id}
                      pressed={url.filters.assignee.includes(id)}
                      onClick={() => toggleFilter("assignee", id)}
                    >
                      {memberName(id)}
                    </FilterChip>
                  ))}
                </FilterSection>
              ) : null}
              <FilterSection label={t("filters.priority")}>
                {PRIORITIES.map((priority) => (
                  <FilterChip
                    key={priority}
                    pressed={url.filters.priority.includes(priority)}
                    onClick={() => toggleFilter("priority", priority)}
                  >
                    {t(`priority.${priority}`)}
                  </FilterChip>
                ))}
              </FilterSection>
              <FilterSection label={t("filters.milestone")}>
                {milestones.data.map((milestone) => (
                  <FilterChip
                    key={milestone.id}
                    pressed={url.filters.milestone.includes(milestone.id)}
                    onClick={() => toggleFilter("milestone", milestone.id)}
                  >
                    {milestone.title}
                  </FilterChip>
                ))}
              </FilterSection>
            </div>
          </PopoverContent>
        </Popover>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-2 bg-surface">
              <Icon icon={ArrowDownUp} size={16} />
              {t("group.label", { group: t(`group.${groupBy}`) })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-scope="project">
            <DropdownMenuRadioGroup
              value={groupBy}
              onValueChange={(value) => url.set({ group: value === "phase" ? null : value })}
            >
              {GROUP_OPTIONS.filter((option) => !(guest && option === "assignee")).map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  {t(`group.${option}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs font-semibold text-fg-secondary">
          <span>{t("filters.active")}</span>
          {FILTER_KEYS.flatMap((key) =>
            url.filters[key].map((value) => (
              <span
                key={`${key}-${value}`}
                className="inline-flex items-center gap-1 rounded-pill bg-scope-soft py-0.5 ps-2.5 pe-1 text-scope-deep"
              >
                <bdi>{t("filters.chip", { label: t(`filters.${key}`), value: filterValueLabel(key, value) })}</bdi>
                <button
                  type="button"
                  aria-label={t("filters.remove", { value: filterValueLabel(key, value) })}
                  onClick={() => toggleFilter(key, value)}
                  className="inline-flex size-5 items-center justify-center rounded-full hover:bg-surface"
                >
                  <Icon icon={X} size={12} />
                </button>
              </span>
            )),
          )}
          <button type="button" onClick={clearFilters} className="font-bold text-fg underline underline-offset-2">
            {t("filters.clear")}
          </button>
        </div>
      ) : null}

      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}

      {showEmptyFirstUse ? (
        <EmptyState variant="card" title={t("empty.title")} description={t("empty.description")} titleAs="h2" />
      ) : showFiltered ? (
        <NoResultsState
          variant="card"
          title={t("filtered.title")}
          description={t("filtered.description")}
          primaryAction={
            <Button variant="secondary" onClick={clearFilters}>
              {t("filters.clear")}
            </Button>
          }
        />
      ) : (
        <section
          aria-label={t("title")}
          className="flex flex-col gap-1 rounded-product bg-surface p-2 lg:p-3 max-lg:bg-transparent max-lg:p-0"
        >
          <div
            aria-hidden="true"
            className={cn(
              "grid items-center gap-x-3 px-2 pb-1 text-xs font-semibold text-fg-secondary max-lg:hidden",
              PROJECT_ROW_GRID,
            )}
          >
            <span />
            <span>{t("columns.task")}</span>
            <span>{t("columns.status")}</span>
            <span>{t("columns.assignee")}</span>
            <span>{t("columns.due")}</span>
            <span>{t("columns.est")}</span>
            <span>{t("columns.priority")}</span>
          </div>
          {groups.map((group) => {
            const allDone = group.open === 0;
            const isCollapsed = collapsed[group.id] ?? (groupBy === "phase" && allDone);
            const label =
              groupBy === "status"
                ? statusLabel(group.status)
                : (group.label ??
                  (groupBy === "assignee"
                    ? t("group.nobody")
                    : groupBy === "milestone"
                      ? t("group.noMilestone")
                      : groupBy === "phase"
                        ? t("group.noPhase")
                        : t("group.all")));
            const phase = group.phase;
            const metaText = allDone
              ? t("group.allDone", { n: format.number(group.done) })
              : group.done > 0
                ? t("group.meta", { open: format.number(group.open), done: format.number(group.done) })
                : t("group.count", { n: format.number(group.open) });
            const dates = phase
              ? phase.start > today
                ? t("group.starts", { date: format.day(phase.start) })
                : format.range(phase.start, phase.end)
              : null;
            return (
              <div key={group.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-label={t("group.toggle", { group: label })}
                  onClick={() => setCollapsed((current) => ({ ...current, [group.id]: !isCollapsed }))}
                  className="flex min-h-10 items-center gap-2 rounded-row px-2 text-start text-sm transition-colors hover:bg-subtle"
                >
                  <Icon
                    icon={isCollapsed ? ChevronRight : ChevronDown}
                    size={16}
                    mirror={isCollapsed}
                    className="text-fg-secondary"
                  />
                  <bdi className="font-bold text-fg">{label}</bdi>
                  <span className="text-xs font-semibold text-fg-secondary">{metaText}</span>
                  {dates ? <span className="text-xs font-medium text-fg-muted">· {dates}</span> : null}
                  {isCollapsed && allDone ? (
                    <span className="text-xs font-medium text-fg-muted">{t("group.collapsed")}</span>
                  ) : null}
                </button>
                {isCollapsed ? null : (
                  <ul className="flex flex-col gap-1 max-lg:gap-2">
                    {group.tasks.map((task) => (
                      <ProjectTaskRow
                        key={`${group.id}-${task.id}`}
                        task={task}
                        projectId={project.id}
                        workflow={workflow.data!}
                        milestones={milestones.data!}
                        selectable={selectable}
                        selected={selected.includes(task.id)}
                        onToggleSelected={() =>
                          setSelected((current) =>
                            current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id],
                          )
                        }
                        canChangeStatus={capabilities.changeStatus}
                        onStatus={(statusId) => saveStatus(task, statusId)}
                        conflict={
                          conflict?.task.id === task.id ? (
                            <ConflictNotice
                              person={conflict.theirs.assignees[0]?.person.name ?? "—"}
                              task={task.title}
                              status={statusLabel(
                                workflow.data!.statuses.find((status) => status.id === conflict.theirs.statusId),
                              )}
                              onCompare={() => setComparing(true)}
                              onReload={() => {
                                setConflict(null);
                                void list.refetch();
                              }}
                            />
                          ) : demo === "conflict" && task.id === "checkout-flow" ? (
                            <ConflictNotice
                              person="Sara P."
                              task={task.title}
                              status={statusLabel(workflow.data!.statuses.find((status) => status.id === "in-review"))}
                              onReload={() => void list.refetch()}
                            />
                          ) : undefined
                        }
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {canAdd && currentPhase ? (
            <ProjectTaskAdd
              phase={currentPhase}
              members={members.data ?? []}
              busy={actions.create.isPending}
              inputRef={addRef}
              onCreate={(input) =>
                actions.create.mutate(input, {
                  onSuccess: (task) =>
                    toast({
                      title: t("add.added", { phase: currentPhase.name }),
                      description:
                        task.assignees[0]?.state === "pending"
                          ? t("add.pendingFor", { name: task.assignees[0].person.name })
                          : undefined,
                    }),
                })
              }
            />
          ) : null}
        </section>
      )}

      {selectable ? (
        <ProjectBulkBar
          tasks={selectedTasks}
          workflow={workflow.data}
          phases={phases.data}
          members={members.data ?? []}
          onApply={applyBulk}
          onDelete={() =>
            actions.remove.mutate(
              selectedTasks.map((task) => task.id),
              {
                onSuccess: () => {
                  toast({ title: t("bulk.deleted", { n: format.number(selectedTasks.length) }) });
                  setSelected([]);
                },
              },
            )
          }
          onClear={() => setSelected([])}
        />
      ) : null}

      {conflict ? (
        <Dialog open={comparing} onOpenChange={setComparing}>
          <DialogContent title={t("compare.title")} size="md">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-fg-secondary">
                  <th scope="col" className="py-2 text-start font-semibold">
                    {t("compare.field")}
                  </th>
                  <th scope="col" className="py-2 text-start font-semibold">
                    {t("compare.mine")}
                  </th>
                  <th scope="col" className="py-2 text-start font-semibold">
                    {t("compare.theirs")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {conflict.patch.statusId !== undefined ? (
                  <tr className="border-t border-line">
                    <th scope="row" className="py-2 text-start font-semibold">
                      {t("columns.status")}
                    </th>
                    <td className="py-2">
                      <bdi>
                        {statusLabel(workflow.data.statuses.find((status) => status.id === conflict.patch.statusId))}
                      </bdi>
                    </td>
                    <td className="py-2">
                      <bdi>
                        {statusLabel(workflow.data.statuses.find((status) => status.id === conflict.theirs.statusId))}
                      </bdi>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setComparing(false);
                  setConflict(null);
                  void list.refetch();
                }}
              >
                {t("compare.keepTheirs")}
              </Button>
              <Button
                onClick={() => {
                  const { theirs, patch } = conflict;
                  setComparing(false);
                  setConflict(null);
                  actions.update.mutate({ taskId: theirs.id, patch, revision: theirs.revision });
                }}
              >
                {t("compare.keepMine")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/** The patch that puts a task back the way it was before `patch` (bulk Undo). */
function undoPatch(task: ProjectTask, patch: ProjectTaskPatch): ProjectTaskPatch {
  const back: ProjectTaskPatch = {};
  if (patch.statusId !== undefined) back.statusId = task.statusId;
  if (patch.phaseId !== undefined) back.phaseId = task.phaseId;
  if (patch.due !== undefined) back.due = task.due;
  if (patch.assigneeIds !== undefined)
    back.assigneeIds = task.assignees.filter((a) => a.state !== "declined").map((a) => a.person.id);
  return back;
}

function exportCsv(tasks: readonly ProjectTask[], projectName: string, status: (task: ProjectTask) => string) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [
    ["Title", "Status", "Assignees", "Due", "Estimate (h)", "Priority"],
    ...tasks.map((task) => [
      task.title,
      status(task),
      task.assignees.map((assignee) => assignee.person.name).join("; "),
      task.due ?? "",
      task.estimateHours?.toString() ?? "",
      task.priority,
    ]),
  ];
  const blob = new Blob([rows.map((row) => row.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${projectName} tasks.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <p className="text-xs font-bold text-fg-secondary">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
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

/** SH-02 conflict notice on a row: never overwrite silently — Compare or Reload. */
function ConflictNotice({
  person,
  task,
  status,
  onCompare,
  onReload,
}: {
  person: string;
  task: string;
  status: string;
  onCompare?: () => void;
  onReload: () => void;
}) {
  const tAccess = useTranslations("Access.states.conflict");
  return (
    <div
      role="alert"
      data-slot="row-conflict"
      className="mx-2 mb-1 flex flex-wrap items-center gap-3 rounded-row bg-warning-soft px-3 py-2 text-sm text-warning-text"
    >
      <span className="min-w-0 flex-1">
        <strong className="font-bold">{tAccess("title")}</strong> ·{" "}
        <bdi>{tAccess("description", { person, task, status })}</bdi>
      </span>
      {onCompare ? (
        <Button variant="secondary" size="sm" className="bg-surface" onClick={onCompare}>
          {tAccess("compare")}
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" className="bg-surface" onClick={onReload}>
        {tAccess("reload")}
      </Button>
    </div>
  );
}
