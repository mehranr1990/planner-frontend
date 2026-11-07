import { ProjectFlowScreen } from "@/features/projects/flow/project-flow-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-06 · Workflow view: /projects/[id]/flow (Tasks view mode; graph + accessible table). */
export default function ProjectFlowPage() {
  return <ProjectFlowScreen />;
}
