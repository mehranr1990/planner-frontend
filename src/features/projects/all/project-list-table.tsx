"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Progress } from "@/design-system/feedback/progress";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import type { ProjectSummary } from "@/data/project-domain";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProjectLabels } from "../labels";
import { ProjectStatusChip } from "../project-visuals";
import { useMilestoneLine } from "./project-card";

/*
 * PJ-00 List view (segmented): Project · Status · Progress · Next milestone ·
 * My role · For you. A plain table in a quiet utility card; rows are never
 * notched. The project name links to the project.
 */
export function ProjectListTable({ projects }: { projects: readonly ProjectSummary[] }) {
  const t = useTranslations("Projects.list");
  return (
    <UtilityCard className="overflow-x-auto p-2">
      <table className="w-full min-w-160 border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{t("label")}</caption>
        <thead>
          <tr className="text-start text-xs font-semibold text-fg-secondary">
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t("project")}
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              {t("status")}
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              {t("progress")}
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              {t("milestone")}
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              {t("role")}
            </th>
            <th scope="col" className="px-4 py-3 text-end font-semibold">
              {t("forYou")}
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <ProjectListRow key={project.id} project={project} />
          ))}
        </tbody>
      </table>
    </UtilityCard>
  );
}

function ProjectListRow({ project }: { project: ProjectSummary }) {
  const tCard = useTranslations("Projects.card");
  const labels = useProjectLabels();
  const format = useProjectFormat();
  const milestone = useMilestoneLine(project);
  return (
    <tr className="[&>td]:border-t [&>td]:border-line">
      <td className="px-4 py-3.5 font-bold text-fg">
        <Link href={projectHref(project.id)} className="rounded-pill hover:underline">
          <bdi>{project.name}</bdi>
        </Link>
      </td>
      <td className="px-3 py-3.5">
        <ProjectStatusChip health={project.health} lifecycle={project.lifecycle} />
      </td>
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-2">
          <span className="w-9 text-xs font-semibold tabular">{format.progress(project.progress)}</span>
          <Progress
            value={project.progress.percent}
            size="sm"
            className="w-16"
            label={tCard("progress", { project: project.name })}
            valueText={format.progress(project.progress)}
          />
        </div>
      </td>
      <td className={cn("px-3 py-3.5 text-xs font-semibold", milestone.overdue ? "text-danger-text" : "text-fg")}>
        <bdi>{milestone.text}</bdi>
      </td>
      <td className="px-3 py-3.5 text-xs font-medium text-fg">{labels.role(project.role)}</td>
      <td className="px-4 py-3.5 text-end text-xs font-semibold tabular">
        {project.forYou > 0 ? format.number(project.forYou) : tCard("none")}
      </td>
    </tr>
  );
}
