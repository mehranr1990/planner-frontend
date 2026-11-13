import { GroupsScreen } from "@/features/social/groups/groups-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-03 · Groups: /social/groups?tab=mine|discover */
export default function Page() {
  return <GroupsScreen />;
}
