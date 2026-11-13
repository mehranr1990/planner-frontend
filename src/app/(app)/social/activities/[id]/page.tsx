import { ActivityScreen } from "@/features/social/activity/activity-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-05 · Activity */
export default function Page() {
  return <ActivityScreen />;
}
