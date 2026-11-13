import { ActivitiesScreen } from "@/features/social/activities/activities-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-16 · Activities: /social/activities */
export default function Page() {
  return <ActivitiesScreen />;
}
