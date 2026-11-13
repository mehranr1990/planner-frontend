import { MembersScreen } from "@/features/social/members/members-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-19 · Group members */
export default function Page() {
  return <MembersScreen />;
}
