import { MyBalancesScreen } from "@/features/social/balances/my-balances-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-17 · My balances */
export default function Page() {
  return <MyBalancesScreen />;
}
