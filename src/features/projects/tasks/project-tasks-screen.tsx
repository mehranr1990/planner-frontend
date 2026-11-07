"use client";

import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SearchField } from "@/components/ui/search-field";
import { toast } from "@/components/ui/toast";
import type { ProjectTask } from "@/data/project-domain";
import {
  useProjectMembers,
  useProjectMilestones,
  useProjectPhases,
  useProjectTaskActions,
  useProjectTasks,
  useProjectWorkflow,
} from "@/data/project-queries";
import type { ProjectTaskPatch } from "@/data/project-repositories";
import { RepositoryError } from "@/data/repositories";
import { getPlannerToday } from "@/data/clock";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { useWorkflowStatusLabel } from "../workflow-status-chip";
import { ProjectBulkBar } from "./project-bulk-bar";
import { ProjectTaskAdd } from "./project-task-add";
import { GROUP_OPTIONS, groupProjectTasks, type ProjectTaskGroupBy } from "./project-task-groups";
import { ActiveTaskFilters, TASK_VIEWS, TaskFiltersPopover, TaskViewSwitch, useTasksUrlState } from "./task-view-shared";
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

const VIEWS = TASK_VIEWS;

export function ProjectTasksScreen() {
  const t = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { project, capabilities, demo } = useProject();
  const url = useTasksUrlState();
  const [searchText, setSearchText] = useState(url.search);
  const preview = demoAccessOptions(demo);
  const taskFilters = url.taskFilters;
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

  const filterCount = url.filterCount;

  const header = (
    <ProjectPageHeader
      module="tasks"
      title={t("title")}
      actions={
        <>
          <TaskViewSwitch projectId={project.id} current="list" query={url.query} />
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
        <TaskFiltersPopover
          url={url}
          workflow={workflow.data}
          members={members.data ?? []}
          milestones={milestones.data}
          guest={guest}
        />
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

      <ActiveTaskFilters url={url} workflow={workflow.data} members={members.data ?? []} milestones={milestones.data} />

      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}

      {showEmptyFirstUse ? (
        <EmptyState variant="card" title={t("empty.title")} description={t("empty.description")} titleAs="h2" />
      ) : showFiltered ? (
        <NoResultsState
          variant="card"
          title={t("filtered.title")}
          description={t("filtered.description")}
          primaryAction={
            <Button variant="secondary" onClick={url.clearFilters}>
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
