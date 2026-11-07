import { ProjectModulePlaceholder } from "@/features/projects/project-module-placeholder";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-01 · Project overview: /projects/[id] (coming soon until its prompt). */
export default function ProjectOverviewPage() {
  return <ProjectModulePlaceholder module="overview" />;
}
