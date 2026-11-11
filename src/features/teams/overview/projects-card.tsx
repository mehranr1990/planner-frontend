"use client";

import { Circle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useTeamProjects } from "@/data/team-queries";
import { projectHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { ProjectStatusChip } from "@/features/projects/project-visuals";

/*
 * TM-01 Projects (product card): projects linked to the team that the viewer
 * can open, in Projects blue, with progress and status. No hidden count:
 * the "n you can open" line counts exactly the rows shown.
 */
export function ProjectsCard({ teamId }: { teamId: string }) {
  const t = useTranslations("Team.projects");
  const format = useProjectFormat();
  const projects = useTeamProjects(teamId);

  return (
    <ProductCard as="section" aria-labelledby="team-projects-title" className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="team-projects-title" className="type-title text-fg">
          {t("title")}
        </h2>
        {projects.data && projects.data.length > 0 ? (
          <span className="text-xs font-medium text-fg-secondary">
            {t("count", { n: format.number(projects.data.length) })}
          </span>
        ) : null}
      </div>
      {!projects.data ? (
        <Skeleton className="h-24 rounded-row" />
      ) : projects.data.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3" data-scope="project">
          {projects.data.map((project) => (
            <li key={project.id} className="flex items-center gap-3">
              <Link
                href={projectHref(project.id)}
                className="inline-flex max-w-44 shrink-0 items-center gap-1.5 rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-semibold text-scope-deep hover:underline"
              >
                <Circle aria-hidden size={7} className="shrink-0 fill-current" strokeWidth={0} />
                <bdi className="truncate">{project.name}</bdi>
              </Link>
              <Progress
                value={project.percent}
                size="sm"
                className="min-w-0 flex-1"
                label={t("progress", { project: project.name })}
                valueText={format.percent(project.percent)}
              />
              <span className="w-10 shrink-0 text-end text-xs font-semibold tabular">{format.percent(project.percent)}</span>
              <ProjectStatusChip health={project.health} lifecycle={project.lifecycle} />
            </li>
          ))}
        </ul>
      )}
    </ProductCard>
  );
}
