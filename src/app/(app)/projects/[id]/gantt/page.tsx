import { GanttScreen } from "@/features/projects/gantt/gantt-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-05 · Gantt: /projects/[id]/gantt (phones: the Dependencies list, read-only). */
export default function ProjectGanttPage() {
  return <GanttScreen />;
}
