import { TeamModulePlaceholder } from "@/features/teams/team-module-placeholder";

// Localised from the preferences cookie, like every shell route.
export const instant = false;

/** /teams/[id] — TM-01 Overview (T3). */
export default function TeamOverviewPage() {
  return <TeamModulePlaceholder module="overview" />;
}
