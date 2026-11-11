import { CheckinsScreen } from "@/features/teams/checkins/checkins-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-09 · Check-ins: /teams/[id]/check-ins, inside the team gate. */
export default function TeamCheckinsPage() {
  return <CheckinsScreen />;
}
