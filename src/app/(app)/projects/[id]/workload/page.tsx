import { WorkloadScreen } from "@/features/projects/workload/workload-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-11 · Workload: /projects/[id]/workload (?cell = member-week, ?pick = task to reassign). */
export default function ProjectWorkloadPage() {
  return <WorkloadScreen />;
}
