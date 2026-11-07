import { AnalyticsScreen } from "@/features/projects/analytics/analytics-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-12 · Analytics: /projects/[id]/analytics. */
export default function ProjectAnalyticsPage() {
  return <AnalyticsScreen />;
}
