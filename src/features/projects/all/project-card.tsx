"use client";

import { Flag } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AvatarGroup } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type { ProjectSummary } from "@/data/project-domain";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProjectLabels } from "../labels";
import { ProjectStatusChip, ProjectTile } from "../project-visuals";

/*
 * PJ-00 project card (product card, no notch): initials tile, name, my role,
 * status chip, one-line description, % + bar (tasks done / total), next
 * milestone (red when overdue), date range, member avatars (max 3 + n),
 * "n for you" (my open accepted + pending assignments), updated time.
 * Phones keep the compact anatomy (PJM01): name, role, status, bar,
 * milestone and "n for you". The whole card opens the project (stretched link).
 */

export function useMilestoneLine(project: ProjectSummary): { text: string; overdue: boolean } {
  const t = useTranslations("Projects.card");
  const format = useProjectFormat();
  if (project.lifecycle === "paused") {
    return {
      text:
        project.lifecycleBy?.id === "me" ? t("pausedByYou") : t("pausedBy", { name: project.lifecycleBy?.name ?? "" }),
      overdue: false,
    };
  }
  const milestone = project.nextMilestone;
  if (!milestone) return { text: t("none"), overdue: false };
  const days = format.daysFromToday(milestone.due);
  if (days < 0) return { text: t("overdue", { title: milestone.title, days: format.number(-days) }), overdue: true };
  return { text: t("milestone", { title: milestone.title, date: format.day(milestone.due) }), overdue: false };
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const t = useTranslations("Projects.card");
  const labels = useProjectLabels();
  const format = useProjectFormat();
  const milestone = useMilestoneLine(project);
  const paused = project.lifecycle === "paused";

  return (
    <ProductCard
      as="article"
      className={cn(
        "relative gap-3 transition-shadow focus-within:shadow-island hover:shadow-island",
        paused && "bg-subtle",
      )}
    >
      <div className="flex items-start gap-3">
        <ProjectTile
          initials={project.initials}
          tint={project.tint}
          muted={paused}
          className="max-sm:size-9 max-sm:text-xs"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate type-title text-fg">
            <Link
              href={projectHref(project.id)}
              className="rounded-pill outline-none after:absolute after:inset-0 after:rounded-product focus-visible:after:ring-2 focus-visible:after:ring-focus"
            >
              <bdi>{project.name}</bdi>
            </Link>
          </h2>
          <span className="truncate text-xs font-medium text-fg-secondary">
            <span className="max-sm:hidden">{t("you", { role: labels.role(project.role) })}</span>
            <span className="sm:hidden">{labels.role(project.role)}</span>
          </span>
        </div>
        <ProjectStatusChip health={project.health} lifecycle={project.lifecycle} />
      </div>

      <p className="truncate text-sm text-fg-secondary max-sm:hidden">
        <bdi>{project.description}</bdi>
      </p>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
          <span className="text-fg tabular">{format.progress(project.progress)}</span>
          <span className="text-fg-secondary tabular max-sm:hidden">
            {t("tasks", { done: format.number(project.progress.done), total: format.number(project.progress.total) })}
          </span>
        </div>
        <Progress
          value={project.progress.percent}
          size="sm"
          label={t("progress", { project: project.name })}
          valueText={format.progress(project.progress)}
          indicatorClassName={paused ? "bg-fg-muted" : undefined}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
        <span className={cn("flex min-w-0 items-center gap-1.5", milestone.overdue ? "text-danger-text" : "text-fg")}>
          <Icon
            icon={Flag}
            size={14}
            className={cn("shrink-0 max-sm:hidden", milestone.overdue ? "" : "text-icon-muted")}
          />
          <bdi className="truncate">{milestone.text}</bdi>
        </span>
        <span className="shrink-0 text-fg-secondary max-sm:hidden">
          {paused ? t("none") : format.range(project.startDate, project.endDate)}
        </span>
        {project.forYou > 0 ? (
          <span className="shrink-0 rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep sm:hidden">
            {t("forYou", { n: format.number(project.forYou) })}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3 max-sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <AvatarGroup
            people={project.members.map((member) => ({ name: member.name, initials: member.initials }))}
            max={3}
            size={32}
            label={t("members", { project: project.name })}
          />
          {project.forYou > 0 ? (
            <span className="rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">
              {t("forYou", { n: format.number(project.forYou) })}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-xs font-medium text-fg-muted">
          {t("updated", { time: format.relative(project.updatedAt) })}
        </span>
      </div>
    </ProductCard>
  );
}
