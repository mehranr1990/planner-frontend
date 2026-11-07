import { ProjectTasksScreen } from "@/features/projects/tasks/project-tasks-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-02 · Project tasks, List view: /projects/[id]/tasks (?view, q, group and filters in the URL). */
export default function ProjectTasksPage() {
  return <ProjectTasksScreen />;
}
