import { GroupOverviewScreen } from "@/features/social/group/group-overview-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-04 · Group overview: /social/groups/[id] (inside the group gate) */
export default function Page() {
  return <GroupOverviewScreen />;
}
