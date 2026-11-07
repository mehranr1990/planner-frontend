"use client";

import { Flag } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type {
  ProjectActivity,
  ProjectMilestone,
  ProjectPhase,
  ProjectRisk,
  ProjectWorkflow,
  RiskSeverity,
  WorkloadEntry,
} from "@/data/project-domain";
import { useProjectActivity, useProjectRisks, useProjectWorkload } from "@/data/project-queries";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProjectLabels } from "../labels";
import { useWorkflowStatusLabel } from "../workflow-status-chip";

/*
 * PJ-01 lower sections: "Next milestones" (product card) and the
 * FolderTabsCard of the project object — Activity · Risks & blockers · Team
 * load. Team load is estimates of open tasks in this project only, hidden
 * for roles without the capability (Viewer / Guest).
 */

export function NextMilestones({
  projectId,
  milestones,
  phases,
}: {
  projectId: string;
  milestones: readonly ProjectMilestone[];
  phases: readonly ProjectPhase[];
}) {
  const t = useTranslations("Project.milestones");
  const format = useProjectFormat();
  const upcoming = milestones.filter((milestone) => !milestone.done).slice(0, 3);
  const phaseName = (id: string) => phases.find((phase) => phase.id === id)?.name ?? "";
  return (
    <ProductCard as="section" aria-labelledby="milestones-title" className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="milestones-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <Link
          href={projectHref(projectId, "milestones")}
          className="text-xs font-bold text-fg underline underline-offset-2 hover:text-scope-deep"
        >
          {t("all")}
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {upcoming.map((milestone) => {
            const blocked = milestone.blockedBy !== undefined;
            const isLast = milestone.phaseId === "launch" || milestone.tasksLeft === 0;
            return (
              <li key={milestone.id} className="flex min-h-14 items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
                    blocked ? "bg-danger-soft text-danger-text" : "bg-scope-soft text-scope-deep",
                  )}
                >
                  <Icon icon={Flag} size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <bdi className="truncate text-sm font-bold text-fg">{milestone.title}</bdi>
                  <span
                    className={cn("truncate text-xs font-medium", blocked ? "text-danger-text" : "text-fg-secondary")}
                  >
                    {blocked
                      ? t("blocked", { what: milestone.blockedBy! })
                      : isLast && milestone.phaseId === "launch"
                        ? t("phase", { phase: phaseName(milestone.phaseId) })
                        : t("tasksLeft", {
                            n: format.number(milestone.tasksLeft),
                            phase: phaseName(milestone.phaseId),
                          })}
                  </span>
                </span>
                <span className={cn("shrink-0 text-xs font-bold", blocked ? "text-danger-text" : "text-scope-deep")}>
                  {format.day(milestone.due)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ProductCard>
  );
}

const SEVERITY_CLASS: Record<RiskSeverity, string> = {
  low: "bg-raised text-fg-secondary",
  medium: "bg-warning-soft text-warning-text",
  high: "bg-danger-soft text-danger-text",
  critical: "bg-danger-soft text-danger-text",
};

export function ProjectSectionsTabs({
  projectId,
  workflow,
  showTeamLoad,
}: {
  projectId: string;
  workflow: ProjectWorkflow | undefined;
  showTeamLoad: boolean;
}) {
  const t = useTranslations("Project.tabs");
  const format = useProjectFormat();
  const activity = useProjectActivity(projectId, 6);
  const risks = useProjectRisks(projectId, true);
  const workload = useProjectWorkload(projectId, showTeamLoad);
  const openRisks = risks.data ?? [];

  const tabs: FolderTab[] = [
    {
      value: "activity",
      label: t("activity"),
      content: activity.data ? (
        <ActivityList items={activity.data} workflow={workflow} />
      ) : (
        <Skeleton className="h-32 rounded-row" />
      ),
    },
    {
      value: "risks",
      label: t("risks"),
      count: risks.data ? t("risksCount", { n: format.number(openRisks.length) }) : undefined,
      content: risks.data ? <RiskList risks={openRisks} /> : <Skeleton className="h-24 rounded-row" />,
    },
  ];
  if (showTeamLoad) {
    tabs.push({
      value: "load",
      label: t("load"),
      count: t("loadHint"),
      content: workload.data ? <TeamLoad entries={workload.data} /> : <Skeleton className="h-32 rounded-row" />,
    });
  }
  return <FolderTabsCard label={t("label")} tabs={tabs} defaultValue="activity" />;
}

function ActivityList({
  items,
  workflow,
}: {
  items: readonly ProjectActivity[];
  workflow: ProjectWorkflow | undefined;
}) {
  const t = useTranslations("Project.activity");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const labels = useProjectLabels();
  if (items.length === 0) return <p className="py-4 text-sm text-fg-muted">{t("empty")}</p>;
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const actor = item.actor.id === "me" ? t("you") : item.actor.name;
        let text: string;
        if (item.kind === "status") text = t("status", { actor, status: labels.health(item.health), note: item.note });
        else if (item.kind === "moved")
          text = t("moved", {
            actor,
            task: item.task,
            status: statusLabel(workflow?.statuses.find((status) => status.id === item.status)) || item.status,
          });
        else if (item.kind === "completed") text = t("completed", { actor, task: item.task });
        else text = t("milestone", { actor, title: item.title, date: format.day(item.due) });
        return (
          <li key={item.id} className="flex min-h-12 items-center gap-3">
            <Avatar
              name={item.actor.name}
              initials={item.actor.initials}
              size={32}
              decorative
              className="size-7 text-[0.625rem]"
            />
            <p className="min-w-0 flex-1 text-sm text-fg">
              <bdi>{text}</bdi>
            </p>
            <span className="shrink-0 text-xs font-medium text-fg-muted">{format.relative(item.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function RiskList({ risks }: { risks: readonly ProjectRisk[] }) {
  const t = useTranslations("Project.risks");
  const format = useProjectFormat();
  if (risks.length === 0) return <p className="py-4 text-sm text-fg-muted">{t("empty")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {risks.map((risk) => {
        const parts = [risk.kind === "issue" ? t("issue") : t("risk")];
        if (risk.blocksTasks > 0) parts.push(t("blocks", { n: format.number(risk.blocksTasks) }));
        if (risk.mitigation) parts.push(t("mitigation", { text: risk.mitigation }));
        if (risk.probability) parts.push(t("probability", { level: t(`level.${risk.probability}`) }));
        return (
          <li key={risk.id} className="flex items-center gap-3 rounded-row bg-subtle px-3.5 py-3">
            <span className={cn("shrink-0 rounded-pill px-2.5 py-1 text-xs font-bold", SEVERITY_CLASS[risk.severity])}>
              {t(`severity.${risk.severity}`)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-snug">
              <bdi className="truncate text-sm font-bold text-fg">{risk.title}</bdi>
              <span className="truncate text-xs font-medium text-fg-secondary">{parts.join(" · ")}</span>
            </span>
            <Avatar
              name={risk.owner.name}
              initials={risk.owner.initials}
              size={32}
              className="size-7 text-[0.625rem]"
            />
          </li>
        );
      })}
    </ul>
  );
}

function TeamLoad({ entries }: { entries: readonly WorkloadEntry[] }) {
  const t = useTranslations("Project.load");
  const tActivity = useTranslations("Project.activity");
  const format = useProjectFormat();
  if (entries.length === 0) return <p className="py-4 text-sm text-fg-muted">{t("empty")}</p>;
  const max = Math.max(...entries.map((entry) => Math.max(entry.hours, entry.capacity)));
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => {
          const over = entry.hours > entry.capacity;
          const name = entry.person.id === "me" ? tActivity("you") : entry.person.name;
          return (
            <li key={entry.person.id} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar
                  name={entry.person.name}
                  initials={entry.person.initials}
                  size={32}
                  decorative
                  className="size-6 text-[0.625rem]"
                />
                <bdi className="truncate text-sm font-semibold text-fg">{name}</bdi>
              </span>
              <span
                role="meter"
                aria-label={t("row", {
                  name,
                  hours: format.number(entry.hours),
                  capacity: format.number(entry.capacity),
                })}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={entry.hours}
                className="h-2 overflow-hidden rounded-pill bg-hairline"
              >
                <span
                  className={cn("block h-full rounded-pill", over ? "bg-danger" : "bg-primary")}
                  style={{ width: `${(entry.hours / max) * 100}%` }}
                />
              </span>
              <span className={cn("text-xs font-semibold tabular", over ? "text-danger-text" : "text-fg-secondary")}>
                {t("hours", { hours: format.number(entry.hours), capacity: format.number(entry.capacity) })}
                {over ? <span className="sr-only"> · {t("over")}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-muted">{t("note")}</p>
    </div>
  );
}
