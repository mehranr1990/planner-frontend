import { ActivityGoalsRoute } from "@/features/social/live/live-routes";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** Phase 6 live · Activity Social Goals */
export default function Page() {
  return <ActivityGoalsRoute />;
}
