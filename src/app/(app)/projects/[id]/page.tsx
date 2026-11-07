import { ProjectOverviewScreen } from "@/features/projects/overview/overview-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-01 · Project overview: /projects/[id] (inside the project gate). */
export default function ProjectOverviewPage() {
  return <ProjectOverviewScreen />;
}
