import { TeamOverviewScreen } from "@/features/teams/overview/overview-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-01 · Team overview: /teams/[id] (inside the team gate). */
export default function TeamOverviewPage() {
  return <TeamOverviewScreen />;
}
