"use client";

import { Circle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AvatarGroup } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/design-system/feedback/progress";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import type { TeamTask, TeamTaskStatus } from "@/data/team-domain";
import { useTeamTasks } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";
import { SourceChip, teamTaskHref } from "../source-chip";

/*
 * TM-01 Work tabs (FolderTabsCard): In progress / Review / Blocked. Cards show
 * the source (Team chip in indigo, or Project chip in blue, only for projects
 * the viewer can open), due, priority, title, assignees and checklist
 * progress. Team tasks open the team drawer; project tasks open PJ-15 in
 * their project.
 */

const TABS: readonly { status: TeamTaskStatus; key: "inProgress" | "review" | "blocked" }[] = [
  { status: "in-progress", key: "inProgress" },
  { status: "review", key: "review" },
  { status: "blocked", key: "blocked" },
];

export function WorkTabs({ teamId }: { teamId: string }) {
  const t = useTranslations("Team.work");
  const tasks = useTeamTasks(teamId);
  const tabs: FolderTab[] = TABS.map(({ status, key }) => {
    const list = tasks.data?.filter((task) => task.status === status) ?? [];
    return {
      value: status,
      label: t(key),
      count: tasks.data ? list.length : undefined,
      content: !tasks.data ? (
        <Skeleton className="h-28 rounded-row" />
      ) : list.length === 0 ? (
        <p className="px-1 py-4 text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((task) => (
            <li key={task.id} className="flex">
              <WorkCard teamId={teamId} task={task} />
            </li>
          ))}
        </ul>
      ),
    };
  });
  return <FolderTabsCard label={t("label")} tabs={tabs} defaultValue="in-progress" surface="subtle" />;
}

export const PRIORITY_DOT: Record<NonNullable<TeamTask["priority"]>, string> = {
  urgent: "text-danger",
  high: "text-warning",
  medium: "text-fg-muted",
  low: "text-fg-muted",
};

function WorkCard({ teamId, task }: { teamId: string; task: TeamTask }) {
  const t = useTranslations("Team.work");
  const tWork = useTranslations("TeamWork");
  const format = useProjectFormat();
  return (
    <article className="relative flex w-full flex-col gap-2.5 rounded-row bg-surface p-4 transition-shadow focus-within:shadow-island hover:shadow-island">
      <div className="flex flex-wrap items-center gap-1.5">
        <SourceChip source={task.source} />
        {task.due ? (
          <span className="rounded-pill bg-subtle px-2.5 py-0.5 text-xs font-semibold text-fg">
            {t("due", { date: format.day(task.due) })}
          </span>
        ) : null}
        {task.priority ? (
          <span className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-fg">
            <Circle aria-hidden size={7} strokeWidth={0} className={cn("fill-current", PRIORITY_DOT[task.priority])} />
            {tWork(`priority.${task.priority}`)}
          </span>
        ) : null}
      </div>
      <h3 className="text-sm font-bold text-fg">
        <Link
          href={teamTaskHref(teamId, task)}
          className="outline-none after:absolute after:inset-0 after:rounded-row focus-visible:after:ring-2 focus-visible:after:ring-focus"
        >
          <bdi>{task.title}</bdi>
        </Link>
      </h3>
      <div className="flex items-center gap-2">
        {task.assignees.length > 0 ? (
          <AvatarGroup
            people={task.assignees.map((assignee) => ({ name: assignee.person.name, initials: assignee.person.initials }))}
            max={2}
            size={32}
          />
        ) : null}
        <Progress
          value={task.progress}
          size="sm"
          className="min-w-0 flex-1"
          label={t("progress", { title: task.title })}
          valueText={format.percent(task.progress)}
        />
        <span className="w-9 shrink-0 text-end text-xs font-semibold text-fg-secondary tabular">
          {format.percent(task.progress)}
        </span>
      </div>
    </article>
  );
}
