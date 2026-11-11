"use client";

import { Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TeamTask, TeamTaskSource } from "@/data/team-domain";
import { projectHref, teamHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";

/*
 * SourceChip (TM-01 / TM-02): where a task lives — "Team" in the team indigo,
 * or the project name in Projects blue (only ever for a project the viewer
 * can open; the repository never returns others). Never colour alone: the
 * chip always carries its label.
 */
export function SourceChip({ source, className }: { source: TeamTaskSource; className?: string }) {
  const t = useTranslations("TeamWork.source");
  const project = source.kind === "project";
  return (
    <span
      data-scope={project ? "project" : "team"}
      data-source={source.kind}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-semibold text-scope-deep",
        className,
      )}
    >
      <Circle aria-hidden size={7} className="shrink-0 fill-current" strokeWidth={0} />
      <bdi className="truncate">{project ? source.projectName : t("team")}</bdi>
    </span>
  );
}

/** Where a task opens: team tasks in the team drawer (TM-15), project tasks in PJ-15 in their project. */
export function teamTaskHref(teamId: string, task: Pick<TeamTask, "id" | "source">): string {
  return task.source.kind === "project"
    ? `${projectHref(task.source.projectId, "tasks")}/${encodeURIComponent(task.id)}`
    : `${teamHref(teamId, "work")}/${encodeURIComponent(task.id)}`;
}
