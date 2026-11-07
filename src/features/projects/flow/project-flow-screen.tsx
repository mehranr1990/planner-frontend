"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Direction } from "radix-ui";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { ProjectWorkflow, WorkflowStatus } from "@/data/project-domain";
import { useProjectStatusCounts, useProjectWorkflow } from "@/data/project-queries";
import { projectHref } from "@/features/navigation/contexts";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { TaskViewSwitch, useTasksUrlState } from "../tasks/task-view-shared";
import { useWorkflowStatusLabel, WorkflowStatusChip } from "../workflow-status-chip";
import { layoutFlow, NODE_H, NODE_W } from "./flow-layout";

/*
 * PJ-06 · Workflow view (/projects/[id]/flow), the Flow view mode of Tasks.
 * Read-only graph of the published workflow: status nodes with current
 * counts, arrows = allowed transitions (aria-hidden SVG); screen readers and
 * keyboards get the table under it with the same data. A status opens the
 * List filtered by it. "Edit in Settings" only when Settings is visible to
 * the user (Admin+). Phones (D18): no graph, the table only. RTL mirrors the
 * geometry through coordinates, never a CSS flip.
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

  if (!workflow.data || !counts.data) {
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
