import { LendingScreen } from "@/features/social/lending/lending-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-10 · Lending & lost/found */
export default function Page() {
  return <LendingScreen />;
}
