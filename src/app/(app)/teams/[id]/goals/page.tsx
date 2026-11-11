import { TeamGoalsScreen } from "@/features/teams/goals/team-goals-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-07 · Team goals: /teams/[id]/goals (?period · ?goal), inside the team gate. */
export default function TeamGoalsPage() {
  return <TeamGoalsScreen />;
}
