import { TeamAnalyticsScreen } from "@/features/teams/analytics/team-analytics-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-12 · Team analytics: /teams/[id]/analytics, inside the team gate. */
export default function TeamAnalyticsPage() {
  return <TeamAnalyticsScreen />;
}
