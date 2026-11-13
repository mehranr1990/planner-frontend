"use client";

import { CalendarDays, Filter, Plus, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Direction } from "radix-ui";
import { CaseFlow } from "@/components/context/case-flow";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { toast } from "@/components/ui/toast";
import { getPlannerNow } from "@/data/clock";
import type { ProjectTask, ProjectWorkflow, WorkflowStatus } from "@/data/project-domain";
import {
  useMilestoneRows,
  useProjectMembers,
  useProjectStatusCounts,
  useProjectTasks,
  useProjectWorkflow,
} from "@/data/project-queries";
import { projectHref } from "@/features/navigation/contexts";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { TaskViewSwitch, useTasksUrlState } from "../tasks/task-view-shared";
import { useWorkflowStatusLabel, WorkflowStatusChip } from "../workflow-status-chip";
import { layoutFlow, NODE_H, NODE_W } from "./flow-layout";
import { buildProjectFlow, flowFilterValue, parseFlowFilter, type FlowRowFacts } from "./flow-model";

/*
 * PJ-06 · Flow view (/projects/[id]/flow), the Flow view mode of Tasks (D20).
 * Main part: filter pills (All open tasks · each milestone · My tasks;
 * default = nearest at-risk milestone, else All; `?flow=`) over the shared
 * CaseFlow of those tasks (columns = workflow statuses, Blocked = row state,
 * lines = dependencies, Done + milestone tiles, notch = members: avatar =
 * filter by person `?person=`, + = assign → List of unassigned). Read-only:
 * rows open the task drawer.
 * Below, the Workflow section: read-only graph of the published workflow
 * (status nodes with counts, arrows = allowed transitions, aria-hidden SVG)
 * and the accessible table with the same data. A status opens the List
 * filtered by it. "Edit in Settings" only when Settings is visible (Admin+).
 * Phones: CaseFlow stacks its columns; no graph, the table only. RTL mirrors
 * the graph through coordinates, never a CSS flip.
 * Live: milestones are unavailable there, so only All / My tasks are offered.
 */

export function ProjectFlowScreen() {
  const t = useTranslations("ProjectTasks");
  const tShell = useTranslations("ContextShell.quickCreate");
  const locale = useLocale();
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const direction = Direction.useDirection();
  const { project, capabilities, demo } = useProject();
  const url = useTasksUrlState();
  const workflow = useProjectWorkflow(project.id);
  const counts = useProjectStatusCounts(project.id, demoAccessOptions(demo));
  const allTasks = useProjectTasks(project.id, { view: "all" }, demoAccessOptions(demo));
  const myTasks = useProjectTasks(project.id, { view: "mine" }, demoAccessOptions(demo));
  const members = useProjectMembers(project.id);
  const milestoneRows = useMilestoneRows(project.id);
  const captionId = useId();

  const header = (
    <ProjectPageHeader
      module="tasks"
      title={t("title")}
      actions={
        <>
          <TaskViewSwitch projectId={project.id} current="flow" query={url.query} />
          {capabilities.createTask ? (
            <Button size="lg" asChild>
              <Link href={`${projectHref(project.id, "tasks")}?add=1`}>
                <Icon icon={Plus} size={18} />
                {t("newTask")}
              </Link>
            </Button>
          ) : null}
        </>
      }
    />
  );

  // Milestones are unavailable in live mode (error) → no milestone pills, never invented ones.
  const milestonesReady = milestoneRows.data !== undefined || milestoneRows.isError;
  if (!workflow.data || !counts.data || !allTasks.data || !myTasks.data || !members.data || !milestonesReady) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const wf = workflow.data;
  const listHref = (status: WorkflowStatus) => `${projectHref(project.id, "tasks")}?status=${encodeURIComponent(status.id)}`;
  const list = new Intl.ListFormat(locale === "fa" ? "fa" : "en", { type: "unit" });
  const who = (status: WorkflowStatus) =>
    wf.transitionRoles?.[status.id] === "assignee"
      ? list.format([t("filters.assignee"), tShell("managerPlus")])
      : tShell("managerPlus");

  return (
    <>
      {header}
      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}

      <TaskCaseFlow
        workflow={wf}
        all={allTasks.data.tasks}
        mine={myTasks.data.tasks}
        members={members.data}
        milestones={milestoneRows.data ?? []}
        canAssign={capabilities.assignTasks}
      />

      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 pt-2">
        <span className="text-xs font-bold tracking-wide text-fg uppercase">{t("caseFlow.workflow")}</span>
        <span className="text-xs text-fg-secondary">{t("caseFlow.workflowHint")}</span>
      </p>

      {/* The graph (not on phones, D18). */}
      <section aria-labelledby={`${captionId}-title`} className="flex flex-col gap-4 rounded-[28px] bg-surface p-5 max-sm:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${captionId}-title`} className="type-title text-fg">
            {t("flow.title", { version: format.number(wf.version), name: wf.name ?? "" })}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {wf.publishedAt ? (
              <span className="rounded-pill bg-subtle px-3 py-1 text-xs font-semibold text-fg-secondary">
                {t("flow.published", {
                  date: format.day(wf.publishedAt.slice(0, 10)),
                  name: wf.publishedBy?.name ?? "",
                })}
              </span>
            ) : null}
            {capabilities.modules.settings ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${projectHref(project.id, "settings")}?tab=workflow`}>{t("flow.edit")}</Link>
              </Button>
            ) : null}
          </div>
        </div>
        <WorkflowGraph workflow={wf} counts={counts.data} rtl={direction === "rtl"} listHref={listHref} />
        <p id={captionId} className="border-t border-outline pt-3 text-xs font-medium text-fg-secondary">
          {t("flow.caption")}
        </p>
      </section>

      <section aria-labelledby={`${captionId}-table`} className="flex flex-col gap-3 rounded-[28px] bg-surface p-5">
        <h2 id={`${captionId}-table`} className="text-sm font-bold text-fg">
          {t("flow.table")}
        </h2>
        <div className="overflow-x-auto rounded-[20px] inset-ring inset-ring-outline">
          <table className="w-full text-start text-sm">
            <thead className="bg-subtle text-xs font-bold text-fg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-start">
                  {t("flow.from")}
                </th>
                <th scope="col" className="px-3 py-2.5 text-start">
                  {t("flow.to")}
                </th>
                <th scope="col" className="px-3 py-2.5 text-start">
                  {t("flow.who")}
                </th>
              </tr>
            </thead>
            <tbody>
              {wf.statuses.map((status) => {
                const targets = (wf.transitions[status.id] ?? [])
                  .map((id) => wf.statuses.find((candidate) => candidate.id === id))
                  .filter((candidate) => candidate !== undefined);
                return (
                  <tr key={status.id} className="border-t border-outline">
                    <th scope="row" className="px-3 py-2.5 text-start font-medium">
                      <Link href={listHref(status)} className="rounded text-fg hover:underline focus-visible:focus-ring">
                        <bdi>{statusLabel(status)}</bdi>
                      </Link>{" "}
                      <span className="text-xs text-fg-muted">{format.number(counts.data[status.id] ?? 0)}</span>
                    </th>
                    <td className="px-3 py-2.5 text-fg-secondary">
                      {targets.length ? (
                        <bdi>{targets.map((target) => statusLabel(target)).join(" · ")}</bdi>
                      ) : (
                        t("flow.none")
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-fg-secondary">{targets.length ? who(status) : t("flow.none")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

interface TaskCaseFlowProps {
  workflow: ProjectWorkflow;
  all: readonly ProjectTask[];
  mine: readonly ProjectTask[];
  members: Parameters<typeof buildProjectFlow>[0]["members"];
  milestones: Parameters<typeof buildProjectFlow>[0]["milestones"];
  canAssign: boolean;
}

/** The CaseFlow board of the filtered tasks (D20). URL-held filter (`flow`) and person (`person`). */
function TaskCaseFlow({ workflow, all, mine, members, milestones, canAssign }: TaskCaseFlowProps) {
  const t = useTranslations("ProjectTasks.caseFlow");
  const tMilestones = useTranslations("Milestones.status");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { project } = useProject();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = parseFlowFilter(params.get("flow"), milestones);
  const person = params.get("person");
  const tasksHref = projectHref(project.id, "tasks");
  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const model = buildProjectFlow({
    workflow,
    all,
    mine,
    members,
    milestones,
    filter,
    person: members.some((member) => member.id === person) ? person : null,
    today: getPlannerNow().slice(0, 10),
    href: (task) => `${tasksHref}/${encodeURIComponent(task.id)}`,
  });

  const filterName =
    filter.kind === "milestone" ? (model.milestone?.milestone.title ?? "") : t(filter.kind === "mine" ? "mine" : "all");
  const listHref =
    filter.kind === "milestone"
      ? `${tasksHref}?milestone=${encodeURIComponent(filter.id)}`
      : filter.kind === "mine"
        ? `${tasksHref}?view=mine`
        : tasksHref;
  const sub = (facts: FlowRowFacts) => {
    const parts: string[] = [];
    if (facts.unassigned) parts.push(t("unassigned"));
    if (facts.waitingOn.length > 0) {
      const titles = facts.waitingOn.join(t("separator"));
      parts.push(facts.blocked ? t("blockedBy", { titles }) : t("needs", { titles }));
    }
    if (facts.pending) parts.push(t("pending"));
    return parts.length ? parts.join(" · ") : undefined;
  };

  const milestone = model.milestone;
  const outcomes = [
    ...model.done.map((task, index) => ({
      id: task.id,
      title: task.title,
      highlighted: index === 0,
      href: `${tasksHref}/${encodeURIComponent(task.id)}`,
      meta: [task.assignees.find((assignee) => assignee.state !== "declined")?.person.name, task.completedAt ? format.day(task.completedAt.slice(0, 10)) : null]
        .filter(Boolean)
        .join(" · "),
    })),
    ...(milestone
      ? [
          {
            id: `milestone-${milestone.milestone.id}`,
            title: milestone.milestone.title,
            href: projectHref(project.id, "milestones"),
            meta: t("milestoneMeta", {
              date: format.day(milestone.milestone.due),
              status: tMilestones(milestone.status),
            }),
          },
        ]
      : []),
  ];

  return (
    <>
      <PillGroup
        label={t("filterLabel")}
        value={flowFilterValue(filter)}
        onValueChange={(value) => setParams({ flow: value, person: null })}
        className="max-sm:overflow-x-auto"
        options={[
          { value: "all", label: t("all") },
          ...milestones.map((row) => ({ value: row.milestone.id, label: row.milestone.title })),
          { value: "mine", label: t("mine") },
        ]}
      />
      <CaseFlow
        scope="project"
        title={t("title", { name: filterName })}
        people={model.people}
        columns={model.columns.map(({ status, rows }) => ({
          id: status.id,
          label: statusLabel(status),
          rows: rows.map(({ facts, ...row }) => ({ ...row, sub: sub(facts) })),
          empty: { title: t("emptyTitle", { status: statusLabel(status) }), hint: t("emptyHint") },
          moreHref: `${listHref}${listHref.includes("?") ? "&" : "?"}status=${encodeURIComponent(status.id)}`,
        }))}
        links={model.links}
        outcomes={outcomes}
        outcomeLabel={milestone ? t("outcomesMilestone") : t("outcomes")}
        selectedPersonId={person}
        onPersonSelect={(id) => setParams({ person: person === id ? null : id })}
        onPersonAction={
          canAssign
            ? () =>
                router.push(
                  filter.kind === "milestone"
                    ? `${tasksHref}?view=unassigned&milestone=${encodeURIComponent(filter.id)}`
                    : `${tasksHref}?view=unassigned`,
                )
            : undefined
        }
        footnote={t("footnote", {
          filter: filterName,
          total: format.number(model.total),
          done: format.number(model.doneCount),
        })}
        actions={
          <>
            <IconButton icon={Filter} label={t("openList")} variant="secondary" onClick={() => router.push(listHref)} />
            <IconButton
              icon={Share2}
              label={t("share")}
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                toast({ title: t("copied") });
              }}
            />
            <Link
              href={projectHref(project.id, "calendar")}
              aria-label={t("calendar")}
              className="inline-flex size-11 items-center justify-center rounded-full bg-surface text-fg inset-ring inset-ring-line hover:bg-subtle focus-visible:focus-ring"
            >
              <Icon icon={CalendarDays} size={18} />
            </Link>
          </>
        }
      />
    </>
  );
}

interface WorkflowGraphProps {
  workflow: ProjectWorkflow;
  counts: Readonly<Record<string, number>>;
  rtl: boolean;
  listHref: (status: WorkflowStatus) => string;
}

/** WorkflowGraph (SVG edges + positioned status nodes). Hidden from assistive tech: the table carries the data. */
export function WorkflowGraph({ workflow, counts, rtl, listHref }: WorkflowGraphProps) {
  const format = useProjectFormat();
  const markerId = useId();
  const layout = layoutFlow(workflow, { rtl });
  return (
    <div aria-hidden="true" data-testid="workflow-graph" className="overflow-x-auto">
      <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
        <svg width={layout.width} height={layout.height} className="absolute inset-0 text-icon-muted">
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              markerEnd={edge.head ? `url(#${markerId})` : undefined}
              markerStart={edge.tail ? `url(#${markerId})` : undefined}
            />
          ))}
        </svg>
        {layout.nodes.map((node) => (
          <Link
            key={node.status.id}
            href={listHref(node.status)}
            tabIndex={-1}
            className="absolute flex items-center justify-between gap-2 rounded-[18px] bg-surface px-3 shadow-island inset-ring inset-ring-outline hover:inset-ring-primary"
            style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
          >
            <WorkflowStatusChip status={node.status} />
            <span className="text-lg font-bold text-fg">{format.number(counts[node.status.id] ?? 0)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
