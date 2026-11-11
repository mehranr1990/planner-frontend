import { notFound } from "next/navigation";
import { TeamModulePlaceholder } from "@/features/teams/team-module-placeholder";
import { teamModuleSegments } from "@/features/teams/team-modules";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/**
 * /teams/[id]/<module> for every team module that is not built yet (coming
 * soon); built modules get their own static segment, which wins over this
 * dynamic one. Unknown segments (including "activity") are a 404.
 */
export default async function TeamModulePage({ params }: { params: Promise<{ id: string; module: string }> }) {
  const { module } = await params;
  const item = Object.hasOwn(teamModuleSegments, module) ? teamModuleSegments[module] : undefined;
  if (!item) notFound();
  return <TeamModulePlaceholder module={item} />;
}
