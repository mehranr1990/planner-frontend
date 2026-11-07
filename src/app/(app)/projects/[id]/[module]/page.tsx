import { notFound } from "next/navigation";
import { ProjectModulePlaceholder } from "@/features/projects/project-module-placeholder";
import { projectModuleSegments } from "@/features/projects/project-modules";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/**
 * /projects/[id]/<module> for every project module that is not built yet
 * (coming soon); built modules get their own static segment, which wins over
 * this dynamic one. Unknown segments are a 404.
 */
export default async function ProjectModulePage({ params }: { params: Promise<{ id: string; module: string }> }) {
  const { module } = await params;
  const item = Object.hasOwn(projectModuleSegments, module) ? projectModuleSegments[module] : undefined;
  if (!item) notFound();
  return <ProjectModulePlaceholder module={item} />;
}
