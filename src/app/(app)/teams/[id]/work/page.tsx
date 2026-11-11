import { TeamWorkScreen } from "@/features/teams/work/team-work-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-02 · Team work: /teams/[id]/work (?view=board · ?view=flow), inside the team gate. */
export default function TeamWorkPage() {
  return <TeamWorkScreen />;
}
