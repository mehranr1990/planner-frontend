import { TeamPlanningRoute } from "@/features/teams/planning/planning-route";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/**
 * TM-04 · Weekly planning (?week · ?tab=review) or, with Sprints on, TM-05 ·
 * Sprint & backlog (?tab=sprint·backlog·reviews): /teams/[id]/planning, inside the team gate.
 */
export default function TeamPlanningPage() {
  return <TeamPlanningRoute />;
}
