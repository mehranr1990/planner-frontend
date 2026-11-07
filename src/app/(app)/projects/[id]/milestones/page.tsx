import { MilestonesScreen } from "@/features/projects/milestones/milestones-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-08 · Phases & milestones: /projects/[id]/milestones (?m = selected milestone). */
export default function ProjectMilestonesPage() {
  return <MilestonesScreen />;
}
