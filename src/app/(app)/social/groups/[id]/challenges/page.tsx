import { ChallengesScreen } from "@/features/social/challenges/challenges-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-12 · Challenges */
export default function Page() {
  return <ChallengesScreen />;
}
