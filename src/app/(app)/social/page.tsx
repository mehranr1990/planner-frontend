import { SocialHomeScreen } from "@/features/social/home/social-home-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-15 · Social home: /social */
export default function Page() {
  return <SocialHomeScreen />;
}
