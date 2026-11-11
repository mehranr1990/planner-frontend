import { PeopleScreen } from "@/features/teams/people/people-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-08 · People & capacity: /teams/[id]/people, inside the team gate. */
export default function TeamPeoplePage() {
  return <PeopleScreen />;
}
