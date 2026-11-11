import { PlanningScreen } from "@/features/teams/planning/planning-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-04 · Weekly planning: /teams/[id]/planning (?week · ?tab=review), inside the team gate. */
export default function TeamPlanningPage() {
  return <PlanningScreen />;
}
