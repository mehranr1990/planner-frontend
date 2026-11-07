import { TimelineScreen } from "@/features/projects/timeline/timeline-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-04 · Timeline: /projects/[id]/timeline (lanes by phase or assignee; phones: grouped list). */
export default function ProjectTimelinePage() {
  return <TimelineScreen />;
}
