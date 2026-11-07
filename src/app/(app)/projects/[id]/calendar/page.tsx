import { ProjectCalendarScreen } from "@/features/projects/calendar/project-calendar-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-07 · Project calendar: /projects/[id]/calendar (?date, ?view, ?cal like Personal P04). */
export default function ProjectCalendarPage() {
  return <ProjectCalendarScreen />;
}
