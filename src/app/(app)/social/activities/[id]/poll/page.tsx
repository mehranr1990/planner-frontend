import { PollScreen } from "@/features/social/activity/poll-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-06 · Poll & free/busy */
export default function Page() {
  return <PollScreen />;
}
