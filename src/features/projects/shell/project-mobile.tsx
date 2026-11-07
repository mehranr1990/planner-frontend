"use client";

import { GitBranch, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { NavLink } from "@/components/navigation/nav-link";
import { projectHref } from "@/features/navigation/contexts";
import type { AppContext } from "@/features/navigation/types";
import { useNavItemFilter } from "@/features/navigation/use-nav-state";
import { useOpenProjectSheet } from "../sheets/project-sheet-params";
import { useCurrentProjectAccess } from "../use-current-project";

/*
 * The Projects "More" sheet (SH01 Mobile): inside a project it lists every
 * module that is not in the bottom bar (Timeline, Gantt, Milestones, Risks,
 * Workload, Members, Files, Analytics, Settings) under the project name,
 * capability-filtered like the rail, plus Flow, which opens the workflow
 * table (no graph on phones, D18). No Assistant (AI deferred).
 * On the collection it offers All projects only.
 */
export function ProjectMoreContent({ context, onNavigate }: { context: AppContext; onNavigate: () => void }) {
  const t = useTranslations("ContextShell.more");
  const tNav = useTranslations("Navigation");
  const visible = useNavItemFilter(context);
  const { project } = useCurrentProjectAccess();
  const openSheet = useOpenProjectSheet();
  const items = context.nav.filter((item) => item.mobileOrder === undefined && visible(item));

  return (
    <div className="flex flex-col gap-2" data-scope="project">
      {project ? (
        <p className="px-3.5 pt-1 type-title text-fg">
          <bdi>{project.name}</bdi>
        </p>
      ) : null}
      <ul aria-label={tNav("moreLabel", { context: tNav(context.labelKey) })} className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <NavLink item={item} onNavigate={onNavigate} />
          </li>
        ))}
        {project ? (
          <li>
            <Link
              href={projectHref(project.id, "flow")}
              onClick={onNavigate}
              className="flex h-12 w-full items-center gap-3 rounded-pill px-3.5 text-start text-sm font-medium text-fg transition-colors hover:bg-subtle"
            >
              <Icon icon={GitBranch} className="text-fg-secondary" />
              <span className="min-w-0 flex-1 truncate">{tNav("items.flow")}</span>
            </Link>
          </li>
        ) : null}
      </ul>
      {context.workspaceId ? (
        <p className="px-3.5 pb-1 text-xs font-medium text-fg-muted">{t("phoneHint")}</p>
      ) : (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            onNavigate();
            openSheet("project-new");
          }}
          className="flex h-12 w-full items-center gap-3 rounded-pill px-3.5 text-start text-sm font-medium text-fg transition-colors hover:bg-subtle"
        >
          <Icon icon={Plus} className="text-fg-secondary" />
          <span className="min-w-0 flex-1 truncate">{tNav("contexts.project.add")}</span>
        </button>
      )}
    </div>
  );
}
